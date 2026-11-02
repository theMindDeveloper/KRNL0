// sys canvas — CLI twin of the top-bar canvas switcher (Decision 33).
//   canvas list [--json]        list canvases (* = active) with free-node counts
//   canvas add <name>           create a canvas and switch to it
//   canvas switch <ref>         make a canvas active (id, name or id prefix)
//   canvas rename <ref> <name>  rename a canvas
//   canvas delete <ref>         delete a canvas and its free content (never mother data)

import { loadBoardFrom, saveBoardTo } from '../../main/persistence/board';
import type { SysResult } from '../SysFacade';
import {
  addCanvas,
  deleteCanvas,
  isSharedNode,
  newCanvasId,
  normalizeCanvases,
  renameCanvas,
  resolveCanvas,
  switchCanvas,
  type CanvasBoardLike,
  type CanvasMeta,
} from '../../shared/canvas';

export interface CanvasCtx {
  boardPath: string;
  onBoardChanged?: () => void;
}

type RawBoard = CanvasBoardLike & Record<string, unknown>;

function load(ctx: CanvasCtx): RawBoard | null {
  const raw = loadBoardFrom(ctx.boardPath);
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { nodes?: unknown }).nodes)) return null;
  return normalizeCanvases(raw as RawBoard);
}

function save(ctx: CanvasCtx, board: RawBoard): void {
  saveBoardTo(ctx.boardPath, { ...board, savedAt: new Date().toISOString() });
  ctx.onBoardChanged?.();
}

function find(board: RawBoard, ref: string | undefined): CanvasMeta | string {
  if (!ref) return 'missing canvas reference';
  const hit = resolveCanvas(board.canvases ?? [], ref);
  if (hit === 'ambiguous') return `canvas "${ref}" is ambiguous`;
  return hit ?? `no canvas "${ref}"`;
}

export function canvasList(ctx: CanvasCtx, json: boolean): SysResult {
  const board = load(ctx);
  if (!board) return { ok: false, message: 'No board found' };
  const rows = (board.canvases ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    active: c.id === board.activeCanvasId,
    nodes: board.nodes.filter((n) => !isSharedNode(n) && n.canvasId === c.id).length,
    strokes: (board.drawings ?? []).filter((s) => s.canvasId === c.id).length,
  }));
  if (json) return { ok: true, message: JSON.stringify(rows), data: rows };
  return {
    ok: true,
    message: rows.map((r) => `${r.active ? '*' : ' '} ${r.id}  ${r.name}  (${r.nodes} nodes, ${r.strokes} strokes)`).join('\n'),
    data: rows,
  };
}

export function canvasAdd(ctx: CanvasCtx, name: string | undefined): SysResult {
  const trimmed = name?.trim();
  if (!trimmed) return { ok: false, message: 'canvas add requires <name>' };
  const board = load(ctx);
  if (!board) return { ok: false, message: 'No board found' };
  const id = newCanvasId();
  save(ctx, switchCanvas(addCanvas(board, trimmed, id), id));
  return { ok: true, message: `added canvas ${id} "${trimmed}" (now active)`, data: { id, name: trimmed } };
}

export function canvasSwitch(ctx: CanvasCtx, ref: string | undefined): SysResult {
  const board = load(ctx);
  if (!board) return { ok: false, message: 'No board found' };
  const c = find(board, ref);
  if (typeof c === 'string') return { ok: false, message: c };
  save(ctx, switchCanvas(board, c.id));
  return { ok: true, message: `switched to canvas "${c.name}"`, data: c };
}

export function canvasRename(ctx: CanvasCtx, ref: string | undefined, name: string | undefined): SysResult {
  const trimmed = name?.trim();
  if (!trimmed) return { ok: false, message: 'canvas rename requires <ref> <name>' };
  const board = load(ctx);
  if (!board) return { ok: false, message: 'No board found' };
  const c = find(board, ref);
  if (typeof c === 'string') return { ok: false, message: c };
  save(ctx, renameCanvas(board, c.id, trimmed));
  return { ok: true, message: `renamed canvas "${c.name}" to "${trimmed}"`, data: { id: c.id, name: trimmed } };
}

export function canvasDelete(ctx: CanvasCtx, ref: string | undefined): SysResult {
  const board = load(ctx);
  if (!board) return { ok: false, message: 'No board found' };
  const c = find(board, ref);
  if (typeof c === 'string') return { ok: false, message: c };
  const next = deleteCanvas(board, c.id);
  if (!next) return { ok: false, message: 'cannot delete the last canvas' };
  const removed = board.nodes.length - next.nodes.length;
  save(ctx, next);
  return { ok: true, message: `deleted canvas "${c.name}" (${removed} free node${removed === 1 ? '' : 's'} removed)`, data: { id: c.id, removed } };
}
