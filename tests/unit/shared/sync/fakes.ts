// In-memory server and devices for the sync engine tests. The server follows
// krnl0-server's rules exactly (revisions, 409 conflict with the current body,
// schema guard, tombstones, time-log dedupe by id, notices to everyone).

import { SyncEngine } from '../../../../src/shared/sync/engine';
import { stripDevice } from '../../../../src/shared/sync/shape';
import {
  SyncError,
  type ConnectHandlers,
  type DeleteResult,
  type DocBase,
  type Json,
  type Notice,
  type PutResult,
  type RemoteDoc,
  type Stamps,
  type SyncHost,
  type SyncStore,
  type SyncTransport,
  type TimelogItem,
} from '../../../../src/shared/sync/types';

const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));
const tick = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class FakeServer {
  docs = new Map<string, { rev: number; body: Json | null; deleted: boolean }>();
  timelog = new Map<string, Map<string, Json[]>>();
  assets = new Map<string, { ext: string; bytes: Uint8Array }>();
  clients = new Set<FakeTransport>();
  puts = 0;
  /** Network delay range in ms, to shuffle the order of concurrent requests. */
  delay: [number, number] = [0, 3];
  /** The server's clock (hello and pong carry it). */
  clock: () => number = () => Date.now();

  async wait(): Promise<void> {
    const [a, b] = this.delay;
    await tick(a + Math.floor(Math.random() * (b - a + 1)));
  }

  notify(n: Notice): void {
    for (const c of this.clients) c.deliver(n);
  }

  put(name: string, baseRev: number, body: Json, by: string | null): PutResult {
    const cur = this.docs.get(name) ?? { rev: 0, body: null, deleted: false };
    if (baseRev !== cur.rev) return { ok: false, reason: 'conflict', rev: cur.rev, body: clone(cur.body), deleted: cur.deleted };
    const sv = (cur.body as { schemaVersion?: number } | null)?.schemaVersion;
    const inSv = (body as { schemaVersion?: number }).schemaVersion;
    if (!cur.deleted && typeof sv === 'number' && (typeof inSv !== 'number' || inSv < sv)) return { ok: false, reason: 'schema', storedSchemaVersion: sv };
    const rev = cur.rev + 1;
    this.docs.set(name, { rev, body: clone(body), deleted: false });
    this.puts++;
    this.notify({ kind: 'doc', name, rev, deleted: false, by });
    return { ok: true, rev };
  }

  del(name: string, baseRev: number, by: string | null): DeleteResult {
    const cur = this.docs.get(name);
    if (!cur || cur.deleted) return { ok: false, reason: 'missing' };
    if (baseRev !== cur.rev) return { ok: false, reason: 'conflict', rev: cur.rev, body: clone(cur.body), deleted: cur.deleted };
    const rev = cur.rev + 1;
    this.docs.set(name, { rev, body: null, deleted: true });
    this.notify({ kind: 'doc', name, rev, deleted: true, by });
    return { ok: true, rev };
  }
}

export class FakeTransport implements SyncTransport {
  online = true;
  private handlers: ConnectHandlers | null = null;
  private connId: string | null = null;
  private static next = 1;
  readonly id = `c${FakeTransport.next++}`;

  constructor(private readonly server: FakeServer) {}

  private async net(): Promise<void> {
    await this.server.wait();
    if (!this.online) throw new SyncError('network', 'offline');
  }

  deliver(n: Notice): void {
    if (!this.online || !this.handlers) return;
    const h = this.handlers;
    void this.server.wait().then(() => { if (this.online) h.onNotice(clone(n)); });
  }

  setOnline(on: boolean): void {
    if (this.online === on) return;
    this.online = on;
    if (!this.handlers) return;
    if (on) {
      this.server.clients.add(this);
      this.handlers.onOpen({ connectionId: this.id, serverTime: this.server.clock(), receivedAt: Date.now() });
    } else {
      this.server.clients.delete(this);
      this.handlers.onClose({ retrying: true, kind: 'network', message: 'offline' });
    }
  }

  setConnectionId(id: string | null): void { this.connId = id; }

  async listDocs() { await this.net(); return [...this.server.docs].map(([name, d]) => ({ name, rev: d.rev, deleted: d.deleted })); }
  async getDoc(name: string): Promise<RemoteDoc> {
    await this.net();
    const d = this.server.docs.get(name);
    return d ? { rev: d.rev, body: clone(d.body), deleted: d.deleted } : { rev: 0, body: null, deleted: false };
  }
  async putDoc(name: string, baseRev: number, body: Json) { await this.net(); const r = this.server.put(name, baseRev, clone(body), this.connId); await this.net(); return r; }
  async deleteDoc(name: string, baseRev: number) { await this.net(); return this.server.del(name, baseRev, this.connId); }
  async appendTimelog(boardId: string, items: TimelogItem[]) {
    await this.net();
    const months = this.server.timelog.get(boardId) ?? new Map<string, Json[]>();
    this.server.timelog.set(boardId, months);
    for (const it of items) {
      const list = months.get(it.month) ?? [];
      const id = (it.entry as { id?: string }).id;
      if (!list.some((e) => (e as { id?: string }).id === id)) {
        list.push(clone(it.entry));
        months.set(it.month, list);
        this.server.notify({ kind: 'timelog', boardId, month: it.month, by: this.connId });
      }
    }
  }
  async queryTimelog(boardId: string, from: string, to: string) {
    await this.net();
    const out: Record<string, Json[]> = {};
    for (const [m, list] of this.server.timelog.get(boardId) ?? []) if (m >= from && m <= to) out[m] = clone(list);
    return out;
  }
  async listTimelog() { await this.net(); return [...this.server.timelog].map(([id, months]) => ({ id, months: [...months.keys()] })); }
  async listAssets() { await this.net(); return [...this.server.assets].map(([id, a]) => ({ id, ext: a.ext, size: a.bytes.length })); }
  async putAsset(id: string, ext: string, bytes: Uint8Array) { await this.net(); this.server.assets.set(id, { ext, bytes }); this.server.notify({ kind: 'asset', id, deleted: false, by: this.connId }); }
  async getAsset(id: string) { await this.net(); return this.server.assets.get(id) ?? null; }

