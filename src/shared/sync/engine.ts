// The sync engine (Decision 51; state machine: krnl0-server docs/architecture/sync.md).
//
// One reconcile per document at a time (a promise chain per name), nothing held
// across network calls, so two devices can never wait on each other. Every
// conflict is resolved with boardMerge — the merge main already uses for the CLI.

import { mergeBoards } from '../boardMerge';
import { restoreDevice, sameContent, stripDevice } from './shape';
import {
  SyncError,
  type DocBase,
  type Json,
  type Notice,
  type SyncHost,
  type SyncStatus,
  type SyncStore,
  type SyncTransport,
} from './types';

export interface EngineOptions {
  transport: SyncTransport;
  host: SyncHost;
  store: SyncStore;
  debounceMs?: number;
  /** Merges in a row on one document before sync pauses it (NF4). */
  maxConflicts?: number;
  onStatus?: (s: SyncStatus) => void;
  /** Said when a board was saved by a newer KRNL0 than this one (the web says: update the server). */
  newerAppMessage?: string;
  log?: (msg: string, fields?: Record<string, unknown>) => void;
  now?: () => number;
}

const isObject = (v: Json): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);
const schemaOf = (body: Json): number | null => (isObject(body) && typeof body.schemaVersion === 'number' ? body.schemaVersion : null);
const entryId = (e: Json): string | null => (isObject(e) && typeof e.id === 'string' ? e.id : null);
const TIMELOG_CHUNK = 1000;
const MAX_EAGER_ASSET_BYTES = 50 * 1024 * 1024;

export class SyncEngine {
  private readonly t: SyncTransport;
  private readonly host: SyncHost;
  private readonly store: SyncStore;
  private readonly debounceMs: number;
  private readonly maxConflicts: number;
  private readonly now: () => number;

  private chains = new Map<string, Promise<void>>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private busy = 0;
  private conflictsInRow = new Map<string, number>();
  private paused = new Set<string>();
  /** Why a document is paused, when it is not "too many conflicts" (e.g. too large). */
  private pauseReasons = new Map<string, string>();
  /** Files the server will not take (too large): they stay on this device. */
  private refusedAssets = new Set<string>();
  private readOnly = new Set<string>();
  private connected = false;
  private running = false;
  private connectionId: string | null = null;
  private closeLive: (() => void) | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 1000;
  private hadNetworkError = false;
  private status: SyncStatus = { state: 'off', lastSyncedAt: null, clockOffsetMs: null, readOnly: [], message: null };

  constructor(private readonly opts: EngineOptions) {
    this.t = opts.transport;
    this.host = opts.host;
    this.store = opts.store;
    this.debounceMs = opts.debounceMs ?? 300;
    this.maxConflicts = opts.maxConflicts ?? 8;
    this.now = opts.now ?? Date.now;
  }

