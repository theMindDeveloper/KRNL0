/**
 * Web + desktop simulation (server-sync.md NF7, Decision 51): the real KRNL0
 * server in its own process, one desktop device (real SyncService) and two
 * browsers running the web app's real sync code (WebTransport, WebHost,
 * WebSyncStore, the web window.krnl bridge, the shared SyncEngine), logged in
 * with the session cookie and CSRF token like a browser. One browser's
 * WebSocket is blocked (a phone that refuses a self-signed socket): it must
 * still follow every change by polling.
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
import { appendTimeLog, readTimeLog } from '../../src/main/persistence/timelog';
import { stripDevice, sameContent, docName } from '../../src/shared/sync/shape';
import { SyncEngine } from '../../src/shared/sync/engine';
import { memoryKv } from '../../src/web/sync/kv';
import { WebHost } from '../../src/web/sync/host';
import { WebSyncStore } from '../../src/web/sync/store';
import { WebTransport } from '../../src/web/sync/transport';
import { createWebBridge } from '../../src/web/bridge';

const SERVER_DIR = process.env.KRNL0_SERVER_DIR ?? resolve(__dirname, '..', '..', '..', 'krnl0-server');
const SERVER_BIN = join(SERVER_DIR, 'bin', 'krnl0.js');
const available = existsSync(join(SERVER_DIR, 'dist', 'cli', 'main.js'));
const PASSWORD = 'correct horse battery staple';
const secrets: SecretBox = { available: () => true, seal: (s) => `sealed:${s}`, open: (s) => s.replace(/^sealed:/, '') };

function freePort(): Promise<number> {
  return new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });
}

let serverData = '';
let port = 0;
let server: ChildProcess | null = null;
let caPem = '';
const origin = (): string => `https://localhost:${port}`;

function serverEnv(): NodeJS.ProcessEnv {
  return { ...process.env, KRNL0_DATA_DIR: serverData, KRNL0_PORT: String(port), KRNL0_UPDATE_CHECK: 'off', KRNL0_BIND: '127.0.0.1', KRNL0_HOSTS: 'localhost', TZ: 'Europe/Berlin' };
}

async function startServer(): Promise<void> {
  server = spawn(process.execPath, [SERVER_BIN, 'start'], { env: serverEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise<void>((res, rej) => {
    const t = setTimeout(() => rej(new Error('server did not start')), 20_000);
    server!.stdout!.on('data', (d: Buffer) => { if (d.toString().includes('KRNL0 server')) { clearTimeout(t); res(); } });
    server!.on('exit', (code) => { clearTimeout(t); rej(new Error(`server exited ${code}`)); });
  });
}

function killServer(): Promise<void> {
  return new Promise((res) => {
    if (!server || server.exitCode !== null) { res(); return; }
    server.once('exit', () => res());
    server.kill('SIGKILL');
  });
}

/** A fetch for Node that trusts only the test server's own CA (like a browser that installed /ca.crt). */
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
        const status = res.statusCode ?? 0;
        resolveRes(new Response(status === 204 ? null : Buffer.concat(chunks), { status, headers: h }));
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
  const cookie = (r.headers.get('set-cookie') ?? '').split(';')[0]!;
  const { csrf } = (await r.json()) as { csrf: string };
  return { cookie, csrf };
}

// ── Devices ────────────────────────────────────────────────────────────────

interface Desk { kind: 'desk'; name: string; dir: string; svc: SyncService }
interface Browser {
  kind: 'web'; name: string; host: WebHost; engine: SyncEngine; bridge: ReturnType<typeof createWebBridge>;
  reloads: number; boardChanged: number; logouts: number;
}
type Device = Desk | Browser;
const desks: Desk[] = [];
const browsers: Browser[] = [];

function makeDesk(name: string, boardId: string, board: Record<string, unknown>): Desk {
  const dir = mkdtempSync(join(tmpdir(), `krnl0-websim-${name}-`));
  writeFileSync(join(dir, 'boards.json'), JSON.stringify({ version: 1, activeId: boardId, boards: [{ id: boardId, name: 'Main' }] }, null, 2));
  saveBoardTo(join(dir, 'board.json'), board);
  const svc = new SyncService({
    boardDir: dir, userDataDir: dir, appVersion: '0.13.0-sim', secrets,
    notifyBoardChanged: () => {}, switchToBoard: (id) => typeof switchBoard(dir, id) !== 'string', onStatus: () => {},
  });
  const d: Desk = { kind: 'desk', name, dir, svc };
  desks.push(d);
  return d;
}

