// Sync with the owner's KRNL0 server (Decision 51, docs/06-requirements/server-sync.md).
// Shared by the desktop main process and the web build: no Node or Electron imports.
// Wire format: krnl0-server docs/architecture/protocol.md; states: sync.md.

export type Json = unknown;

export const PROTOCOL = 1;

/** A document as the server holds it. */
export interface RemoteDoc {
  rev: number;
  /** null when missing or deleted. */
  body: Json | null;
  deleted: boolean;
}

export interface DocListing {
  name: string;
  rev: number;
  deleted?: boolean;
}

export type PutResult =
  | { ok: true; rev: number }
  | { ok: false; reason: 'conflict'; rev: number; body: Json | null; deleted: boolean }
  | { ok: false; reason: 'schema'; storedSchemaVersion: number };

export type DeleteResult =
  | { ok: true; rev: number }
  | { ok: false; reason: 'conflict'; rev: number; body: Json | null; deleted: boolean }
  | { ok: false; reason: 'missing' };

export type Notice =
  | { kind: 'doc'; name: string; rev: number; deleted: boolean; by: string | null }
  | { kind: 'timelog'; boardId: string; month: string; by: string | null }
  | { kind: 'asset'; id: string; deleted: boolean; by: string | null };

export interface TimelogItem {
  month: string;
  entry: Json;
}

/** Why the transport could not do something. */
export type SyncErrorKind = 'network' | 'auth' | 'protocol' | 'server';

export class SyncError extends Error {
  constructor(readonly kind: SyncErrorKind, message: string) {
    super(message);
  }
}

/** Talks to the server. Desktop: Node https + ws with the pinned CA. Web: fetch + WebSocket. */
export interface SyncTransport {
  listDocs(): Promise<DocListing[]>;
  getDoc(name: string): Promise<RemoteDoc>;
  putDoc(name: string, baseRev: number, body: Json): Promise<PutResult>;
  deleteDoc(name: string, baseRev: number): Promise<DeleteResult>;
  appendTimelog(boardId: string, items: TimelogItem[]): Promise<void>;
  queryTimelog(boardId: string, fromMonth: string, toMonth: string): Promise<Record<string, Json[]>>;
  listTimelog(): Promise<Array<{ id: string; months: string[] }>>;
  listAssets(): Promise<Array<{ id: string; ext: string; size: number }>>;
  putAsset(id: string, ext: string, bytes: Uint8Array): Promise<void>;
  getAsset(id: string): Promise<{ ext: string; bytes: Uint8Array } | null>;
  /** Opens the live channel; reconnects by itself. Returns a function that closes it for good. */
  connect(handlers: ConnectHandlers): () => void;
  /** Sent as X-KRNL0-Connection on writes, so this client's own notices can be ignored. */
  setConnectionId(id: string | null): void;
}

export interface ConnectHandlers {
  onOpen(info: { connectionId: string; serverTime: number; receivedAt: number }): void;
  onNotice(n: Notice): void;
  onPong?(info: { serverTime: number; sentAt: number; receivedAt: number }): void;
  /** `retrying`: the transport tries again by itself. Otherwise sync must stop (auth, protocol). */
  onClose(info: { retrying: boolean; kind: SyncErrorKind; message: string }): void;
}

/** The device's own copy of everything (board.json files, or IndexedDB on the web). */
export interface SyncHost {
  /** Names of synced documents this device has: 'boards' and 'board:<id>'. */
  localDocs(): string[];
  /** The full local body (with per-device keys), or null when this device has none. */
  read(name: string): Json | null;
  /** Apply a body from the server or a merge. Per-device keys are already restored. */
  write(name: string, body: Json): void;
  /** The server deleted it: keep a copy aside, never destroy (requirement F7). */
  remove(name: string): void;
  /** Bring a body to the shape this app version writes (board migrations). */
  normalize(name: string, body: Json): Json;
  /** The highest board schemaVersion this app understands. */
  readonly schemaVersion: number;
  /** True for an untouched new board/list: on a first sync the server's version is taken instead. */
  isPristine?(name: string): boolean;
  // Time log
  timelogBoards(): string[];
  /** Every local entry of a board (for the first upload). */
  timelogAll(boardId: string): Json[];
  /** Adds entries whose id is not yet in that month. */
  timelogMerge(boardId: string, month: string, entries: Json[]): void;
  monthOf(entry: Json): string;
  // Assets
  assets(): Array<{ id: string; ext: string }>;
  readAsset(id: string): { ext: string; bytes: Uint8Array } | null;
  writeAsset(id: string, ext: string, bytes: Uint8Array): void;
}

export interface DocBase {
  rev: number;
  /** The synced body (per-device keys removed), or null for a tombstone. */
  body: Json | null;
}

/** Remembers what the device last agreed with the server (survives restarts). */
export interface SyncStore {
  getBase(name: string): DocBase | null;
  setBase(name: string, base: DocBase | null): void;
  pendingTimelog(): Array<{ boardId: string; month: string; entry: Json }>;
  addPendingTimelog(items: Array<{ boardId: string; month: string; entry: Json }>): void;
  dropPendingTimelog(ids: Set<string>): void;
  flag(key: string): boolean;
  setFlag(key: string, on: boolean): void;
}

export type SyncState =
  | 'off'
  | 'connecting'
  | 'synced'
  | 'syncing'
  | 'offline'
  | 'paused'
  | 'update'
  | 'signed-out';

export interface SyncStatus {
  state: SyncState;
  /** Epoch ms of the last moment everything was in sync. */
  lastSyncedAt: number | null;
  /** Server clock minus this device's clock, in ms (null until measured). */
  clockOffsetMs: number | null;
  /** Documents this device will not upload because a newer KRNL0 wrote them. */
  readOnly: string[];
  message: string | null;
}
