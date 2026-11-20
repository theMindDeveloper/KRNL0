// The web app's boards, time log and pictures (Decision 51, server-sync.md).
// Same rules as the desktop host (src/main/sync/host.ts), kept in memory and
// in this browser's IndexedDB instead of board files:
//   idx            the board list (with this browser's activeId)
//   b:<id>         a board, with this browser's own keys (viewport, layout…)
//   tl:<boardId>   the time log of a board (entries, any order)
//   a:<id>         a picture or file { ext, bytes }
//   aside:<id>:<t> a board another device deleted, kept here (F7)

import { migrateBoard, seedBoard } from '../../shared/boardMigrate';
import { docName } from '../../shared/sync/shape';
import { monthKeyOf, sortEntries, type TimeLogEntry } from '../../shared/timelog';
import type { Json, SyncHost } from '../../shared/sync/types';
import type { Kv } from './kv';

const isObject = (v: unknown): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const ASSET_ID = /^[A-Za-z0-9_-]{8,64}$/;
const ASSET_EXT = /^[a-z0-9]{1,10}$/;
/** Same look-back as the desktop's time log query (persistence/timelog.ts). */
const QUERY_LOOKBACK_MONTHS = 2;

export interface BoardMeta { id: string; name: string }
export interface Index { version: 1; activeId: string; boards: BoardMeta[]; [k: string]: Json }

export interface WebHostEvents {
  /** The open board changed underneath the page (sync, another tab). */
  activeChanged: () => void;
  /** The open board is gone or another one was chosen: the page reloads onto it. */
  activeSwitched: () => void;
}

