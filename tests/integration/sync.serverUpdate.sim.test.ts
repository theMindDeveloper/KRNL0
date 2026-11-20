/**
 * Server updates from the app, against the real KRNL0 server (server-updates
 * F1–F7, server F24/F30/F31): the desktop app and a browser read how the server
 * updates, send the one-click update with the owner's password, and switch night
 * updates. The updater itself is the server repo's own tests; here its status
 * file stands in for it.
 *
 * Needs the krnl0-server checkout next to this repo (or KRNL0_SERVER_DIR) with
 * `npm run build` done; skipped otherwise.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import https from 'https';
import { createServer } from 'net';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { SyncService, type SecretBox } from '../../src/main/sync/service';
import { seedBoard, saveBoardTo } from '../../src/main/persistence/board';
import { switchBoard } from '../../src/main/persistence/boards';
import { DOCKER_INSTALL } from '../../src/shared/sync/serverUpdate';
import { memoryKv } from '../../src/web/sync/kv';
import { WebHost } from '../../src/web/sync/host';
import { WebSyncStore } from '../../src/web/sync/store';
import { WebTransport } from '../../src/web/sync/transport';
import { SyncEngine } from '../../src/shared/sync/engine';
import { createWebBridge } from '../../src/web/bridge';

const SERVER_DIR = process.env.KRNL0_SERVER_DIR ?? resolve(__dirname, '..', '..', '..', 'krnl0-server');
const SERVER_BIN = join(SERVER_DIR, 'bin', 'krnl0.js');
const available = existsSync(join(SERVER_DIR, 'dist', 'update', 'info.js'));
const PASSWORD = 'correct horse battery staple';
const secrets: SecretBox = { available: () => true, seal: (s) => `sealed:${s}`, open: (s) => s.replace(/^sealed:/, '') };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Run { data: string; update: string; port: number; proc: ChildProcess; caPem: string; origin: string }
const runs: Run[] = [];
const dirs: string[] = [];

function freePort(): Promise<number> {
  return new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });
}

async function startServer(env: Record<string, string>): Promise<Run> {
  const data = mkdtempSync(join(tmpdir(), 'krnl0-upd-server-'));
  const update = join(data, 'update-volume');
  const port = await freePort();
  const full = { ...process.env, KRNL0_DATA_DIR: data, KRNL0_PORT: String(port), KRNL0_UPDATE_CHECK: 'off', KRNL0_BIND: '127.0.0.1', KRNL0_HOSTS: 'localhost', TZ: 'Europe/Berlin', KRNL0_UPDATE_DIR: update, ...env };
  const setup = spawnSync(process.execPath, [SERVER_BIN, 'setup', '--yes', '--password-stdin', '--website', 'on', '--app-sync', 'on', '--tls', 'self-signed', '--hosts', 'localhost', '--tz', 'Europe/Berlin'], { env: full, input: PASSWORD, encoding: 'utf-8' });
  if (setup.status !== 0) throw new Error(`setup failed: ${setup.stderr}`);
  const proc = spawn(process.execPath, [SERVER_BIN, 'start'], { env: full, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise<void>((res, rej) => {
    const t = setTimeout(() => rej(new Error('server did not start')), 20_000);
    proc.stdout!.on('data', (d: Buffer) => { if (d.toString().includes('KRNL0 server')) { clearTimeout(t); res(); } });
    proc.on('exit', (code) => { clearTimeout(t); rej(new Error(`server exited ${code}`)); });
  });
  const origin = `https://localhost:${port}`;
  const caPem = await new Promise<string>((res, rej) => {
    https.get(`${origin}/ca.crt`, { rejectUnauthorized: false }, (r) => { const c: Buffer[] = []; r.on('data', (x: Buffer) => c.push(x)); r.on('end', () => res(Buffer.concat(c).toString('utf8'))); }).on('error', rej);
  });
  const run = { data, update, port, proc, caPem, origin };
  runs.push(run);
  return run;
}

/** The updater's heartbeat (the real one writes this file every minute). */
function updaterAlive(run: Run, job: Record<string, unknown> = { state: 'idle', step: null, from: null, to: null, message: null, at: new Date().toISOString(), auto: false }): void {
  mkdirSync(run.update, { recursive: true });
  writeFileSync(join(run.update, 'status.json'), JSON.stringify({ updater: { kind: 'docker', version: '0.2.0', aliveAt: new Date().toISOString() }, job }));
}