  getStatus(): SyncStatus { return this.status; }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.setState('connecting');
    this.closeLive = this.t.connect({
      onOpen: ({ connectionId, serverTime, receivedAt }) => {
        this.connectionId = connectionId;
        this.t.setConnectionId(connectionId);
        this.connected = true;
        this.retryDelay = 1000;
        this.status = { ...this.status, clockOffsetMs: serverTime - receivedAt };
        void this.catchUp();
      },
      onNotice: (n) => this.onNotice(n),
      onPong: ({ serverTime, sentAt, receivedAt }) => {
        this.status = { ...this.status, clockOffsetMs: Math.round(serverTime - (sentAt + receivedAt) / 2) };
      },
      onClose: ({ retrying, kind, message }) => {
        this.connected = false;
        this.connectionId = null;
        this.t.setConnectionId(null);
        if (!retrying) {
          this.stopTimers();
          this.setState(kind === 'auth' || kind === 'certificate' ? 'signed-out' : 'update', message);
          return;
        }
        this.refresh();
      },
    });
  }

  stop(): void {
    this.running = false;
    this.connected = false;
    this.stopTimers();
    this.closeLive?.();
    this.closeLive = null;
    this.setState('off');
  }

  private stopTimers(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  /** The device changed a document (board save, CLI, board list). Debounced. */
  changed(name: string): void {
    if (!this.running) return;
    this.paused.delete(name);
    this.pauseReasons.delete(name);
    this.conflictsInRow.delete(name);
    this.debounce(`doc:${name}`, () => this.enqueue(name, () => this.reconcile(name)));
  }

  /** New local time-log entries (already written to the device's own log). */
  timelogAppended(boardId: string, entries: Json[]): void {
    if (entries.length === 0) return;
    this.store.addPendingTimelog(entries.map((entry) => ({ boardId, month: this.host.monthOf(entry), entry })));
    if (!this.running) return;
    this.debounce('timelog', () => this.enqueue('timelog', () => this.flushTimelog()));
  }

  /** A new local image or media file. */
  assetAdded(id: string): void {
    if (!this.running) return;
    this.enqueue(`asset:${id}`, () => this.uploadAsset(id));
  }

  /** Resolves when every queued job and debounce has finished (tests, shutdown). */
  async idle(): Promise<void> {
    for (;;) {
      const pending = [...this.chains.values()];
      if (pending.length === 0 && this.timers.size === 0) return;
      if (pending.length === 0) await new Promise((r) => setTimeout(r, this.debounceMs + 5));
      else await Promise.allSettled(pending);
    }
  }

  /** Everything again: after a reconnect, or from "tap to retry". */
  async syncNow(): Promise<void> {
    this.paused.clear();
    this.pauseReasons.clear();
    this.conflictsInRow.clear();
    await this.catchUp();
  }

  // ── Scheduling ──────────────────────────────────────────────────────────

  private debounce(key: string, fn: () => void): void {
    const prev = this.timers.get(key);
    if (prev) clearTimeout(prev);
    this.timers.set(key, setTimeout(() => { this.timers.delete(key); fn(); }, this.debounceMs));
    this.refresh();
  }

  /** Runs jobs for one key one after another; different keys run independently. */
  private enqueue(key: string, job: () => Promise<void>): Promise<void> {
    const prev = this.chains.get(key) ?? Promise.resolve();
    this.busy++;
    this.refresh();
    const next = prev.then(job).catch((err: unknown) => this.onJobError(key, err)).finally(() => {
      this.busy--;
      if (this.chains.get(key) === next) this.chains.delete(key);
      this.refresh();
    });
    this.chains.set(key, next);
    return next;
  }

  private onJobError(key: string, err: unknown): void {
    if (err instanceof SyncError && err.kind === 'certificate') {
      this.stop();
      this.setState('signed-out', err.message);
      return;
    }
    if (err instanceof SyncError && err.kind === 'refused') {
      // The server will never take it: no retry storm. A document pauses with
      // the reason; the rest keeps syncing.
      if (key === 'boards' || key.startsWith('board:')) { this.pause(key, err.message); return; }
      this.opts.log?.('sync refused', { key, error: err.message });
      this.refresh();
      return;
    }
    if (err instanceof SyncError && err.kind === 'auth') {
      this.stop();
      this.setState('signed-out', 'This device is no longer paired. Connect again.');
      return;
    }
    if (err instanceof SyncError && err.kind === 'network') {
      this.hadNetworkError = true;
      this.scheduleRetry();
      return;
    }
    this.opts.log?.('sync job failed', { key, error: err instanceof Error ? err.message : String(err) });
    this.hadNetworkError = true;
    this.scheduleRetry();
  }

  private scheduleRetry(): void {
    if (!this.running || this.retryTimer) return;
    const jitter = 0.8 + Math.random() * 0.4;
    const delay = Math.round(this.retryDelay * jitter);
    this.retryDelay = Math.min(60_000, this.retryDelay * 2);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.connected) void this.catchUp();
    }, delay);
  }

  // ── Notices and catch-up ────────────────────────────────────────────────

  private onNotice(n: Notice): void {
    if (n.by !== null && n.by === this.connectionId) return; // our own write (NF4)
    if (n.kind === 'doc') {
      const base = this.store.getBase(n.name);
      if (base && base.rev >= n.rev) return;
      void this.enqueue(n.name, () => this.reconcile(n.name, { rev: n.rev, deleted: n.deleted }));
    } else if (n.kind === 'timelog') {
      void this.enqueue(`tl:${n.boardId}`, () => this.pullTimelog(n.boardId, [n.month]));
    } else if (!n.deleted) {
      void this.enqueue(`asset:${n.id}`, () => this.downloadAsset(n.id));
    }
  }

  private async catchUp(): Promise<void> {
    if (!this.connected) return;
    this.hadNetworkError = false;
    let listing: Awaited<ReturnType<SyncTransport['listDocs']>>;
    try {
      listing = await this.t.listDocs();
    } catch (err) {
      this.onJobError('catch-up', err);
      return;
    }
    const remote = new Map(listing.map((d) => [d.name, d]));
    const names = new Set<string>([...remote.keys(), ...this.host.localDocs()]);
    // The board list first: it decides which boards this device has.
    const ordered = [...names].sort((a, b) => (a === 'boards' ? -1 : b === 'boards' ? 1 : a.localeCompare(b)));
    const jobs: Promise<void>[] = [];
    for (const name of ordered) {
      if (name !== 'boards' && !name.startsWith('board:')) continue;
      const r = remote.get(name);
      const base = this.store.getBase(name);
      const hint = r ? { rev: r.rev, deleted: !!r.deleted } : { rev: 0, deleted: false };
      const job = this.enqueue(name, () => this.reconcile(name, hint, base === null && r === undefined));
      if (name === 'boards') await job; else jobs.push(job);
    }
    jobs.push(this.enqueue('timelog', () => this.seedAndFlushTimelog()));
    jobs.push(this.enqueue('timelog-pull', () => this.pullAllTimelog()));
    jobs.push(this.enqueue('assets', () => this.syncAssets()));
    await Promise.allSettled(jobs);
    if (!this.hadNetworkError) {
      this.status = { ...this.status, lastSyncedAt: this.now() };
      this.refresh();
    }
  }

  // ── Documents ───────────────────────────────────────────────────────────

  /**
   * Brings one document into agreement with the server. `hint` is what a
   * notice or the listing said the server has; `newOnServer` means the server
   * has never seen it (skip the download).
   */
  private async reconcile(name: string, hint?: { rev: number; deleted: boolean }, newOnServer = false): Promise<void> {
    if (this.readOnly.has(name) || this.paused.has(name)) return;
    for (let round = 0; ; round++) {
      const localFull = this.host.read(name);
      const base = this.store.getBase(name);
      const local = localFull === null ? null : (stripDevice(name, this.host.normalize(name, localFull)) as Json);

      // Deleted on this device since the last agreement.
      if (local === null) {
        if (base && base.body !== null) {
          const r = await this.t.deleteDoc(name, base.rev);
          if (r.ok) { this.store.setBase(name, { rev: r.rev, body: null }); return; }
          if (r.reason === 'missing') { this.store.setBase(name, null); return; }
          // Changed elsewhere after our base: the delete still wins (the other device keeps its copy aside).
          this.store.setBase(name, { rev: r.rev, body: r.deleted ? null : (r.body as Json) });
          if (r.deleted) return;
          if (round > this.maxConflicts) return this.pause(name);
          continue;
        }
        if (hint && hint.rev > 0 && !hint.deleted) return this.download(name, localFull);
        return;
      }

      const localChanged = !base || base.body === null || !sameContent(local, base.body);
      if (!localChanged) {
        if (hint && base && hint.rev === base.rev) return;
        return this.download(name, localFull);
      }

      // A device that never synced, holding only an untouched new board, takes the server's.
      if (!base && !newOnServer && this.host.isPristine?.(name) && hint && hint.rev > 0 && !hint.deleted) {
        return this.download(name, localFull);
      }

      const r = await this.t.putDoc(name, base?.rev ?? 0, local);
      if (r.ok) {
        this.store.setBase(name, { rev: r.rev, body: local });
        this.conflictsInRow.delete(name);
        return;
      }
      if (r.reason === 'schema') {
        this.readOnly.add(name);
        this.status = { ...this.status, readOnly: [...this.readOnly] };
        this.setState('update', this.opts.newerAppMessage ?? 'A newer KRNL0 saved this board. Update KRNL0 to keep syncing it.');
        return;
      }
      // Conflict: someone else wrote since our base.
      if (r.deleted || r.body === null) {
        if (r.deleted) {
          this.host.remove(name);
          this.store.setBase(name, { rev: r.rev, body: null });
          return;
        }
        // The server lost it (restored from an older backup): upload ours as new.
        this.store.setBase(name, null);
        if (round > this.maxConflicts) return this.pause(name);
        continue;
      }
      const theirs = stripDevice(name, this.host.normalize(name, r.body)) as Record<string, Json>;
      const baseBody = (base?.body !== null && base?.body !== undefined ? this.host.normalize(name, base.body) : {}) as Record<string, Json>;
      const merged = mergeBoards(baseBody, local as Record<string, Json>, theirs);
      this.store.setBase(name, { rev: r.rev, body: theirs });
      if (!sameContent(merged, local)) this.host.write(name, restoreDevice(name, merged, this.host.read(name)));
      const n = (this.conflictsInRow.get(name) ?? 0) + 1;
      this.conflictsInRow.set(name, n);
      if (n > this.maxConflicts) return this.pause(name);
      // Loop: upload the merge on top of the server's revision.
    }
  }

  private async download(name: string, localFull: Json | null): Promise<void> {
    const r = await this.t.getDoc(name);
    if (r.deleted) {
      if (localFull !== null) this.host.remove(name);
      this.store.setBase(name, { rev: r.rev, body: null });
      return;
    }
    if (r.body === null) {
      // Not on the server (yet): nothing to take.
      return;
    }
    const sv = schemaOf(r.body);
    if (sv !== null && sv > this.host.schemaVersion) {
      this.readOnly.add(name);
      this.status = { ...this.status, readOnly: [...this.readOnly] };
      this.setState('update', this.opts.newerAppMessage ?? 'A newer KRNL0 saved this board. Update KRNL0 to keep syncing it.');
      return;
    }
    const theirs = stripDevice(name, this.host.normalize(name, r.body));
    const current = this.host.read(name);
    const currentSynced = current === null ? null : stripDevice(name, this.host.normalize(name, current));
    const base = this.store.getBase(name);
    // A local edit landed while we were downloading: merge rather than overwrite.
    if (currentSynced !== null && base && base.body !== null && !sameContent(currentSynced, base.body)) {
      const merged = mergeBoards(this.host.normalize(name, base.body) as Record<string, Json>, currentSynced as Record<string, Json>, theirs as Record<string, Json>);
      this.store.setBase(name, { rev: r.rev, body: theirs });
      if (!sameContent(merged, currentSynced)) this.host.write(name, restoreDevice(name, merged, current));
      this.changed(name);
      return;
    }
    if (currentSynced === null || !sameContent(theirs, currentSynced)) this.host.write(name, restoreDevice(name, theirs, current));
    this.store.setBase(name, { rev: r.rev, body: theirs });
  }

  private pause(name: string, reason?: string): void {
    this.paused.add(name);
    if (reason) this.pauseReasons.set(name, reason);
    this.opts.log?.(reason ? 'sync paused' : 'sync paused after repeated conflicts', { doc: name, ...(reason ? { reason } : {}) });
    this.setState('paused', reason ?? 'Sync paused — tap to retry.');
  }

  // ── Time log ────────────────────────────────────────────────────────────

  private async seedAndFlushTimelog(): Promise<void> {
    for (const boardId of this.host.timelogBoards()) {
      const key = `timelog-seeded:${boardId}`;
      if (this.store.flag(key)) continue;
      const all = this.host.timelogAll(boardId);
      this.store.addPendingTimelog(all.map((entry) => ({ boardId, month: this.host.monthOf(entry), entry })));
      await this.flushTimelog();
      this.store.setFlag(key, true);
    }
    await this.flushTimelog();
  }

  private async flushTimelog(): Promise<void> {
    const pending = this.store.pendingTimelog();
    if (pending.length === 0) return;
    const byBoard = new Map<string, typeof pending>();
    for (const p of pending) byBoard.set(p.boardId, [...(byBoard.get(p.boardId) ?? []), p]);
    for (const [boardId, items] of byBoard) {
      for (let i = 0; i < items.length; i += TIMELOG_CHUNK) {
        const chunk = items.slice(i, i + TIMELOG_CHUNK);
        await this.t.appendTimelog(boardId, chunk.map((c) => ({ month: c.month, entry: c.entry })));
        this.store.dropPendingTimelog(new Set(chunk.map((c) => entryId(c.entry)).filter((x): x is string => x !== null)));
      }
    }
  }

  private async pullAllTimelog(): Promise<void> {
    const boards = await this.t.listTimelog();
    for (const b of boards) await this.pullTimelog(b.id, b.months);
  }

  private async pullTimelog(boardId: string, months: string[]): Promise<void> {
    if (months.length === 0) return;
    const sorted = [...months].sort();
    // Months come in contiguous ranges of at most 60 (server limit).
    for (let i = 0; i < sorted.length; i += 60) {
      const part = sorted.slice(i, i + 60);
      const got = await this.t.queryTimelog(boardId, part[0] as string, part[part.length - 1] as string);
      for (const [month, entries] of Object.entries(got)) this.host.timelogMerge(boardId, month, entries);
    }
  }

  // ── Assets ──────────────────────────────────────────────────────────────

  private async syncAssets(): Promise<void> {
    const remote = await this.t.listAssets();
    const remoteIds = new Set(remote.map((a) => a.id));
    const local = this.host.assets();
    const localIds = new Set(local.map((a) => a.id));
    for (const a of local) if (!remoteIds.has(a.id) && !this.store.flag(`asset-refused:${a.id}`)) await this.uploadAsset(a.id);
    for (const a of remote) if (!localIds.has(a.id) && a.size <= MAX_EAGER_ASSET_BYTES) await this.downloadAsset(a.id);
  }

  private async uploadAsset(id: string): Promise<void> {
    if (this.store.flag(`asset-refused:${id}`)) { this.refusedAssets.add(id); return; }
    const a = this.host.readAsset(id);
    if (!a) return;
    try {
      await this.t.putAsset(id, a.ext, a.bytes);
    } catch (err) {
      if (!(err instanceof SyncError && err.kind === 'refused')) throw err;
      // Too large for the server: it stays here, and is not tried again.
      this.store.setFlag(`asset-refused:${id}`, true);
      this.refusedAssets.add(id);
      this.opts.log?.('asset refused', { id, error: err.message });
    }
  }

  private async downloadAsset(id: string): Promise<void> {
    if (this.host.assets().some((a) => a.id === id)) return;
    const got = await this.t.getAsset(id);
    if (got) this.host.writeAsset(id, got.ext, got.bytes);
  }

  // ── Status ──────────────────────────────────────────────────────────────

  private setState(state: SyncStatus['state'], message: string | null = null): void {
    this.status = { ...this.status, state, message };
    this.opts.onStatus?.(this.status);
  }

  private refresh(): void {
    if (!this.running) return;
    const s = this.status.state;
    if (s === 'signed-out') return;
    let next: SyncStatus['state'];
    let message: string | null = null;
    if (this.readOnly.size > 0) { next = 'update'; message = this.opts.newerAppMessage ?? 'A newer KRNL0 saved a board. Update KRNL0 to keep syncing it.'; }
    else if (this.paused.size > 0) { next = 'paused'; message = [...this.pauseReasons.values()][0] ?? 'Sync paused — tap to retry.'; }
    else if (!this.connected) next = s === 'connecting' ? 'connecting' : 'offline';
    else if (this.busy > 0 || this.timers.size > 0) next = 'syncing';
    else next = this.hadNetworkError ? 'offline' : 'synced';
    if (next === 'synced' && this.refusedAssets.size > 0) {
      const n = this.refusedAssets.size;
      message = `${n === 1 ? 'A file is' : `${n} files are`} too large for the server (images 25 MB, other files 500 MB) and stay${n === 1 ? 's' : ''} on this device.`;
    }
    if (next === 'synced' && s !== 'synced') this.status = { ...this.status, lastSyncedAt: this.now() };
    if (next !== s || message !== this.status.message) this.setState(next, message);
  }
}

export type { DocBase };
