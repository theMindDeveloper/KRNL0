// Separate boards (Decision 49, docs/06-requirements/boards.md). Main process
// and sys CLI only; pure fs, no Electron.
//
// A board is complete on its own: todos, habits, calendar, timer history,
// analytics (the time log), notes and drawings. Nothing is shared between
// boards.
//
// How it is stored, so that nothing else in the app has to change:
//
//   <dir>/board.json, <dir>/timelog/     the ACTIVE board (as before)
//   <dir>/boards.json                    the list of boards and which is active
//   <dir>/boards/<id>/board.json, …/timelog/   every other board, parked
//
// Switching parks the active board's files in its folder and brings the
// target's files back to <dir>. Every reader of board.json (the window, the
// CLI, reminders, the floating timer) therefore always sees the active board.

import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'fs';
import { join } from 'path';
import { isSharedNode } from '../../shared/canvas';
import { readBoardText, saveBoardTo, seedBoard, writeFileAtomic } from './board';
import { TIMELOG_DIRNAME } from './timelog';

export const BOARDS_INDEX = 'boards.json';
export const BOARDS_DIRNAME = 'boards';
export const BOARD_FILE = 'board.json';

export interface BoardMeta { id: string; name: string }
export interface BoardRecording { boardId: string; startedAt: string; label: string }
export interface BoardsIndex {
  version: 1;
  activeId: string;
  boards: BoardMeta[];
  /** A timer left running (or on a break) in a board that is not the active one. */
  recording?: BoardRecording | null;
  /** Set once by the canvases → boards migration; cleared when the owner has read it. */
  notice?: { kept: string; others: string[] } | null;
}
export interface BoardRow extends BoardMeta { active: boolean; plans: number; habits: number }
export interface BoardsList { activeId: string; boards: BoardRow[]; recording: BoardRecording | null; notice: BoardsIndex['notice'] }

type Raw = Record<string, unknown> & { nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>> };

const indexPath = (dir: string): string => join(dir, BOARDS_INDEX);
const parkedDir = (dir: string, id: string): string => join(dir, BOARDS_DIRNAME, id);
const activeBoardPath = (dir: string): string => join(dir, BOARD_FILE);

