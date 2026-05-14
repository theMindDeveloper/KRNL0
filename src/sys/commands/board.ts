// Board read commands — `krnl board show` prints the current board.json.
// `--json` form prints bare JSON to stdout (no banner, no [stub] prefix).
// `summary` and `stats` print human counts.

import { loadBoardFrom } from '../../main/persistence/board';
import type { SysResult } from '../SysFacade';
import type { BoardShape } from '../../shared/dispatch/types';

export interface BoardCtx {
  boardPath: string;
}

function loadBoard(ctx: BoardCtx): BoardShape {
  const raw = loadBoardFrom(ctx.boardPath);
  if (typeof raw !== 'object' || raw === null) return { nodes: [], edges: [] };
  const b = raw as Record<string, unknown>;
  if (!Array.isArray(b['nodes'])) b['nodes'] = [];
  if (!Array.isArray(b['edges'])) b['edges'] = [];
  return b as BoardShape;
}

/**
 * `krnl board show` — default form prints a human summary.
 * `krnl board show --json` prints `JSON.stringify(board)` and nothing else.
 */
export async function boardShow(ctx: BoardCtx, json = false): Promise<SysResult> {
  const board = loadBoard(ctx);
  if (json) {
    return { ok: true, message: JSON.stringify(board), data: board };
  }
  const counts = countByKind(board);
  const motherCount = board.nodes.filter((n) => n.isMother === true).length;
  const childCount = board.nodes.length - motherCount;
  const kindLines = Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, n]) => `  ${k.padEnd(14)} ${n}`)
    .join('\n');
  const message = [
    `board: ${ctx.boardPath}`,
    `nodes: ${board.nodes.length} (mother: ${motherCount}, child: ${childCount})`,
    `edges: ${board.edges.length}`,
    `by kind:`,
    kindLines || '  (empty)',
  ].join('\n');
  return { ok: true, message, data: { nodes: board.nodes.length, edges: board.edges.length, byKind: counts } };
}

export async function boardSummary(ctx: BoardCtx, json = false): Promise<SysResult> {
  const board = loadBoard(ctx);
  const motherCount = board.nodes.filter((n) => n.isMother === true).length;
  const summary = {
    nodes: board.nodes.length,
    mother: motherCount,
    child: board.nodes.length - motherCount,
    edges: board.edges.length,
  };
  if (json) return { ok: true, message: JSON.stringify(summary), data: summary };
  return {
    ok: true,
    message: `${summary.nodes} nodes (${summary.mother} mother, ${summary.child} child) · ${summary.edges} edges`,
    data: summary,
  };
}

export async function boardStats(ctx: BoardCtx, json = false): Promise<SysResult> {
  const board = loadBoard(ctx);
  const byKind = countByKind(board);
  const edgesByEvent: Record<string, number> = {};
  for (const e of board.edges) {
    const key = e.from.event;
    edgesByEvent[key] = (edgesByEvent[key] ?? 0) + 1;
  }
  const stats = {
    nodesByKind: byKind,
    edgeCount: board.edges.length,
    edgesByEvent,
  };
  if (json) return { ok: true, message: JSON.stringify(stats), data: stats };
  const kindLines = Object.entries(byKind)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, n]) => `  ${k.padEnd(14)} ${n}`)
    .join('\n');
  const eventLines = Object.entries(edgesByEvent)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, n]) => `  ${k.padEnd(20)} ${n}`)
    .join('\n');
  return {
    ok: true,
    message: [
      `nodes by kind:`,
      kindLines || '  (empty)',
      `edges by from-event:`,
      eventLines || '  (none)',
    ].join('\n'),
    data: stats,
  };
}

function countByKind(board: BoardShape): Record<string, number> {
  const out: Record<string, number> = {};
  for (const n of board.nodes) {
    out[n.kind] = (out[n.kind] ?? 0) + 1;
  }
  return out;
}

// Save/load remain stubs — board.json autosaves on every mutation already.
export async function boardSave(path?: string): Promise<SysResult> {
  return { ok: true, message: `[stub] board save → ${path ?? 'default'} (board autosaves on every mutation)` };
}

export async function boardLoad(path?: string): Promise<SysResult> {
  if (!path) return { ok: false, message: 'board load requires a <path>' };
  return { ok: true, message: `[stub] board load ← ${path}` };
}