async function desk(run: Run): Promise<SyncService> {
  const dir = mkdtempSync(join(tmpdir(), 'krnl0-upd-desk-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'boards.json'), JSON.stringify({ version: 1, activeId: 'main', boards: [{ id: 'main', name: 'Main' }] }));
  saveBoardTo(join(dir, 'board.json'), seedBoard());
  const svc = new SyncService({ boardDir: dir, userDataDir: dir, appVersion: '0.14.0-sim', secrets, notifyBoardChanged: () => {}, switchToBoard: (id) => typeof switchBoard(dir, id) !== 'string', onStatus: () => {} });
  await svc.begin(run.origin);
  await svc.finish(PASSWORD);
  return svc;
}

function caFetch(run: Run) {
  return (url: string | URL | Request, init?: RequestInit): Promise<Response> => new Promise((resolveRes, reject) => {
    const u = new URL(String(url));
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => { headers[k] = v; });
    const body = typeof init?.body === 'string' ? Buffer.from(init.body, 'utf8') : undefined;
    if (body) headers['content-length'] = String(body.length);
    const req = https.request(u, { method: init?.method ?? 'GET', headers, ca: run.caPem, checkServerIdentity: () => undefined }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const h = new Headers();
        for (const [k, v] of Object.entries(res.headers)) if (typeof v === 'string') h.set(k, v); else if (Array.isArray(v)) h.set(k, v.join(', '));
        resolveRes(new Response(res.statusCode === 204 ? null : Buffer.concat(chunks), { status: res.statusCode ?? 0, headers: h }));
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function browser(run: Run) {
  const f = caFetch(run);
  const r = await f(`${run.origin}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: run.origin }, body: JSON.stringify({ password: PASSWORD }) });
  const cookie = (r.headers.get('set-cookie') ?? '').split(';')[0]!;
  const csrf = ((await r.json()) as { csrf: string }).csrf;
  const kv = memoryKv();
  const host = new WebHost(kv); host.load(await kv.loadAll());
  const store = new WebSyncStore(kv); store.load(await kv.loadAll());
  const transport = new WebTransport({ origin: run.origin, csrf, appVersion: '0.14.0-sim', fetch: f as unknown as typeof fetch, WebSocket: class { constructor() { throw new Error('no socket in this test'); } } as unknown as typeof globalThis.WebSocket, headers: { Cookie: cookie, Origin: run.origin } });
  const engine = new SyncEngine({ transport, host, store, debounceMs: 100 });
  return createWebBridge({ host, engine, store, transport, appVersion: '0.14.0-sim', origin: run.origin, flush: async () => {}, reload: () => {}, logout: async () => {} });
}

describe.skipIf(!available)('server updates from the app, against the real server', () => {
  let withUpdater: Run;
  let plain: Run;
  beforeAll(async () => {
    withUpdater = await startServer({ KRNL0_UPDATER: 'docker' });
    plain = await startServer({ KRNL0_IN_DOCKER: '1' });
  }, 60_000);
  afterAll(async () => {
    for (const r of runs) { r.proc.kill('SIGTERM'); await sleep(300); rmSync(r.data, { recursive: true, force: true }); }
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  it('desktop: one click with the right password makes the request; a wrong one says so and makes none', async () => {
    updaterAlive(withUpdater);
    const svc = await desk(withUpdater);
    const u = await svc.serverUpdate();
    expect(u?.channel).toBe('one-click');
    const wrong = await svc.startServerUpdate('wrong password, sorry');
    expect(wrong).toMatchObject({ ok: false, message: 'Wrong password or code.' });
    expect(existsSync(join(withUpdater.update, 'request'))).toBe(false);
    const ok = await svc.startServerUpdate(PASSWORD);
    expect(ok.ok).toBe(true);
    expect(existsSync(join(withUpdater.update, 'request'))).toBe(true);
    rmSync(join(withUpdater.update, 'request'), { force: true });
    svc.stop();
  }, 30_000);

  it('desktop: the updater’s job (running, rolled back) reaches the app with its reason', async () => {
    updaterAlive(withUpdater, { state: 'rolled-back', step: null, from: '0.1.0', to: '0.2.0', message: 'The new version did not answer within 90 seconds. Your server is back on 0.1.0. Nothing was lost.', at: new Date().toISOString(), auto: false });
    const svc = await desk(withUpdater);
    const u = await svc.serverUpdate();
    expect(u?.job?.state).toBe('rolled-back');
    expect(u?.job?.message).toMatch(/Nothing was lost/);
    svc.stop();
  }, 30_000);

  it('website: a wrong password is a message, not a logged-out page; the right one makes the request', async () => {
    updaterAlive(withUpdater);
    const b = await browser(withUpdater);
    const wrong = await b.syncServerUpdate!('wrong password, sorry');
    expect(wrong).toMatchObject({ ok: false, message: 'Wrong password or code.' });
    const ok = await b.syncServerUpdate!(PASSWORD);
    expect(ok.ok).toBe(true);
    expect(existsSync(join(withUpdater.update, 'request'))).toBe(true);
    rmSync(join(withUpdater.update, 'request'), { force: true });
  }, 30_000);

  it('night updates: on with the password, and every device sees it', async () => {
    // Its own server: the others used up part of the login limit (10 password checks per 15 minutes).
    const own = await startServer({ KRNL0_UPDATER: 'docker' });
    const b = await browser(own);
    expect((await b.syncServerAuto!(true, PASSWORD)).ok).toBe(true);
    const svc = await desk(own);
    expect((await svc.serverUpdate())?.auto).toBe(true);
    expect((await b.syncServerAuto!(false, PASSWORD)).ok).toBe(true);
    svc.stop();
  }, 30_000);

  it('plain docker run: no one click, the one-command installer instead, and the request is refused', async () => {
    const svc = await desk(plain);
    const u = await svc.serverUpdate();
    expect(u).toMatchObject({ channel: 'command', command: DOCKER_INSTALL });
    const r = await svc.startServerUpdate(PASSWORD);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/plain docker run/);
    expect(existsSync(join(plain.update, 'request'))).toBe(false);
    svc.stop();
  }, 30_000);
});
