// The desktop's side of sync (Decision 51): board files, the board list, the
// time log and assets in the board folder. Documents are named by board id —
// never by path — because switching boards moves files (Decision 49).
//
//   <dir>/boards.json                 'boards'
//   <dir>/board.json                  'board:<activeId>'
//   <dir>/boards/<id>/board.json      'board:<id>' (parked)
//
// Everything written here came from the server or a merge, so it is written
// `quietly` (the write observers stay silent: no echo upload).

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { migrateBoard, readBoardText, saveBoardTo, writeFileAtomic } from '../persistence/board';
import { BOARDS_DIRNAME, BOARDS_INDEX, BOARD_FILE, deleteBoard } from '../persistence/boards';
import { appendTimeLogEntries, readTimeLog, readTimeLogMonth } from '../persistence/timelog';
import { monthKeyOf, type TimeLogEntry } from '../../shared/timelog';
import { docName } from '../../shared/sync/shape';
import type { Json, SyncHost } from '../../shared/sync/types';
import { quietly } from './observers';

const ASSET_FILE = /^([A-Za-z0-9_-]{8,64})\.([a-z0-9]{1,10})$/;
const isObject = (v: Json): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export interface DesktopHostDeps {
  boardDir: string;
  /** The open window re-reads the board (board:changed). */
  notifyBoardChanged: () => void;
  /** Open another board (files swap, window reloads). False when it could not. */
  switchToBoard: (id: string) => boolean;
}

interface Index { activeId: string; boards: Array<{ id: string; name: string }>; [k: string]: Json }

export class DesktopHost implements SyncHost {
  readonly schemaVersion = 2;
  private readonly dir: string;
  private readonly assetsDir: string;

  constructor(private readonly deps: DesktopHostDeps) {
    this.dir = deps.boardDir;
    this.assetsDir = join(deps.boardDir, 'assets');
  }

  // ── Board list and boards ───────────────────────────────────────────────

  private index(): Index | null {
    try {
      const raw = JSON.parse(readFileSync(join(this.dir, BOARDS_INDEX), 'utf-8')) as Index;
      return Array.isArray(raw.boards) ? raw : null;
    } catch {
      return null;
    }
  }

  private boardDirOf(id: string): string {
    const idx = this.index();
    return idx && idx.activeId === id ? this.dir : join(this.dir, BOARDS_DIRNAME, id);
  }

  /** Doc name for a path the write observer saw, or null when it is not synced. */
  docForPath(path: string): string | null {
    const p = path.replace(/\\/g, '/');
    const root = this.dir.replace(/\\/g, '/');
    if (p === `${root}/${BOARDS_INDEX}`) return 'boards';
    if (p === `${root}/${BOARD_FILE}`) { const idx = this.index(); return idx ? docName.board(idx.activeId) : null; }
    const m = new RegExp(`^${root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/${BOARDS_DIRNAME}/([^/]+)/${BOARD_FILE}$`).exec(p);
    return m && m[1] && !m[1].startsWith('.') ? docName.board(m[1]) : null;
  }

  /** The board id whose files live in this folder (time log observer). */
  boardIdForDir(boardDir: string): string | null {
    const p = boardDir.replace(/\\/g, '/').replace(/\/$/, '');
    const root = this.dir.replace(/\\/g, '/');
    if (p === root) return this.index()?.activeId ?? null;
    const m = new RegExp(`/${BOARDS_DIRNAME}/([^/]+)$`).exec(p);
    return m?.[1] && !m[1].startsWith('.') ? m[1] : null;
  }

  localDocs(): string[] {
    const idx = this.index();
    if (!idx) return [];
    const out = ['boards'];
    for (const b of idx.boards) if (existsSync(join(this.boardDirOf(b.id), BOARD_FILE))) out.push(docName.board(b.id));
    return out;
  }

  read(name: string): Json | null {
    if (name === 'boards') return this.index();
    const id = docName.boardId(name);
    if (!id) return null;
    const idx = this.index();
    if (!idx || !idx.boards.some((b) => b.id === id)) return null;
    const text = readBoardText(join(this.boardDirOf(id), BOARD_FILE));
    if (text === null) return null;
    try { return JSON.parse(text) as Json; } catch { return null; }
  }

  write(name: string, body: Json): void {
    if (name === 'boards') return this.writeIndex(body);
    const id = docName.boardId(name);
    if (!id || !isObject(body)) return;
    const idx = this.index();
    const isActive = idx?.activeId === id;
    const dir = this.boardDirOf(id);
    mkdirSync(dir, { recursive: true });
    quietly(() => saveBoardTo(join(dir, BOARD_FILE), body));
    // A board that arrived before the list names it: list it, so it shows in the menu.
    if (idx && !idx.boards.some((b) => b.id === id)) {
      quietly(() => writeFileAtomic(join(this.dir, BOARDS_INDEX), JSON.stringify({ ...idx, boards: [...idx.boards, { id, name: 'Board' }] }, null, 2)));
    }
    if (isActive) this.deps.notifyBoardChanged();
  }