/** A WebSocket that always fails to open (the phone case). */
class BlockedSocket {
  readyState = 3;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { setTimeout(() => this.onclose?.({ code: 1006 }), 20); }
  send(): void {}
  close(): void {}
}

async function makeBrowser(name: string, opts: { blockSocket?: boolean } = {}): Promise<Browser> {
  const { cookie, csrf } = await login();
  const kv = memoryKv();
  const host = new WebHost(kv);
  const store = new WebSyncStore(kv);
  const at = origin();
  class CookieSocket extends WebSocket {
    constructor(url: string) { super(url, { headers: { Cookie: cookie, Origin: at }, ca: caPem, checkServerIdentity: () => undefined }); }
  }
  const transport = new WebTransport({
    origin: at, csrf, appVersion: '0.13.0-sim',
    fetch: caFetch as unknown as typeof fetch,
    WebSocket: (opts.blockSocket ? BlockedSocket : CookieSocket) as unknown as typeof globalThis.WebSocket,
    headers: { Cookie: cookie, Origin: at },
  });
  const engine = new SyncEngine({ transport, host, store, debounceMs: 100 });
  const b: Browser = { kind: 'web', name, host, engine, bridge: null as unknown as Browser['bridge'], reloads: 0, boardChanged: 0, logouts: 0 };
  b.bridge = createWebBridge({
    host, engine, store, transport, appVersion: '0.13.0-sim', origin: at,
    flush: async () => {}, reload: () => { b.reloads++; }, // As the page does (web/main.tsx): sync stops at once, then the copy is wiped.
    logout: async () => { b.logouts++; engine.stop(); },
  });
  b.bridge.onBoardChanged(() => { b.boardChanged++; });
  engine.start();
  browsers.push(b);
  return b;
}

// ── Reading and editing ────────────────────────────────────────────────────

const deskBoard = (d: Desk): Record<string, unknown> => JSON.parse(readFileSync(join(d.dir, 'board.json'), 'utf-8')) as Record<string, unknown>;
const synced = (d: Device): unknown => {
  if (d.kind === 'desk') return stripDevice('board:x', migrateBoard(deskBoard(d)));
  const b = d.host.activeBoard();
  return b === null ? null : stripDevice('board:x', b);
};
const stateOf = (d: Device): string => (d.kind === 'desk' ? d.svc.info().state : d.engine.getStatus().state);
type B = Record<string, unknown> & { nodes: Array<Record<string, unknown>> };
const deskEdit = (d: Desk, fn: (b: B) => void): void => { const b = deskBoard(d) as B; fn(b); saveBoardTo(join(d.dir, 'board.json'), b); };
/** What the page does: load, change, save through window.krnl. */
async function pageEdit(b: Browser, fn: (x: B) => void): Promise<void> {
  const x = (await b.bridge.boardLoad()) as B;
  fn(x);
  await b.bridge.boardSave(x);
}
const ids = (d: Device): string[] => ((synced(d) as { nodes?: Array<{ id: string }> } | null)?.nodes ?? []).map((n) => n.id);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function converged(ds: Device[], timeoutMs = 25_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const first = synced(ds[0]!);
    if (first !== null && ds.every((d) => sameContent(synced(d), first)) && ds.every((d) => stateOf(d) === 'synced')) return;
    if (Date.now() > until) throw new Error(`not converged: ${ds.map((d) => `${d.name}=${stateOf(d)} nodes=${ids(d).length}`).join(', ')}`);
    await sleep(150);
  }
}

const task = (id: string, title: string) => ({ id, kind: 'task', position: { x: 0, y: 0 }, state: { title, done: false }, config: {} });