export function newBoardId(now = Date.now()): string {
  return `board-${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const ULID_ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** The desktop's asset id shape (ipc/assets.ts): 26 characters, URL-safe. */
export function newAssetId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < 26; i++) out += ULID_ALPHA[bytes[i % 16]! % 32];
  return out;
}

function mother(board: Json | null, kind: string): Record<string, Json> | undefined {
  if (!isObject(board) || !Array.isArray(board.nodes)) return undefined;
  return (board.nodes as Json[]).find((n): n is Record<string, Json> => isObject(n) && n.kind === kind && n.isMother === true);
}

export class WebHost implements SyncHost {
  readonly schemaVersion = 2;
  private index: Index | null = null;
  private boards = new Map<string, Json>();
  private timelog = new Map<string, Map<string, Json>>();
  private files = new Map<string, { ext: string; bytes: Uint8Array }>();
  private events: WebHostEvents = { activeChanged: () => {}, activeSwitched: () => {} };

  constructor(private readonly kv: Kv) {}

  on(events: Partial<WebHostEvents>): void { this.events = { ...this.events, ...events }; }

  /** Fills memory from what this browser stored. */
  load(all: Map<string, unknown>): void {
    for (const [k, v] of all) {
      if (k === 'idx' && isObject(v) && Array.isArray(v.boards)) this.index = v as Index;
      else if (k.startsWith('b:')) this.boards.set(k.slice(2), v as Json);
      else if (k.startsWith('tl:') && Array.isArray(v)) this.timelog.set(k.slice(3), new Map((v as Json[]).flatMap((e) => (isObject(e) && typeof e.id === 'string' ? [[e.id, e] as [string, Json]] : []))));
      else if (k.startsWith('a:') && isObject(v) && typeof v.ext === 'string' && v.bytes instanceof Uint8Array) this.files.set(k.slice(2), { ext: v.ext, bytes: v.bytes });
    }
  }

  // ── What the page uses ──────────────────────────────────────────────────

  hasBoards(): boolean { return !!this.index && this.index.boards.length > 0 && this.boards.size > 0; }
  activeId(): string | null { return this.index?.activeId ?? null; }
  list(): Index | null { return this.index ? clone(this.index) : null; }

  /** The open board, migrated to this version's shape. */
  activeBoard(): Json | null {
    const id = this.activeId();
    const b = id ? this.boards.get(id) : undefined;
    return b === undefined ? null : this.normalize(docName.board(id!), b);
  }

  /** A save from this page: memory now, IndexedDB a moment later. */
  saveBoard(id: string, body: Json): void {
    this.boards.set(id, clone(body));
    this.kv.set(`b:${id}`, this.boards.get(id));
  }

  saveIndex(next: Index): void {
    this.index = clone(next);
    this.kv.set('idx', this.index);
  }

  /** First start with an empty server: one new board, here. */
  startFresh(name = 'Board'): string {
    const id = newBoardId();
    this.saveBoard(id, migrateBoard(seedBoard()) as Json);
    this.saveIndex({ version: 1, activeId: id, boards: [{ id, name }] });
    return id;
  }

  setActive(id: string): boolean {
    if (!this.index || !this.index.boards.some((b) => b.id === id)) return false;
    this.saveIndex({ ...this.index, activeId: id });
    return true;
  }

  facts(id: string): { plans: number; habits: number } {
    const b = this.boards.get(id) ?? null;
    const items = (mother(b, 'todo')?.state as { items?: Array<{ done?: boolean }> } | undefined)?.items ?? [];
    const habits = (mother(b, 'habit')?.state as { habits?: Array<{ archived?: boolean }> } | undefined)?.habits ?? [];
    return { plans: items.filter((i) => !i.done).length, habits: habits.filter((h) => !h.archived).length };
  }

  /** New entries from this page (already stamped). */
  appendTimelog(boardId: string, entries: TimeLogEntry[]): void {
    const m = this.timelog.get(boardId) ?? new Map<string, Json>();
    for (const e of entries) m.set(e.id, e as unknown as Json);
    this.timelog.set(boardId, m);
    this.kv.set(`tl:${boardId}`, [...m.values()]);
  }

  /** The desktop's query: everything from a little before `fromYMD` on (fold clips). */
  queryTimelog(boardId: string, fromYMD: string): TimeLogEntry[] {
    const [y, mo] = fromYMD.split('-').map(Number) as [number, number];
    const d = new Date(y, mo - 1 - QUERY_LOOKBACK_MONTHS, 1);
    const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const all = [...(this.timelog.get(boardId)?.values() ?? [])] as unknown as TimeLogEntry[];
    return sortEntries(all.filter((e) => typeof e.at === 'string' && monthKeyOf(e.at) >= from));
  }

  deleteFile(id: string): void { this.files.delete(id); this.kv.del(`a:${id}`); }

  // ── SyncHost ────────────────────────────────────────────────────────────

  localDocs(): string[] {
    if (!this.index) return [];
    return ['boards', ...this.index.boards.filter((b) => this.boards.has(b.id)).map((b) => docName.board(b.id))];
  }

  read(name: string): Json | null {
    if (name === 'boards') return this.index ? clone(this.index) : null;
    const id = docName.boardId(name);
    if (!id || !this.index?.boards.some((b) => b.id === id)) return null;
    const b = this.boards.get(id);
    return b === undefined ? null : clone(b);
  }

  write(name: string, body: Json): void {
    if (name === 'boards') return this.writeIndex(body);
    const id = docName.boardId(name);
    if (!id || !isObject(body)) return;
    this.saveBoard(id, body);
    // A board that arrived before the list names it: list it, so it shows in the menu.
    if (this.index && !this.index.boards.some((b) => b.id === id)) {
      this.saveIndex({ ...this.index, boards: [...this.index.boards, { id, name: 'Board' }] });
    }
    if (this.index?.activeId === id) this.events.activeChanged();
  }

  private writeIndex(body: Json): void {
    if (!isObject(body) || !Array.isArray(body.boards)) return;
    const before = this.index?.activeId ?? null;
    const next = clone(body) as Index;
    // The open board must be one of the listed boards.
    if (!next.boards.some((b) => b.id === next.activeId)) {
      next.activeId = (before && next.boards.some((b) => b.id === before) ? before : next.boards[0]?.id) ?? '';
    }
    this.saveIndex(next);
    if (before !== null && before !== next.activeId) this.events.activeSwitched();
  }

  remove(name: string): void {
    const id = docName.boardId(name);
    if (!id || !this.index) return;
    const kept = this.boards.get(id);
    if (kept !== undefined) this.kv.set(`aside:${id}:${Date.now()}`, kept);
    const others = this.index.boards.filter((b) => b.id !== id);
    const wasActive = this.index.activeId === id;
    if (wasActive && others.length === 0) return; // the last board stays
    this.boards.delete(id);
    this.kv.del(`b:${id}`);
    this.saveIndex({ ...this.index, boards: others, activeId: wasActive ? others[0]!.id : this.index.activeId });
    if (wasActive) this.events.activeSwitched();
  }

  normalize(name: string, body: Json): Json {
    if (!name.startsWith('board:') || !isObject(body)) return body;
    try { return migrateBoard(clone(body)) as Json; } catch { return body; }
  }

  isPristine(name: string): boolean {
    if (name === 'boards') {
      return !!this.index && this.index.boards.length === 1 && this.isPristine(docName.board(this.index.boards[0]!.id));
    }
    const b = this.read(name);
    if (!isObject(b)) return false;
    const nodes = Array.isArray(b.nodes) ? (b.nodes as Array<Record<string, Json>>) : [];
    const edges = Array.isArray(b.edges) ? b.edges : [];
    if (edges.length > 0 || nodes.some((n) => n.isMother !== true)) return false;
    const hasItems = (v: Json): boolean => (Array.isArray(v) ? v.length > 0 : isObject(v) ? Object.values(v).some(hasItems) : false);
    return !nodes.some((n) => hasItems(n.state ?? null));
  }

  timelogBoards(): string[] { return [...this.timelog.keys()].filter((id) => (this.timelog.get(id)?.size ?? 0) > 0); }

  timelogAll(boardId: string): Json[] { return [...(this.timelog.get(boardId)?.values() ?? [])]; }

  timelogMerge(boardId: string, _month: string, entries: Json[]): void {
    const m = this.timelog.get(boardId) ?? new Map<string, Json>();
    let added = 0;
    for (const e of entries) if (isObject(e) && typeof e.id === 'string' && !m.has(e.id)) { m.set(e.id, e); added++; }
    if (added === 0) return;
    this.timelog.set(boardId, m);
    this.kv.set(`tl:${boardId}`, [...m.values()]);
  }

  /** The server files entries by UTC month, so every device agrees on the month. */
  monthOf(entry: Json): string {
    const at = isObject(entry) ? entry.at : undefined;
    return typeof at === 'string' ? new Date(at).toISOString().slice(0, 7) : '1970-01';
  }

  assets(): Array<{ id: string; ext: string }> { return [...this.files].map(([id, f]) => ({ id, ext: f.ext })); }

  readAsset(id: string): { ext: string; bytes: Uint8Array } | null { return this.files.get(id) ?? null; }

  writeAsset(id: string, ext: string, bytes: Uint8Array): void {
    if (!ASSET_ID.test(id) || !ASSET_EXT.test(ext)) return;
    this.files.set(id, { ext, bytes });
    this.kv.set(`a:${id}`, { ext, bytes });
  }
}