  private writeIndex(body: Json): void {
    if (!isObject(body) || !Array.isArray(body.boards)) return;
    const local = this.index();
    const next = clone(body) as Index;
    // The open board must be one of the listed boards. A fresh device that took
    // the server's list keeps its folder and opens the first listed board there.
    if (!next.boards.some((b) => b.id === next.activeId)) next.activeId = next.boards[0]?.id ?? local?.activeId ?? '';
    quietly(() => writeFileAtomic(join(this.dir, BOARDS_INDEX), JSON.stringify(next, null, 2)));
    if (local && local.activeId !== next.activeId) this.deps.notifyBoardChanged();
  }

  remove(name: string): void {
    const id = docName.boardId(name);
    if (!id) return;
    const idx = this.index();
    if (!idx) return;
    if (idx.activeId === id) {
      const other = idx.boards.find((b) => b.id !== id);
      if (!other || !this.deps.switchToBoard(other.id)) return; // the last board stays
    }
    // Moves the board's files to boards/.deleted/ (kept) and drops it from the list.
    quietly(() => deleteBoard(this.dir, id));
  }

  normalize(name: string, body: Json): Json {
    if (!name.startsWith('board:') || !isObject(body)) return body;
    try { return migrateBoard(clone(body)) as Json; } catch { return body; }
  }

  /** A new board nobody has used yet: only the mother windows, nothing in them. */
  isPristine(name: string): boolean {
    if (name === 'boards') {
      const idx = this.index();
      return !!idx && idx.boards.length === 1 && this.isPristine(docName.board(idx.boards[0]!.id));
    }
    const b = this.read(name);
    if (!isObject(b)) return false;
    const nodes = Array.isArray(b.nodes) ? (b.nodes as Array<Record<string, Json>>) : [];
    const edges = Array.isArray(b.edges) ? b.edges : [];
    if (edges.length > 0 || nodes.some((n) => n.isMother !== true)) return false;
    const hasItems = (v: Json): boolean => Array.isArray(v) ? v.length > 0 : isObject(v) ? Object.values(v).some(hasItems) : false;
    return !nodes.some((n) => hasItems(n.state ?? null));
  }

  // ── Time log ────────────────────────────────────────────────────────────

  timelogBoards(): string[] {
    return (this.index()?.boards ?? []).map((b) => b.id).filter((id) => existsSync(join(this.boardDirOf(id), 'timelog')));
  }

  timelogAll(boardId: string): Json[] {
    return readTimeLog(this.boardDirOf(boardId)) as unknown as Json[];
  }

  timelogMerge(boardId: string, _serverMonth: string, entries: Json[]): void {
    const dir = this.boardDirOf(boardId);
    // Local files are by local month; the server's by UTC month. Group again here.
    const byMonth = new Map<string, TimeLogEntry[]>();
    for (const e of entries) {
      const at = (e as { at?: string }).at;
      if (typeof at !== 'string') continue;
      const key = monthKeyOf(at);
      byMonth.set(key, [...(byMonth.get(key) ?? []), e as TimeLogEntry]);
    }
    for (const [month, list] of byMonth) {
      const have = new Set(readTimeLogMonth(dir, month).map((x) => x.id));
      const fresh = list.filter((x) => !have.has(x.id));
      if (fresh.length > 0) quietly(() => appendTimeLogEntries(dir, fresh));
    }
  }

  /** The server files entries by UTC month, so every device agrees on the month. */
  monthOf(entry: Json): string {
    const at = (entry as { at?: string }).at;
    return typeof at === 'string' ? new Date(at).toISOString().slice(0, 7) : '1970-01';
  }

  // ── Assets ──────────────────────────────────────────────────────────────

  assets(): Array<{ id: string; ext: string }> {
    if (!existsSync(this.assetsDir)) return [];
    return readdirSync(this.assetsDir).flatMap((f) => {
      const m = ASSET_FILE.exec(f);
      return m && m[1] && m[2] ? [{ id: m[1], ext: m[2] }] : [];
    });
  }

  readAsset(id: string): { ext: string; bytes: Uint8Array } | null {
    const hit = this.assets().find((a) => a.id === id);
    if (!hit) return null;
    const path = join(this.assetsDir, `${hit.id}.${hit.ext}`);
    // Very large media stays local until the owner opens it elsewhere (sync.md, Speed).
    if (statSync(path).size > 500 * 1024 * 1024) return null;
    return { ext: hit.ext, bytes: new Uint8Array(readFileSync(path)) };
  }

  writeAsset(id: string, ext: string, bytes: Uint8Array): void {
    if (!ASSET_FILE.test(`${id}.${ext}`)) return;
    mkdirSync(this.assetsDir, { recursive: true });
    const path = join(this.assetsDir, `${id}.${ext}`);
    const tmp = `${path}.${process.pid}-${Math.random().toString(36).slice(2, 8)}.tmp`;
    writeFileSync(tmp, bytes);
    renameSync(tmp, path);
  }
}
