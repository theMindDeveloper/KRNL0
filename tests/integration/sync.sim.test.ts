/**
 * Sync simulation (server-sync.md NF7): the real KRNL0 server in its own
 * process, three desktop devices in their own board folders, each running the
 * real SyncService (pairing with fingerprint check, NodeTransport, DesktopHost,
 * FileSyncStore, SyncEngine). Faults: concurrent edits, offline edits, the
 * server killed mid-burst and restarted, edits made while the app was closed.
 *
 * Needs the krnl0-server checkout next to this repo (or KRNL0_SERVER_DIR) with
 * `npm run build` done; skipped otherwise.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { createServer } from 'net';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { SyncService, type SecretBox } from '../../src/main/sync/service';
import { seedBoard, saveBoardTo, migrateBoard } from '../../src/main/persistence/board';
import { switchBoard } from '../../src/main/persistence/boards';
import { appendTimeLog, readTimeLog } from '../../src/main/persistence/timelog';
import { stripDevice, sameContent } from '../../src/shared/sync/shape';

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
    server.kill('SIGKILL'); // a crash, not a clean stop
  });
}

interface Dev { name: string; dir: string; svc: SyncService }
const devs: Dev[] = [];

function makeDevice(name: string, boardId: string, board: Record<string, unknown>): Dev {
  const dir = mkdtempSync(join(tmpdir(), `krnl0-sim-${name}-`));
  writeFileSync(join(dir, 'boards.json'), JSON.stringify({ version: 1, activeId: boardId, boards: [{ id: boardId, name: 'Main' }] }, null, 2));
  saveBoardTo(join(dir, 'board.json'), board);
  const svc = new SyncService({
    boardDir: dir,
    userDataDir: dir,
    appVersion: '0.13.0-sim',
    secrets,
    notifyBoardChanged: () => {},
    switchToBoard: (id) => typeof switchBoard(dir, id) !== 'string',
    onStatus: () => {},
    ...(process.env.SIM_LOG ? { log: (m: string, f?: Record<string, unknown>) => console.log('LOG', name, m, JSON.stringify(f)) } : {}),
  });
  const d = { name, dir, svc };
  devs.push(d);
  return d;
}

const activeBoard = (d: Dev): Record<string, unknown> => JSON.parse(readFileSync(join(d.dir, 'board.json'), 'utf-8')) as Record<string, unknown>;
const syncedBoard = (d: Dev) => stripDevice('board:x', migrateBoard(activeBoard(d)));
const edit = (d: Dev, fn: (b: Record<string, unknown> & { nodes: Array<Record<string, unknown>> }) => void): void => {
  const b = activeBoard(d) as Record<string, unknown> & { nodes: Array<Record<string, unknown>> };
  fn(b);
  saveBoardTo(join(d.dir, 'board.json'), b); // the same path a renderer save or `krnl` takes
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function converged(ds: Dev[], timeoutMs = 25_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const first = syncedBoard(ds[0]!);
    if (ds.every((d) => sameContent(syncedBoard(d), first)) && ds.every((d) => d.svc.info().state === 'synced')) return;
    if (Date.now() > until) {
      throw new Error(`not converged: ${ds.map((d) => `${d.name}=${d.svc.info().state} nodes=${(syncedBoard(d) as { nodes: unknown[] }).nodes.length}`).join(', ')}`);
    }
    await sleep(150);
  }
}

const task = (id: string, title: string) => ({ id, kind: 'task', position: { x: 0, y: 0 }, state: { title, done: false }, config: {} });

describe.skipIf(!available)('sync simulation against the real server (NF7)', () => {
  beforeAll(async () => {
    serverData = mkdtempSync(join(tmpdir(), 'krnl0-sim-server-'));
    port = await freePort();
    const setup = spawnSync(process.execPath, [SERVER_BIN, 'setup', '--yes', '--password-stdin', '--website', 'on', '--app-sync', 'on', '--tls', 'self-signed', '--hosts', 'localhost', '--tz', 'Europe/Berlin'], { env: serverEnv(), input: PASSWORD, encoding: 'utf-8' });
    if (setup.status !== 0) throw new Error(`setup failed: ${setup.stderr}`);
    await startServer();
  }, 60_000);

  afterAll(async () => {
    for (const d of devs) d.svc.stop();
    await killServer();
    for (const d of devs) rmSync(d.dir, { recursive: true, force: true });
    if (serverData) rmSync(serverData, { recursive: true, force: true });
  });

  it('pairs three devices; the fresh ones take the first board instead of adding duplicates', async () => {
    const real = seedBoard() as Record<string, unknown> & { nodes: unknown[] };
    real.nodes = [...real.nodes, task('t1', 'Read chapter 4'), task('t2', 'Gym')];
    const a = makeDevice('A', 'main', real);
    const b = makeDevice('B', 'fresh-b', seedBoard() as Record<string, unknown>);
    const c = makeDevice('C', 'fresh-c', seedBoard() as Record<string, unknown>);
    for (const d of [a, b, c]) {
      const step = await d.svc.begin(`https://localhost:${port}`);
      expect(step.fingerprint).toMatch(/^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/);
      await d.svc.finish(PASSWORD);
      if (d === a) await converged([a]);
    }
    await converged([a, b, c]);
    for (const d of [b, c]) {
      const idx = JSON.parse(readFileSync(join(d.dir, 'boards.json'), 'utf-8')) as { activeId: string; boards: Array<{ id: string }> };
      expect(idx.boards.map((x) => x.id)).toEqual(['main']);
      expect(idx.activeId).toBe('main');
    }
  }, 60_000);

  it('simultaneous edits on all three devices all survive', async () => {
    const [a, b, c] = devs as [Dev, Dev, Dev];
    edit(a, (x) => { x.nodes.push(task('ta', 'from A')); });
    edit(b, (x) => { x.nodes.push(task('tb', 'from B')); });
    edit(c, (x) => { const n = x.nodes.find((n) => n.id === 't2')!; (n.state as Record<string, unknown>).done = true; });
    await converged([a, b, c]);
    const ids = (syncedBoard(a) as { nodes: Array<{ id: string }> }).nodes.map((n) => n.id);
    expect(ids).toEqual(expect.arrayContaining(['t1', 't2', 'ta', 'tb']));
    const gym = (syncedBoard(b) as { nodes: Array<{ id: string; state: { done: boolean } }> }).nodes.find((n) => n.id === 't2');
    expect(gym?.state.done).toBe(true);
  }, 60_000);

  it('survives the server crashing during a burst of edits, and offline edits', async () => {
    const [a, b, c] = devs as [Dev, Dev, Dev];
    for (let i = 0; i < 10; i++) {
      edit(i % 2 ? a : b, (x) => { x.nodes.push(task(`burst${i}`, `burst ${i}`)); });
      if (i === 5) await killServer();
      await sleep(40);
    }
    edit(c, (x) => { x.nodes.push(task('offline-c', 'written while the server was down')); });
    await sleep(500);
    await startServer();
    await converged([a, b, c], 40_000);
    const ids = (syncedBoard(c) as { nodes: Array<{ id: string }> }).nodes.map((n) => n.id);
    for (let i = 0; i < 10; i++) expect(ids).toContain(`burst${i}`);
    expect(ids).toContain('offline-c');
  }, 90_000);

  it('a change made while the app was closed is sent on the next start', async () => {
    const [a, b, c] = devs as [Dev, Dev, Dev];
    a.svc.stop();
    edit(a, (x) => { x.nodes.push(task('cli', 'krnl task add while closed')); });
    a.svc.start();
    await converged([a, b, c]);
    expect((syncedBoard(b) as { nodes: Array<{ id: string }> }).nodes.map((n) => n.id)).toContain('cli');
  }, 60_000);

  it('per-device keys stay on their device', async () => {
    const [a, b, c] = devs as [Dev, Dev, Dev];
    edit(a, (x) => { x.viewport = { x: 1234, y: 5678, zoom: 2 }; x.nodes.push(task('vp', 'viewport check')); });
    await converged([a, b, c]);
    expect((activeBoard(b).viewport as { x: number }).x).not.toBe(1234);
  }, 60_000);

  it('time-log entries reach every device exactly once', async () => {
    const [a, b, c] = devs as [Dev, Dev, Dev];
    const stored = appendTimeLog(a.dir, [{ type: 'app.opened' }]);
    const id = stored[0]!.id;
    const until = Date.now() + 20_000;
    while (Date.now() < until) {
      if ([b, c].every((d) => readTimeLog(d.dir).filter((e) => e.id === id).length === 1)) break;
      await sleep(150);
    }
    for (const d of [b, c]) expect(readTimeLog(d.dir).filter((e) => e.id === id)).toHaveLength(1);
  }, 60_000);

  it('an image added on one device arrives on the others', async () => {
    const [a, b, c] = devs as [Dev, Dev, Dev];
    mkdirSync(join(a.dir, 'assets'), { recursive: true });
    writeFileSync(join(a.dir, 'assets', '01HXYZABCDEFGHJKMNPQRSTVWX.png'), Buffer.from([137, 80, 78, 71, 1, 2, 3]));
    await a.svc.retry();
    await b.svc.retry();
    await c.svc.retry();
    for (const d of [b, c]) expect(readFileSync(join(d.dir, 'assets', '01HXYZABCDEFGHJKMNPQRSTVWX.png'))).toEqual(Buffer.from([137, 80, 78, 71, 1, 2, 3]));
  }, 60_000);
});
