/**
 * Edge cases against the real KRNL0 server (server-sync.md "Edge cases"):
 *   - a website that speaks another protocol than the server (versions differ)
 *   - a session that ends while the page has unsent edits; the next login sends them
 *   - a board too large for the server: paused with the reason, the rest syncs
 *   - the server restored from a backup: everyone takes the restored board,
 *     and an edit made while it was down is kept
 *   - the server's certificate changed: the desktop stops and asks to connect again
 *
 * Needs the krnl0-server checkout next to this repo (or KRNL0_SERVER_DIR) with
 * `npm run build` done; skipped otherwise.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import https from 'https';
import { createServer } from 'net';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import WebSocket from 'ws';
import { SyncService, type SecretBox } from '../../src/main/sync/service';
import { seedBoard, saveBoardTo, migrateBoard } from '../../src/main/persistence/board';
import { switchBoard } from '../../src/main/persistence/boards';
import { stripDevice, docName } from '../../src/shared/sync/shape';
import { SyncEngine } from '../../src/shared/sync/engine';
import { memoryKv, type Kv } from '../../src/web/sync/kv';
import { WebHost } from '../../src/web/sync/host';
import { WebSyncStore } from '../../src/web/sync/store';
import { WebTransport } from '../../src/web/sync/transport';
import { createWebBridge } from '../../src/web/bridge';

const SERVER_DIR = process.env.KRNL0_SERVER_DIR ?? resolve(__dirname, '..', '..', '..', 'krnl0-server');
const SERVER_BIN = join(SERVER_DIR, 'bin', 'krnl0.js');
const available = existsSync(join(SERVER_DIR, 'dist', 'cli', 'main.js'));
const PASSWORD = 'correct horse battery staple';
const secrets: SecretBox = { available: () => true, seal: (s) => `sealed:${s}`, open: (s) => s.replace(/^sealed:/, '') };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let serverData = '';
let port = 0;
let server: ChildProcess | null = null;
let caPem = '';
const origin = (): string => `https://localhost:${port}`;

function freePort(): Promise<number> {
  return new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });
}
function serverEnv(): NodeJS.ProcessEnv {
  return { ...process.env, KRNL0_DATA_DIR: serverData, KRNL0_PORT: String(port), KRNL0_UPDATE_CHECK: 'off', KRNL0_BIND: '127.0.0.1', KRNL0_HOSTS: 'localhost', TZ: 'Europe/Berlin' };
}
const cli = (...args: string[]) => spawnSync(process.execPath, [SERVER_BIN, ...args], { env: serverEnv(), encoding: 'utf-8' });

async function startServer(): Promise<void> {
  server = spawn(process.execPath, [SERVER_BIN, 'start'], { env: serverEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise<void>((res, rej) => {
    const t = setTimeout(() => rej(new Error('server did not start')), 20_000);
    server!.stdout!.on('data', (d: Buffer) => { if (d.toString().includes('KRNL0 server')) { clearTimeout(t); res(); } });
    server!.on('exit', (code) => { clearTimeout(t); rej(new Error(`server exited ${code}`)); });
  });
  caPem = await new Promise<string>((res, rej) => {
    https.get(`${origin()}/ca.crt`, { rejectUnauthorized: false }, (r) => { const c: Buffer[] = []; r.on('data', (x: Buffer) => c.push(x)); r.on('end', () => res(Buffer.concat(c).toString('utf8'))); }).on('error', rej);
  });
}
function stopServer(): Promise<void> {
  return new Promise((res) => {
    if (!server || server.exitCode !== null) { res(); return; }
    server.once('exit', () => res());
    server.kill('SIGTERM');
  });
}

function caFetch(url: string | URL | Request, init?: RequestInit): Promise<Response> {
  return new Promise((resolveRes, reject) => {
    const u = new URL(String(url));
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => { headers[k] = v; });
    let body: Buffer | undefined;
    if (typeof init?.body === 'string') body = Buffer.from(init.body, 'utf8');
    else if (init?.body instanceof Uint8Array) body = Buffer.from(init.body);
    if (body) headers['content-length'] = String(body.length);
    const req = https.request(u, { method: init?.method ?? 'GET', headers, ca: caPem, checkServerIdentity: () => undefined }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const h = new Headers();
        for (const [k, v] of Object.entries(res.headers)) if (typeof v === 'string') h.set(k, v); else if (Array.isArray(v)) h.set(k, v.join(', '));
        resolveRes(new Response(res.statusCode === 204 ? null : Buffer.concat(chunks), { status: res.statusCode ?? 0, headers: h }));
      });
    });
    req.on('error', reject);
    init?.signal?.addEventListener('abort', () => req.destroy(new Error('aborted')));
    if (body) req.write(body);
    req.end();
  });
}

async function login(): Promise<{ cookie: string; csrf: string }> {
  const r = await caFetch(`${origin()}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin() }, body: JSON.stringify({ password: PASSWORD }) });
  expect(r.status).toBe(200);
  return { cookie: (r.headers.get('set-cookie') ?? '').split(';')[0]!, csrf: ((await r.json()) as { csrf: string }).csrf };
}

interface Desk { dir: string; svc: SyncService; states: string[] }
interface Browser { kv: Kv; host: WebHost; store: WebSyncStore; engine: SyncEngine; bridge: ReturnType<typeof createWebBridge>; cookie: string; csrf: string }
const desks: Desk[] = [];
const browsers: Browser[] = [];

function makeDesk(boardId: string, board: Record<string, unknown>): Desk {
  const dir = mkdtempSync(join(tmpdir(), 'krnl0-edges-desk-'));
  writeFileSync(join(dir, 'boards.json'), JSON.stringify({ version: 1, activeId: boardId, boards: [{ id: boardId, name: 'Main' }] }, null, 2));
  saveBoardTo(join(dir, 'board.json'), board);
  const d: Desk = { dir, svc: null as unknown as SyncService, states: [] };
  d.svc = new SyncService({
    boardDir: dir, userDataDir: dir, appVersion: '0.13.0-sim', secrets,
    notifyBoardChanged: () => {}, switchToBoard: (id) => typeof switchBoard(dir, id) !== 'string',
    onStatus: (i) => { d.states.push(`${i.state}:${i.message ?? ''}`); },
  });
  desks.push(d);
  return d;
}

/** A browser; `kv` given = the same browser again (its IndexedDB kept). `protocol` overrides the hello. */
async function makeBrowser(opts: { kv?: Kv; protocol?: number } = {}): Promise<Browser> {
  const { cookie, csrf } = await login();
  const kv = opts.kv ?? memoryKv();
  const all = await kv.loadAll();
  const host = new WebHost(kv); host.load(all);
  const store = new WebSyncStore(kv); store.load(all);
  const at = origin();
  class CookieSocket extends WebSocket {
    constructor(url: string) { super(url, { headers: { Cookie: cookie, Origin: at }, ca: caPem, checkServerIdentity: () => undefined }); }
    send(data: unknown): void {
      // An older or newer website: the same hello with another protocol number.
      if (opts.protocol !== undefined && typeof data === 'string' && data.includes('"hello"')) data = data.replace(/"protocol":\d+/, `"protocol":${opts.protocol}`);
      super.send(data as string);
    }
  }
  const transport = new WebTransport({ origin: at, csrf, appVersion: '0.13.0-sim', fetch: caFetch as unknown as typeof fetch, WebSocket: CookieSocket as unknown as typeof globalThis.WebSocket, headers: { Cookie: cookie, Origin: at } });
  const engine = new SyncEngine({ transport, host, store, debounceMs: 100 });
  const bridge = createWebBridge({ host, engine, store, transport, appVersion: '0.13.0-sim', origin: at, flush: async () => {}, reload: () => {}, logout: async () => { engine.stop(); } });
  engine.start();
  const b: Browser = { kv, host, store, engine, bridge, cookie, csrf };
  browsers.push(b);
  return b;
}

