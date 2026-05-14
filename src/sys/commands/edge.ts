// Edge CRUD — real board.json operations. Edges wire `from.event → to.command`.
// `--from <nodeRef:event>` and `--to <nodeRef:command>` resolve node refs via
// resolveNodeRef (full id, ≥4-char prefix, or unique text match).

import { randomUUID } from 'crypto';
import { loadBoardFrom, saveBoardTo } from '../../main/persistence/board';
import type { SysResult } from '../SysFacade';
import type { BoardShape, AnyEdge } from '../../shared/dispatch/types';
import { resolveNodeRef, resolveEdgeRef, resolutionError } from '../../shared/dispatch/resolveRef';

export interface EdgeCtx {
  boardPath: string;
  onBoardChanged?: () => void;
}

function loadBoard(ctx: EdgeCtx): BoardShape {
  const raw = loadBoardFrom(ctx.boardPath);
  if (typeof raw !== 'object' || raw === null) return { nodes: [], edges: [] };
  const b = raw as Record<string, unknown>;
  if (!Array.isArray(b['nodes'])) b['nodes'] = [];
  if (!Array.isArray(b['edges'])) b['edges'] = [];
  return b as BoardShape;
}

function saveBoard(ctx: EdgeCtx, board: BoardShape): void {
  saveBoardTo(ctx.boardPath, { ...board, savedAt: new Date().toISOString() });
  ctx.onBoardChanged?.();
}

/** Parse `<nodeRef>:<eventOrCommand>`. */
function parseEndpoint(spec: string): { ref: string; name: string } | null {
  const idx = spec.lastIndexOf(':');
  if (idx <= 0 || idx === spec.length - 1) return null;
  return { ref: spec.slice(0, idx), name: spec.slice(idx + 1) };
}

export async function edgeAdd(
  ctx: EdgeCtx,
  from: string | undefined,
  to: string | undefined,
): Promise<SysResult> {
  if (!from || !to) {
    return {
      ok: false,
      message: 'edge add requires --from <nodeRef:event> and --to <nodeRef:command>',
    };
  }
  const fromEp = parseEndpoint(from);
  const toEp = parseEndpoint(to);
  if (!fromEp) return { ok: false, message: `--from must be "<nodeRef>:<event>" (got "${from}")` };
  if (!toEp) return { ok: false, message: `--to must be "<nodeRef>:<command>" (got "${to}")` };

  const board = loadBoard(ctx);
  const fromR = resolveNodeRef(board, fromEp.ref);
  if (!fromR.ok) return { ok: false, message: resolutionError('--from node', fromEp.ref, fromR) };
  const toR = resolveNodeRef(board, toEp.ref);
  if (!toR.ok) return { ok: false, message: resolutionError('--to node', toEp.ref, toR) };

  const edge: AnyEdge = {
    id: `edge-${randomUUID()}`,
    from: { nodeId: fromR.id, event: fromEp.name },
    to: { nodeId: toR.id, command: toEp.name },
    enabled: true,
  };
  board.edges = [...board.edges, edge];
  saveBoard(ctx, board);
  return {
    ok: true,
    message: `Added edge ${edge.id.slice(0, 13)}…  ${fromR.id.slice(0, 8)}:${fromEp.name} → ${toR.id.slice(0, 8)}:${toEp.name}`,
    data: edge,
  };
}

export async function edgeRemove(ctx: EdgeCtx, ref: string | undefined): Promise<SysResult> {
  if (!ref) return { ok: false, message: 'edge remove requires an <id>' };
  const board = loadBoard(ctx);
  const r = resolveEdgeRef(board, ref);
  if (!r.ok) return { ok: false, message: resolutionError('edge', ref, r) };
  const before = board.edges.length;
  board.edges = board.edges.filter((e) => e.id !== r.id);
  if (board.edges.length === before) return { ok: false, message: `edge "${r.id}" not found.` };
  saveBoard(ctx, board);
  return { ok: true, message: `Removed edge ${r.id.slice(0, 13)}….`, data: { id: r.id } };
}

export async function edgeList(ctx: EdgeCtx, json = false): Promise<SysResult> {
  const board = loadBoard(ctx);
  const edges = board.edges;
  if (json) return { ok: true, message: JSON.stringify(edges), data: edges };
  if (edges.length === 0) return { ok: true, message: '(no edges)', data: [] };
  const lines = edges.map((e) => {
    const enabled = e.enabled === false ? '✗' : '✓';
    return `${e.id.slice(0, 8)}  ${enabled}  ${e.from.nodeId.slice(0, 8)}:${e.from.event} → ${e.to.nodeId.slice(0, 8)}:${e.to.command}`;
  });
  return { ok: true, message: lines.join('\n'), data: edges };
}

export async function edgeEnable(
  ctx: EdgeCtx,
  ref: string | undefined,
  enabled: boolean,
): Promise<SysResult> {
  if (!ref) return { ok: false, message: `edge ${enabled ? 'enable' : 'disable'} requires an <id>` };
  const board = loadBoard(ctx);
  const r = resolveEdgeRef(board, ref);
  if (!r.ok) return { ok: false, message: resolutionError('edge', ref, r) };
  const idx = board.edges.findIndex((e) => e.id === r.id);
  if (idx === -1) return { ok: false, message: `edge "${r.id}" not found.` };
  const e = board.edges[idx]!;
  board.edges[idx] = { ...e, enabled };
  saveBoard(ctx, board);
  return {
    ok: true,
    message: `${enabled ? 'Enabled' : 'Disabled'} edge ${r.id.slice(0, 13)}….`,
    data: { id: r.id, enabled },
  };
}
