// sys draw — CLI twin of the pen tool (canvas drawings on board.drawings).
//   draw list [--json]   list strokes (id, tool, colour, points)
//   draw clear           remove every stroke
//   draw delete <id>     remove one stroke (id prefix)

import { loadBoardFrom, saveBoardTo } from '../../main/persistence/board';
import type { SysResult } from '../SysFacade';
import type { DrawStroke } from '../../shared/types/board';
import { activeCanvasOf, isStrokeOnCanvas, type CanvasMeta } from '../../shared/canvas';

export interface DrawCtx {
  boardPath: string;
  onBoardChanged?: () => void;
}

function load(ctx: DrawCtx): (Record<string, unknown> & { drawings?: DrawStroke[] }) | null {
  const raw = loadBoardFrom(ctx.boardPath);
  return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown> & { drawings?: DrawStroke[] }) : null;
}

function save(ctx: DrawCtx, board: Record<string, unknown>): void {
  saveBoardTo(ctx.boardPath, { ...board, savedAt: new Date().toISOString() });
  ctx.onBoardChanged?.();
}

export function drawList(ctx: DrawCtx, json: boolean): SysResult {
  const board = load(ctx);
  if (!board) return { ok: false, message: 'No board found' };
  const rows = (board.drawings ?? []).map((d) => ({ id: d.id, tool: d.tool, color: d.color, points: d.points.length }));
  if (json) return { ok: true, message: JSON.stringify(rows), data: rows };
  if (rows.length === 0) return { ok: true, message: 'no drawings', data: rows };
  return { ok: true, message: rows.map((r) => `  ${r.id}  ${r.tool.padEnd(11)} ${r.color}  ${r.points} pts`).join('\n'), data: rows };
}

export function drawClear(ctx: DrawCtx): SysResult {
  const board = load(ctx);
  if (!board) return { ok: false, message: 'No board found' };
  // Decision 33 — only the active canvas's strokes.
  const active = activeCanvasOf(board as { canvases?: CanvasMeta[]; activeCanvasId?: string });
  const all = board.drawings ?? [];
  const kept = all.filter((d) => !isStrokeOnCanvas(d, active));
  const n = all.length - kept.length;
  save(ctx, { ...board, drawings: kept });
  return { ok: true, message: `cleared ${n} stroke${n === 1 ? '' : 's'}` };
}

export function drawDelete(ctx: DrawCtx, id: string | undefined): SysResult {
  if (!id) return { ok: false, message: 'draw delete requires <strokeId>' };
  const board = load(ctx);
  if (!board) return { ok: false, message: 'No board found' };
  const all = board.drawings ?? [];
  const exact = all.filter((d) => d.id === id);
  if (exact.length === 0 && id.length < 4) return { ok: false, message: `stroke ref "${id}" is too short — use 4+ characters` };
  const hits = exact.length > 0 ? exact : all.filter((d) => d.id.startsWith(id));
  if (hits.length !== 1) return { ok: false, message: hits.length === 0 ? `no stroke "${id}"` : `stroke "${id}" is ambiguous` };
  save(ctx, { ...board, drawings: all.filter((d) => d.id !== hits[0]!.id) });
  return { ok: true, message: `deleted ${hits[0]!.id}` };
}