  connect(handlers: ConnectHandlers): () => void {
    this.handlers = handlers;
    if (this.online) {
      this.server.clients.add(this);
      setTimeout(() => handlers.onOpen({ connectionId: this.id, serverTime: this.server.clock(), receivedAt: Date.now() }), 0);
    }
    return () => { this.server.clients.delete(this); this.handlers = null; };
  }
}

export class MemoryStore implements SyncStore {
  bases = new Map<string, DocBase>();
  pending: Array<{ boardId: string; month: string; entry: Json }> = [];
  flags = new Set<string>();
  stamps = new Map<string, Stamps>();
  offset: number | null = null;
  getBase(name: string) { const b = this.bases.get(name); return b ? clone(b) : null; }
  setBase(name: string, base: DocBase | null) { if (base) this.bases.set(name, clone(base)); else this.bases.delete(name); }
  pendingTimelog() { return clone(this.pending); }
  addPendingTimelog(items: Array<{ boardId: string; month: string; entry: Json }>) { this.pending.push(...clone(items)); }
  dropPendingTimelog(ids: Set<string>) { this.pending = this.pending.filter((p) => !ids.has((p.entry as { id: string }).id)); }
  flag(key: string) { return this.flags.has(key); }
  setFlag(key: string, on: boolean) { if (on) this.flags.add(key); else this.flags.delete(key); }
  getStamps(name: string) { const s = this.stamps.get(name); return s ? clone(s) : null; }
  setStamps(name: string, s: Stamps | null) { if (s && Object.keys(s).length > 0) this.stamps.set(name, clone(s)); else this.stamps.delete(name); }
  clockOffset() { return this.offset; }
  setClockOffset(ms: number) { this.offset = ms; }
}

export class MemoryHost implements SyncHost {
  docs = new Map<string, Json>();
  removed: string[] = [];
  timelog = new Map<string, Json[]>();
  files = new Map<string, { ext: string; bytes: Uint8Array }>();
  writes = 0;
  readonly schemaVersion = 2;
  pristine = new Set<string>();
  onWrite: ((name: string) => void) | null = null;

  localDocs() { return [...this.docs.keys()]; }
  read(name: string) { const d = this.docs.get(name); return d === undefined ? null : clone(d); }
  write(name: string, body: Json) { this.docs.set(name, clone(body)); this.pristine.delete(name); this.writes++; this.onWrite?.(name); }
  remove(name: string) { this.docs.delete(name); this.removed.push(name); }
  normalize(_name: string, body: Json) { return body; }
  isPristine(name: string) { return this.pristine.has(name); }
  timelogBoards() { return [...this.timelog.keys()]; }
  timelogAll(boardId: string) { return clone(this.timelog.get(boardId) ?? []); }
  timelogMerge(boardId: string, _month: string, entries: Json[]) {
    const list = this.timelog.get(boardId) ?? [];
    for (const e of entries) if (!list.some((x) => (x as { id: string }).id === (e as { id: string }).id)) list.push(clone(e));
    this.timelog.set(boardId, list);
  }
  monthOf(entry: Json) { return String((entry as { at: string }).at).slice(0, 7); }
  assets() { return [...this.files].map(([id, f]) => ({ id, ext: f.ext })); }
  readAsset(id: string) { return this.files.get(id) ?? null; }
  writeAsset(id: string, ext: string, bytes: Uint8Array) { this.files.set(id, { ext, bytes }); }
}

export interface Device {
  host: MemoryHost;
  store: MemoryStore;
  transport: FakeTransport;
  engine: SyncEngine;
  /** A local edit: change the board, then tell the engine (like main does after a save). */
  edit: (name: string, fn: (b: Record<string, Json>) => void) => void;
}

export function makeDevice(server: FakeServer, seed: Record<string, Json> = {}, opts: { now?: () => number; store?: MemoryStore } = {}): Device {
  const host = new MemoryHost();
  for (const [k, v] of Object.entries(seed)) host.docs.set(k, clone(v));
  const store = opts.store ?? new MemoryStore();
  const transport = new FakeTransport(server);
  const engine = new SyncEngine({ transport, host, store, debounceMs: 5, ...(opts.now ? { now: opts.now } : {}) });
  const edit = (name: string, fn: (b: Record<string, Json>) => void) => {
    const b = (host.read(name) ?? { schemaVersion: 2, nodes: [], edges: [] }) as Record<string, Json>;
    fn(b);
    host.docs.set(name, b);
    host.pristine.delete(name);
    engine.changed(name);
  };
  return { host, store, transport, engine, edit };
}

/** Waits until every engine is idle and the server has no notices in flight. */
export async function settle(devices: Device[], rounds = 6): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await tick(15);
    await Promise.all(devices.map((d) => d.engine.idle()));
  }
}

export const synced = (d: Device, name: string): Json => stripDevice(name, d.host.read(name));
