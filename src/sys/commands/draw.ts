// sys draw — CLI twin of the pen tool (canvas drawings on board.drawings).
//   draw list [--json]   list strokes (id, tool, colour, points)
//   draw clear           remove every stroke
//   draw delete <id>     remove one stroke (id prefix)

import { loadBoardFrom, saveBoardTo } from '../../main/persistence/board';
import type { SysResult } from '../SysFacade';
import type { DrawStroke, DrawTool } from '../../shared/types/board';
import { randomUUID } from 'crypto';
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

const TOOLS: readonly DrawTool[] = ['pen', 'marker', 'highlighter', 'arrow'];

/**
 * `draw stroke --points "x,y x,y …" [--tool …] [--color c] [--size n]` — the pen
 * tool from the CLI: a stroke through canvas (flow) coordinates on the active
 * canvas. An arrow points from the first point to the last.
 */
export function drawStroke(
  ctx: DrawCtx,
  opts: { points: string | undefined; tool: string | undefined; color: string | undefined; size: number | undefined },
): SysResult {
  const pts = (opts.points ?? '').trim().split(/\s+/).filter(Boolean).map((p) => p.split(',').map(Number));
  if (pts.length < 2 || pts.some((p) => p.length !== 2 || !p.every(Number.isFinite))) {
    return { ok: false, message: 'draw stroke requires --points "x,y x,y …" (two or more canvas points)' };
  }
  const tool = (opts.tool ?? 'pen') as DrawTool;
  if (!TOOLS.includes(tool)) return { ok: false, message: `draw stroke: unknown tool "${opts.tool}" (${TOOLS.join(', ')})` };
  const size = opts.size !== undefined && opts.size > 0 ? opts.size : tool === 'highlighter' ? 14 : tool === 'marker' ? 6 : 3;
  const board = load(ctx);
  if (!board) return { ok: false, message: 'No board found' };
  const canvasId = activeCanvasOf(board as { canvases?: CanvasMeta[]; activeCanvasId?: string });
  const stroke: DrawStroke = {
    id: `stroke-${randomUUID()}`,
    tool,
    color: opts.color ?? '#c9f158',
    size,
    points: pts.map(([x, y]) => [x!, y!, 0.5]),
    createdAt: new Date().toISOString(),
    canvasId,
  };
  save(ctx, { ...board, drawings: [...(board.drawings ?? []), stroke] });
  return { ok: true, message: `stroke added: ${stroke.id} (${tool}, ${pts.length} points)`, data: { id: stroke.id } };
}