type B = Record<string, unknown> & { nodes: Array<Record<string, unknown>> };
const task = (id: string) => ({ id, kind: 'task', position: { x: 0, y: 0 }, state: { title: id, done: false }, config: {} });
const deskBoard = (d: Desk): B => JSON.parse(readFileSync(join(d.dir, 'board.json'), 'utf-8')) as B;
const deskIds = (d: Desk): string[] => (stripDevice('board:x', migrateBoard(deskBoard(d))) as B).nodes.map((n) => n.id as string);
const webIds = (b: Browser): string[] => ((b.host.activeBoard() as B | null)?.nodes ?? []).map((n) => n.id as string);
const deskEdit = (d: Desk, fn: (b: B) => void): void => { const b = deskBoard(d); fn(b); saveBoardTo(join(d.dir, 'board.json'), b); };
async function pageEdit(b: Browser, fn: (x: B) => void): Promise<void> { const x = (await b.bridge.boardLoad()) as B; fn(x); await b.bridge.boardSave(x); }
async function until(cond: () => boolean, ms = 25_000): Promise<boolean> {
  const end = Date.now() + ms;
  while (!cond()) { if (Date.now() > end) return false; await sleep(150); }
  return true;
}

describe.skipIf(!available)('edge cases against the real server', () => {
  beforeAll(async () => {
    serverData = mkdtempSync(join(tmpdir(), 'krnl0-edges-server-'));
    port = await freePort();
    const setup = spawnSync(process.execPath, [SERVER_BIN, 'setup', '--yes', '--password-stdin', '--website', 'on', '--app-sync', 'on', '--tls', 'self-signed', '--hosts', 'localhost', '--tz', 'Europe/Berlin'], { env: serverEnv(), input: PASSWORD, encoding: 'utf-8' });
    if (setup.status !== 0) throw new Error(`setup failed: ${setup.stderr}`);
    await startServer();
    const real = seedBoard() as B;
    real.nodes = [...real.nodes, task('t1')];
    const desk = makeDesk('main', real);
    await desk.svc.begin(origin());
    await desk.svc.finish(PASSWORD);
    expect(await until(() => desk.svc.info().state === 'synced')).toBe(true);
  }, 60_000);

  afterAll(async () => {
    for (const b of browsers) b.engine.stop();
    for (const d of desks) d.svc.stop();
    await stopServer();
    for (const d of desks) rmSync(d.dir, { recursive: true, force: true });
    if (serverData) rmSync(serverData, { recursive: true, force: true });
  });

  it('versions differ: a website speaking another protocol stops and says to reload', async () => {
    const old = await makeBrowser({ protocol: 99 });
    expect(await until(() => old.engine.getStatus().state === 'update')).toBe(true);
    expect(old.engine.getStatus().message).toMatch(/Reload the page/);
    expect(old.engine.getStatus().message).not.toMatch(/update/i);
    old.engine.stop();
  }, 60_000);

  it('a session that ends keeps the page\'s unsent edit; the next login sends it', async () => {
    const [desk] = desks as [Desk];
    const web = await makeBrowser();
    expect(await until(() => webIds(web).includes('t1'))).toBe(true);
    // The session ends (logged out elsewhere / expired): the server closes it.
    const out = await caFetch(`${origin()}/api/v1/auth/logout`, { method: 'POST', headers: { Cookie: web.cookie, Origin: origin(), 'X-KRNL0-CSRF': web.csrf } });
    expect(out.status).toBe(200);
    expect(await until(() => web.engine.getStatus().state === 'signed-out')).toBe(true);
    await pageEdit(web, (x) => { x.nodes.push(task('typed-while-signed-out')); });
    await sleep(500);
    expect(deskIds(desk)).not.toContain('typed-while-signed-out');
    // Log in again in the same browser (its IndexedDB kept): the edit goes up.
    web.engine.stop();
    const again = await makeBrowser({ kv: web.kv });
    expect(webIds(again)).toContain('typed-while-signed-out');
    expect(await until(() => deskIds(desk).includes('typed-while-signed-out'))).toBe(true);
  }, 60_000);

  it('a board too large for the server pauses with the reason; the others keep syncing', async () => {
    const [desk] = desks as [Desk];
    const web = browsers[browsers.length - 1]!;
    const idx = web.host.list()!;
    const big = migrateBoard(seedBoard()) as B;
    big.nodes.push({ id: 'huge', kind: 'text', position: { x: 0, y: 0 }, state: { text: 'x'.repeat(21 * 1024 * 1024) }, config: {} });
    web.host.saveBoard('big', big as never);
    web.host.saveIndex({ ...idx, boards: [...idx.boards, { id: 'big', name: 'Big' }] });
    web.engine.changed('boards');
    web.engine.changed(docName.board('big'));
    expect(await until(() => web.engine.getStatus().state === 'paused', 40_000)).toBe(true);
    expect(web.engine.getStatus().message).toMatch(/too large/);
    // The main board still syncs.
    await pageEdit(web, (x) => { x.nodes.push(task('after-the-big-one')); });
    expect(await until(() => deskIds(desk).includes('after-the-big-one'))).toBe(true);
    web.engine.stop();
  }, 90_000);

  it('server restored from a backup: everyone takes it; an edit made while it was down is kept', async () => {
    const [desk] = desks as [Desk];
    const made = cli('backup');
    expect(made.status, made.stderr).toBe(0);
    const name = /Backup made: (\S+)/.exec(made.stdout)?.[1];
    expect(name).toBeTruthy();
    deskEdit(desk, (x) => { x.nodes.push(task('after-backup')); });
    expect(await until(() => desk.svc.info().state === 'synced' && deskIds(desk).includes('after-backup'))).toBe(true);
    await sleep(600);
    await stopServer();
    const restored = cli('restore', name!, '--yes');
    expect(restored.status, restored.stderr).toBe(0);
    deskEdit(desk, (x) => { x.nodes.push(task('while-server-down')); });
    await startServer();
    await desk.svc.retry();
    expect(await until(() => desk.svc.info().state === 'synced', 40_000)).toBe(true);
    // A fresh browser sees exactly what the server now holds.
    const web = await makeBrowser();
    expect(await until(() => webIds(web).includes('while-server-down'), 40_000)).toBe(true);
    expect(webIds(web)).toContain('t1');
    expect(deskIds(desk)).toContain('while-server-down');
    // The restore is what counts: what was added after the backup is gone everywhere.
    expect(await until(() => !deskIds(desk).includes('after-backup'))).toBe(true);
    expect(webIds(web)).not.toContain('after-backup');
    web.engine.stop();
  }, 120_000);

  it('the server\'s certificate changed: the desktop stops and asks to connect again', async () => {
    const [desk] = desks as [Desk];
    await stopServer();
    rmSync(join(serverData, 'tls'), { recursive: true, force: true }); // a new certificate authority on start
    await startServer();
    expect(await until(() => desk.svc.info().state === 'signed-out', 40_000)).toBe(true);
    expect(desk.svc.info().message).toMatch(/certificate/);
  }, 90_000);
});