describe.skipIf(!available)('web app + desktop sync against the real server (NF7)', () => {
  beforeAll(async () => {
    serverData = mkdtempSync(join(tmpdir(), 'krnl0-websim-server-'));
    port = await freePort();
    const setup = spawnSync(process.execPath, [SERVER_BIN, 'setup', '--yes', '--password-stdin', '--website', 'on', '--app-sync', 'on', '--tls', 'self-signed', '--hosts', 'localhost', '--tz', 'Europe/Berlin'], { env: serverEnv(), input: PASSWORD, encoding: 'utf-8' });
    if (setup.status !== 0) throw new Error(`setup failed: ${setup.stderr}`);
    await startServer();
    caPem = await new Promise<string>((res, rej) => {
      https.get(`${origin()}/ca.crt`, { rejectUnauthorized: false }, (r) => { const c: Buffer[] = []; r.on('data', (x: Buffer) => c.push(x)); r.on('end', () => res(Buffer.concat(c).toString('utf8'))); }).on('error', rej);
    });
  }, 60_000);

  afterAll(async () => {
    for (const b of browsers) b.engine.stop();
    for (const d of desks) d.svc.stop();
    await killServer();
    for (const d of desks) rmSync(d.dir, { recursive: true, force: true });
    if (serverData) rmSync(serverData, { recursive: true, force: true });
  });

  it('a browser with nothing stored takes the desktop\'s boards, by socket and by polling', async () => {
    const real = seedBoard() as B;
    real.nodes = [...real.nodes, task('t1', 'Read chapter 4'), task('t2', 'Gym')];
    const desk = makeDesk('desk', 'main', real);
    await desk.svc.begin(origin());
    await desk.svc.finish(PASSWORD);
    await converged([desk]);
    const web = await makeBrowser('web');
    const phone = await makeBrowser('phone', { blockSocket: true });
    await converged([desk, web, phone]);
    for (const b of [web, phone]) {
      expect(b.host.list()?.boards.map((x) => x.id)).toEqual(['main']);
      expect(b.host.activeId()).toBe('main');
      expect(ids(b)).toEqual(expect.arrayContaining(['t1', 't2']));
    }
  }, 60_000);

  it('an edit in the web app reaches the desktop, and the desktop\'s reaches both browsers', async () => {
    const [desk] = desks as [Desk];
    const [web, phone] = browsers as [Browser, Browser];
    await pageEdit(web, (x) => { x.nodes.push(task('w1', 'added on the web')); });
    await converged([desk, web, phone]);
    expect(ids(desk)).toContain('w1');
    const before = web.boardChanged;
    deskEdit(desk, (x) => { x.nodes.push(task('d1', 'added on the desktop')); });
    await converged([desk, web, phone]);
    expect(ids(web)).toContain('d1');
    expect(ids(phone)).toContain('d1');
    expect(web.boardChanged).toBeGreaterThan(before); // the open page was told to reload the board
  }, 60_000);

  it('the same moment on all three: every edit survives', async () => {
    const [desk] = desks as [Desk];
    const [web, phone] = browsers as [Browser, Browser];
    deskEdit(desk, (x) => { x.nodes.push(task('c-desk', 'desk')); });
    await pageEdit(web, (x) => { x.nodes.push(task('c-web', 'web')); });
    await pageEdit(phone, (x) => { const n = x.nodes.find((n) => n.id === 't2')!; (n.state as Record<string, unknown>).done = true; });
    await converged([desk, web, phone], 40_000);
    expect(ids(desk)).toEqual(expect.arrayContaining(['c-desk', 'c-web']));
    const gym = (synced(desk) as { nodes: Array<{ id: string; state: { done: boolean } }> }).nodes.find((n) => n.id === 't2');
    expect(gym?.state.done).toBe(true);
  }, 60_000);

  it('a page saving an old copy after sync changed the board merges instead of undoing the other edit', async () => {
    const [desk] = desks as [Desk];
    const [web, phone] = browsers as [Browser, Browser];
    const page = (await web.bridge.boardLoad()) as B; // the page holds this copy
    deskEdit(desk, (x) => { x.nodes.push(task('s-desk', 'arrives while the page is open')); });
    const until = Date.now() + 20_000;
    while (!ids(web).includes('s-desk') && Date.now() < until) await sleep(100);
    expect(ids(web)).toContain('s-desk');
    page.nodes.push(task('s-page', 'typed on the stale page'));
    await web.bridge.boardSave(page); // without the guard this would drop s-desk
    await converged([desk, web, phone], 40_000);
    expect(ids(desk)).toEqual(expect.arrayContaining(['s-desk', 's-page']));
  }, 60_000);

  it('this browser\'s view (zoom, position) stays in this browser', async () => {
    const [desk] = desks as [Desk];
    const [web, phone] = browsers as [Browser, Browser];
    await web.bridge.boardSaveViewport({ x: 4321, y: 8765, zoom: 1.7 });
    await pageEdit(web, (x) => { x.nodes.push(task('vp-web', 'viewport check')); });
    await converged([desk, web, phone]);
    expect((deskBoard(desk).viewport as { x: number }).x).not.toBe(4321);
    expect(((web.host.read(docName.board('main')) as { viewport: { x: number } }).viewport).x).toBe(4321);
  }, 60_000);

  it('time-log entries go both ways, exactly once', async () => {
    const [desk] = desks as [Desk];
    const [web, phone] = browsers as [Browser, Browser];
    const r = await web.bridge.timelogAppend!([{ type: 'app.opened' }]);
    expect(r).toEqual({ ok: true, written: 1 });
    const fromWeb = web.host.timelogAll('main').at(-1) as { id: string };
    const fromDesk = appendTimeLog(desk.dir, [{ type: 'app.opened' }])[0]!.id;
    const until = Date.now() + 30_000;
    const done = (): boolean =>
      readTimeLog(desk.dir).filter((e) => e.id === fromWeb.id).length === 1 &&
      [web, phone].every((b) => b.host.timelogAll('main').filter((e) => (e as { id: string }).id === fromDesk).length === 1);
    while (!done() && Date.now() < until) { await phone.engine.syncNow(); await sleep(200); }
    expect(readTimeLog(desk.dir).filter((e) => e.id === fromWeb.id)).toHaveLength(1);
    for (const b of [web, phone]) expect(b.host.timelogAll('main').filter((e) => (e as { id: string }).id === fromDesk)).toHaveLength(1);
  }, 60_000);

  it('a picture added in the web app arrives on the desktop', async () => {
    const [desk] = desks as [Desk];
    const [web] = browsers as [Browser, Browser];
    const bytes = new Uint8Array([137, 80, 78, 71, 9, 8, 7]);
    const { assetId, ext } = await web.bridge.assetWrite('PNG', bytes);
    expect(ext).toBe('png');
    await web.engine.idle();
    await desk.svc.retry();
    expect(new Uint8Array(readFileSync(join(desk.dir, 'assets', `${assetId}.png`)))).toEqual(bytes);
  }, 60_000);

  it('survives the server crashing while the browsers keep editing', async () => {
    const [desk] = desks as [Desk];
    const [web, phone] = browsers as [Browser, Browser];
    await killServer();
    await pageEdit(web, (x) => { x.nodes.push(task('off-web', 'typed while the server was down')); });
    await pageEdit(phone, (x) => { x.nodes.push(task('off-phone', 'typed on the phone while down')); });
    deskEdit(desk, (x) => { x.nodes.push(task('off-desk', 'desk while down')); });
    await sleep(800);
    await startServer();
    await converged([desk, web, phone], 60_000);
    expect(ids(desk)).toEqual(expect.arrayContaining(['off-web', 'off-phone', 'off-desk']));
  }, 90_000);

  it('log out right after an edit sends the edit first (F4, F5)', async () => {
    const [desk] = desks as [Desk];
    const [web] = browsers as [Browser, Browser];
    await pageEdit(web, (x) => { x.nodes.push(task('bye', 'typed a moment before logging out')); });
    const r = await web.bridge.syncDisconnect!(false) as { ok: boolean };
    expect(r.ok).toBe(true);
    expect(web.logouts).toBe(1);
    // The server had it before the browser's copy went: the desktop gets it.
    const until = Date.now() + 20_000;
    while (!ids(desk).includes('bye') && Date.now() < until) await sleep(150);
    expect(ids(desk)).toContain('bye');
  }, 60_000);

  it('log out with the server down keeps the browser\'s copy and says what is unsent', async () => {
    const [, phone] = browsers as [Browser, Browser];
    await killServer();
    await pageEdit(phone, (x) => { x.nodes.push(task('kept', 'typed offline, then log out')); });
    const r = await phone.bridge.syncDisconnect!(false) as { ok: boolean; unsent?: number };
    expect(r.ok).toBe(false);
    expect(r.unsent).toBeGreaterThanOrEqual(1);
    expect(phone.logouts).toBe(0);
    expect(ids(phone)).toContain('kept');
    // "Log out anyway" is the owner's explicit choice.
    const forced = await phone.bridge.syncDisconnect!(true) as { ok: boolean };
    expect(forced.ok).toBe(true);
    expect(phone.logouts).toBe(1);
    await startServer();
  }, 60_000);
});