export function newBoardId(now = Date.now()): string {
  return `board-${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function readRaw(path: string): Raw | null {
  if (!existsSync(path)) return null;
  const text = readBoardText(path);
  if (text === null) return null;
  try {
    const parsed = JSON.parse(text) as Raw;
    if (!Array.isArray(parsed.nodes)) parsed.nodes = [];
    if (!Array.isArray(parsed.edges)) parsed.edges = [];
    return parsed;
  } catch {
    return null;
  }
}

function writeIndex(dir: string, index: BoardsIndex): void {
  mkdirSync(dir, { recursive: true });
  writeFileAtomic(indexPath(dir), JSON.stringify(index, null, 2));
}

function mother(board: Raw | null, kind: string): Record<string, unknown> | undefined {
  return board?.nodes.find((n) => n.kind === kind && n.isMother === true);
}

/** One fact per board for the menu: open plans and habits. */
function factsOf(board: Raw | null): { plans: number; habits: number } {
  const items = (mother(board, 'todo')?.state as { items?: Array<{ done?: boolean }> } | undefined)?.items ?? [];
  const habits = (mother(board, 'habit')?.state as { habits?: Array<{ archived?: boolean }> } | undefined)?.habits ?? [];
  return { plans: items.filter((i) => !i.done).length, habits: habits.filter((h) => !h.archived).length };
}

/** A timer that is running, paused or on a break in this board. */
function recordingOf(board: Raw | null, boardId: string): BoardRecording | null {
  const st = mother(board, 'pomo')?.state as { status?: string; startedAt?: string | null; label?: string } | undefined;
  if (!st || !['running', 'paused', 'break'].includes(st.status ?? '')) return null;
  return { boardId, startedAt: st.startedAt ?? new Date().toISOString(), label: st.label ?? '' };
}

/**
 * Canvases → boards, once (boards.md F8). Until now every canvas shared the
 * same plans, habits and timer. The first canvas keeps all of that and its own
 * free content; each other canvas becomes a board with its own free content
 * (notes, images, drawings, and the links among them) and fresh, empty lists.
 * The file as it was is copied aside first.
 */
function migrateCanvasesToBoards(dir: string): BoardsIndex {
  const path = activeBoardPath(dir);
  const board = readRaw(path);
  const canvases = (board?.canvases as BoardMeta[] | undefined)?.filter((c) => c && typeof c.id === 'string') ?? [];
  if (!board || canvases.length <= 1) {
    const only = canvases[0];
    const id = only?.id ?? 'board-main';
    return { version: 1, activeId: id, boards: [{ id, name: only?.name ?? 'Main' }], recording: null, notice: null };
  }

  copyFileSync(path, join(dir, `board.json.before-boards-${new Date().toISOString().slice(0, 10)}`));
  const first = canvases[0]!;
  const others = canvases.slice(1);
  const drawings = (board.drawings as Array<Record<string, unknown>> | undefined) ?? [];
  const freeOn = (canvasId: string) => board.nodes.filter((n) => !isSharedNode(n as { kind: string; isMother?: boolean }) && n.canvasId === canvasId);

  for (const c of others) {
    const nodes = freeOn(c.id);
    const ids = new Set(nodes.map((n) => n.id as string));
    const edges = board.edges.filter((e) => {
      const from = (e.from as { nodeId?: string } | undefined)?.nodeId;
      const to = (e.to as { nodeId?: string } | undefined)?.nodeId;
      return !!from && !!to && ids.has(from) && ids.has(to);
    });
    const seed = seedBoard() as unknown as Raw;
    const parked: Raw = {
      ...seed,
      uiMode: board.uiMode ?? seed.uiMode,
      layoutMode: board.layoutMode ?? seed.layoutMode,
      canvases: [{ id: c.id, name: c.name }],
      activeCanvasId: c.id,
      nodes: [...seed.nodes, ...nodes],
      edges: [...seed.edges, ...edges],
      drawings: drawings.filter((s) => s.canvasId === c.id),
    };
    mkdirSync(parkedDir(dir, c.id), { recursive: true });
    saveBoardTo(join(parkedDir(dir, c.id), BOARD_FILE), parked);
  }

  const gone = new Set(others.flatMap((c) => freeOn(c.id).map((n) => n.id as string)));
  const goneCanvas = new Set(others.map((c) => c.id));
  const kept: Raw = {
    ...board,
    canvases: [first],
    activeCanvasId: first.id,
    nodes: board.nodes.filter((n) => !gone.has(n.id as string)),
    edges: board.edges.filter((e) => {
      const from = (e.from as { nodeId?: string } | undefined)?.nodeId;
      const to = (e.to as { nodeId?: string } | undefined)?.nodeId;
      return !(from && gone.has(from)) && !(to && gone.has(to));
    }),
    drawings: drawings.filter((s) => !goneCanvas.has(s.canvasId as string)),
    savedAt: new Date().toISOString(),
  };
  saveBoardTo(path, kept);
  return {
    version: 1,
    activeId: first.id,
    boards: canvases.map((c) => ({ id: c.id, name: c.name })),
    recording: null,
    notice: { kept: first.name, others: others.map((c) => c.name) },
  };
}

/** The list of boards. Created on first use (with the one-time migration). */
export function readBoardsIndex(dir: string): BoardsIndex {
  const path = indexPath(dir);
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as BoardsIndex;
      if (Array.isArray(parsed.boards) && parsed.boards.length > 0 && parsed.boards.some((b) => b.id === parsed.activeId)) return parsed;
    } catch { /* rebuilt below */ }
  }
  const index = migrateCanvasesToBoards(dir);
  writeIndex(dir, index);
  return index;
}

export function resolveBoard(index: BoardsIndex, ref: string | undefined): BoardMeta | string {
  const r = ref?.trim();
  if (!r) return 'missing board name';
  const exact = index.boards.filter((b) => b.id === r || b.name.toLowerCase() === r.toLowerCase());
  if (exact.length === 1) return exact[0]!;
  const loose = index.boards.filter((b) => b.id.startsWith(r) || b.name.toLowerCase().startsWith(r.toLowerCase()));
  if (loose.length === 1) return loose[0]!;
  return loose.length > 1 || exact.length > 1 ? `board "${r}" is ambiguous` : `no board "${r}"`;
}

export function listBoards(dir: string): BoardsList {
  const index = readBoardsIndex(dir);
  const boards = index.boards.map((b) => {
    const active = b.id === index.activeId;
    const raw = readRaw(active ? activeBoardPath(dir) : join(parkedDir(dir, b.id), BOARD_FILE));
    return { ...b, active, ...factsOf(raw) };
  });
  const rec = index.recording && index.recording.boardId !== index.activeId && index.boards.some((b) => b.id === index.recording!.boardId)
    ? index.recording : null;
  return { activeId: index.activeId, boards, recording: rec, notice: index.notice ?? null };
}

export function ackBoardsNotice(dir: string): void {
  const index = readBoardsIndex(dir);
  if (!index.notice) return;
  writeIndex(dir, { ...index, notice: null });
}

/** A new, parked board: empty, or with the active board's habits (their history starts at zero). */
export function createBoard(dir: string, name: string | undefined, opts: { copyHabits?: boolean } = {}): BoardMeta | string {
  const trimmed = name?.trim();
  if (!trimmed) return 'a board needs a name';
  const index = readBoardsIndex(dir);
  if (index.boards.some((b) => b.name.toLowerCase() === trimmed.toLowerCase())) return `there is already a board called "${trimmed}"`;
  const id = newBoardId();
  const seed = seedBoard() as unknown as Raw;
  const active = readRaw(activeBoardPath(dir));
  // The app-wide choices come along: Easy or Advanced, the layout.
  if (active?.uiMode) seed.uiMode = active.uiMode;
  if (active?.layoutMode) seed.layoutMode = active.layoutMode;
  if (opts.copyHabits) {
    const from = (mother(active, 'habit')?.state as { habits?: Array<Record<string, unknown>> } | undefined)?.habits ?? [];
    const target = mother(seed, 'habit');
    if (target) {
      const state = (target.state ?? {}) as Record<string, unknown>;
      target.state = {
        ...state,
        habits: from.filter((h) => !h.archived).map((h) => {
          const { log: _l, counts: _c, exceptions: _e, ...rest } = h;
          void _l; void _c; void _e;
          return { ...rest, log: [] };
        }),
      };
    }
  }
  mkdirSync(parkedDir(dir, id), { recursive: true });
  saveBoardTo(join(parkedDir(dir, id), BOARD_FILE), seed);
  const meta = { id, name: trimmed };
  writeIndex(dir, { ...index, boards: [...index.boards, meta] });
  return meta;
}

export function renameBoard(dir: string, ref: string | undefined, name: string | undefined): BoardMeta | string {
  const trimmed = name?.trim();
  if (!trimmed) return 'a board needs a name';
  const index = readBoardsIndex(dir);
  const hit = resolveBoard(index, ref);
  if (typeof hit === 'string') return hit;
  if (index.boards.some((b) => b.id !== hit.id && b.name.toLowerCase() === trimmed.toLowerCase())) return `there is already a board called "${trimmed}"`;
  const meta = { id: hit.id, name: trimmed };
  writeIndex(dir, { ...index, boards: index.boards.map((b) => (b.id === hit.id ? meta : b)) });
  return meta;
}

/** Deletes a parked board. Its files are kept in boards/.deleted/ (never the active or the last board). */
export function deleteBoard(dir: string, ref: string | undefined): BoardMeta | string {
  const index = readBoardsIndex(dir);
  const hit = resolveBoard(index, ref);
  if (typeof hit === 'string') return hit;
  if (index.boards.length <= 1) return 'cannot delete the last board';
  if (hit.id === index.activeId) return 'switch to another board first: the open board cannot be deleted';
  const from = parkedDir(dir, hit.id);
  if (existsSync(from)) {
    const bin = join(dir, BOARDS_DIRNAME, '.deleted');
    mkdirSync(bin, { recursive: true });
    renameSync(from, join(bin, `${hit.id}-${new Date().toISOString().slice(0, 10)}-${Date.now().toString(36)}`));
  }
  writeIndex(dir, {
    ...index,
    boards: index.boards.filter((b) => b.id !== hit.id),
    recording: index.recording?.boardId === hit.id ? null : index.recording ?? null,
  });
  return hit;
}

function moveInto(from: string, to: string): void {
  if (!existsSync(from)) return;
  if (existsSync(to)) rmSync(to, { recursive: true, force: true });
  renameSync(from, to);
}

/**
 * Makes `ref` the active board: parks the active board's files, brings the
 * target's back. If the second half fails, the first is undone, so there is
 * always a board.json. The caller reloads the window afterwards.
 */
export function switchBoard(dir: string, ref: string | undefined): BoardMeta | string {
  const index = readBoardsIndex(dir);
  const hit = resolveBoard(index, ref);
  if (typeof hit === 'string') return hit;
  if (hit.id === index.activeId) return hit;

  const here = activeBoardPath(dir);
  const hereLog = join(dir, TIMELOG_DIRNAME);
  const park = parkedDir(dir, index.activeId);
  const target = parkedDir(dir, hit.id);
  const leaving = recordingOf(readRaw(here), index.activeId);

  mkdirSync(park, { recursive: true });
  moveInto(here, join(park, BOARD_FILE));
  moveInto(hereLog, join(park, TIMELOG_DIRNAME));
  try {
    if (existsSync(join(target, BOARD_FILE))) moveInto(join(target, BOARD_FILE), here);
    else saveBoardTo(here, seedBoard());
    moveInto(join(target, TIMELOG_DIRNAME), hereLog);
  } catch (err) {
    // Put the board we were leaving back, so the app still opens.
    if (!existsSync(here)) moveInto(join(park, BOARD_FILE), here);
    if (!existsSync(hereLog)) moveInto(join(park, TIMELOG_DIRNAME), hereLog);
    return `could not switch board (${err instanceof Error ? err.message : String(err)})`;
  }

  // One timer at a time: remember where one is still running.
  const arriving = recordingOf(readRaw(here), hit.id);
  const recording = leaving ?? (index.recording && index.recording.boardId !== hit.id ? index.recording : null);
  writeIndex(dir, { ...index, activeId: hit.id, recording: arriving ? null : recording });
  return hit;
}
