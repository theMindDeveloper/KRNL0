// Generic node CRUD — list/read/remove. Filters by kind, supports --json.
// `node read <ref>` prints full state + config + incident edges for one node.
// `node remove <ref>` cascades for todo.task (via shared dispatch); refuses
// mother removal unless `--force` is passed.

import { loadBoardFrom, saveBoardTo } from '../../main/persistence/board';
import type { SysResult } from '../SysFacade';
import type { AnyNode, BoardShape } from '../../shared/dispatch/types';
import { resolveNodeRef, resolutionError } from '../../shared/dispatch/resolveRef';
import { deleteTaskCascade } from '../../shared/dispatch/task';
import type { TaskState } from '../../renderer/components/nodes/TaskNode/types';
import type { TodoState } from '../../renderer/components/nodes/TodoNode/types';
import type { HabitState } from '../../renderer/components/nodes/HabitNode/types';
import type { PomoState } from '../../renderer/components/nodes/PomoNode/types';

export interface NodeCtx {
  boardPath: string;
  onBoardChanged?: () => void;
}

function loadBoard(ctx: NodeCtx): BoardShape {
  const raw = loadBoardFrom(ctx.boardPath);
  if (typeof raw !== 'object' || raw === null) return { nodes: [], edges: [] };
  const b = raw as Record<string, unknown>;
  if (!Array.isArray(b['nodes'])) b['nodes'] = [];
  if (!Array.isArray(b['edges'])) b['edges'] = [];
  return b as BoardShape;
}

function saveBoard(ctx: NodeCtx, board: BoardShape): void {
  saveBoardTo(ctx.boardPath, { ...board, savedAt: new Date().toISOString() });
  ctx.onBoardChanged?.();
}

/** Short summary line for `node list` human output. */
function summarize(n: AnyNode): string {
  switch (n.kind) {
    case 'todo': {
      const s = n.state as TodoState;
      return `${s.items.length} item(s)`;
    }
    case 'todo.task': {
      const s = n.state as TaskState;
      return `${s.done ? '✓ ' : ''}${s.text}`.slice(0, 50);
    }
    case 'habit': {
      const s = n.state as HabitState;
      return `${s.habits.length} habit(s)`;
    }
    case 'pomo': {
      const s = n.state as PomoState;
      return `${s.status}${s.label ? ` "${s.label}"` : ''}`;
    }
    case 'term': {
      const s = n.state as { title?: string };
      return s.title ?? '';
    }
    case 'text': {
      const s = n.state as { text?: string };
      return (s.text ?? '').slice(0, 50);
    }
    case 'image': {
      const s = n.state as { assetId?: string; alt?: string };
      return s.alt || (s.assetId ? `asset:${s.assetId.slice(0, 8)}` : '');
    }
    case 'calendar': {
      const s = n.state as { selectedDate?: string | null; anchorDate?: string };
      return `anchor: ${s.anchorDate ?? '?'}`;
    }
    case 'clock': {
      const s = n.state as { linkedTodoId?: string | null };
      return s.linkedTodoId ? `linked: ${s.linkedTodoId.slice(0, 8)}` : 'unlinked';
    }
    default:
      return '';
  }
}

export interface NodeListFilters {
  kind?: string;
  motherOnly?: boolean;
  childOnly?: boolean;
}

/**
 * `krnl node list [--kind <k>] [--mother|--child] [--json]`
 */
export async function nodeList(
  ctx: NodeCtx,
  filters: NodeListFilters = {},
  json = false,
): Promise<SysResult> {
  const board = loadBoard(ctx);
  let nodes = board.nodes;
  if (filters.kind) nodes = nodes.filter((n) => n.kind === filters.kind);
  if (filters.motherOnly) nodes = nodes.filter((n) => n.isMother === true);
  if (filters.childOnly) nodes = nodes.filter((n) => n.isMother !== true);

  if (json) {
    const payload = nodes.map((n) => ({
      id: n.id,
      kind: n.kind,
      isMother: n.isMother === true,
      position: n.position ?? null,
      summary: summarize(n),
    }));
    return { ok: true, message: JSON.stringify(payload), data: payload };
  }

  if (nodes.length === 0) {
    return { ok: true, message: '(no nodes)', data: [] };
  }
  const lines = nodes.map((n) => {
    const id8 = n.id.slice(0, 8);
    const kind = n.kind.padEnd(12);
    const mother = n.isMother === true ? '★' : ' ';
    return `${id8}  ${mother} ${kind}  ${summarize(n)}`;
  });
  return { ok: true, message: lines.join('\n'), data: nodes };
}

/**
 * `krnl node read <ref> [--json]` — full state + config + position + incident edges.
 */
export async function nodeRead(
  ctx: NodeCtx,
  ref: string | undefined,
  json = false,
): Promise<SysResult> {
  if (!ref) return { ok: false, message: 'node read requires a <ref>' };
  const board = loadBoard(ctx);
  const r = resolveNodeRef(board, ref);
  if (!r.ok) return { ok: false, message: resolutionError('node', ref, r) };
  const node = board.nodes.find((n) => n.id === r.id);
  if (!node) return { ok: false, message: `node "${r.id}" not found.` };

  const incidentEdges = board.edges.filter(
    (e) => e.from.nodeId === node.id || e.to.nodeId === node.id,
  );
  const payload = {
    id: node.id,
    kind: node.kind,
    isMother: node.isMother === true,
    position: node.position ?? null,
    state: node.state,
    config: node.config ?? null,
    incidentEdges,
  };
  if (json) return { ok: true, message: JSON.stringify(payload), data: payload };
  return {
    ok: true,
    message: [
      `id    : ${node.id}`,
      `kind  : ${node.kind}${node.isMother === true ? ' (mother)' : ''}`,
      `pos   : ${node.position ? `${node.position.x},${node.position.y}` : '(no position)'}`,
      `edges : ${incidentEdges.length}`,
      ``,
      `state : ${JSON.stringify(node.state, null, 2)}`,
      `config: ${JSON.stringify(node.config ?? null, null, 2)}`,
    ].join('\n'),
    data: payload,
  };
}

/**
 * `krnl node remove <ref> [--force]` — remove a node and its incident edges.
 * For `todo.task` kind, uses `deleteTaskCascade` (descendants + linked TodoItems).
 * Mother nodes are refused unless `--force` is passed.
 */
export async function nodeRemove(
  ctx: NodeCtx,
  ref: string | undefined,
  force = false,
): Promise<SysResult> {
  if (!ref) return { ok: false, message: 'node remove requires a <ref>' };
  const board = loadBoard(ctx);
  const r = resolveNodeRef(board, ref);
  if (!r.ok) return { ok: false, message: resolutionError('node', ref, r) };
  const node = board.nodes.find((n) => n.id === r.id);
  if (!node) return { ok: false, message: `node "${r.id}" not found.` };

  if (node.isMother === true && !force) {
    return {
      ok: false,
      message: `Refusing to remove mother node "${node.kind}" — pass --force to override.`,
    };
  }

  if (node.kind === 'todo.task') {
    const { removedCount, pomoCancelled } = deleteTaskCascade(board, node.id);
    saveBoard(ctx, board);
    const desc = pomoCancelled ? ' (pomo session cancelled)' : '';
    return {
      ok: true,
      message: `Removed task and ${removedCount - 1} descendant(s).${desc}`,
      data: { removedCount, pomoCancelled },
    };
  }

  // Generic removal: drop the node + incident edges.
  board.nodes = board.nodes.filter((n) => n.id !== node.id);
  board.edges = board.edges.filter(
    (e) => e.from.nodeId !== node.id && e.to.nodeId !== node.id,
  );
  saveBoard(ctx, board);
  return { ok: true, message: `Removed node ${node.id} (${node.kind}).` };
}

/**
 * `krnl node set-position <ref> --x N --y N` — direct position write
 * (peer of the drag gesture).
 */
export async function nodeSetPosition(
  ctx: NodeCtx,
  ref: string | undefined,
  x: number | undefined,
  y: number | undefined,
): Promise<SysResult> {
  if (!ref) return { ok: false, message: 'node set-position requires a <ref>' };
  if (x === undefined || y === undefined || isNaN(x) || isNaN(y)) {
    return { ok: false, message: 'node set-position requires --x and --y' };
  }
  const board = loadBoard(ctx);
  const r = resolveNodeRef(board, ref);
  if (!r.ok) return { ok: false, message: resolutionError('node', ref, r) };
  const idx = board.nodes.findIndex((n) => n.id === r.id);
  if (idx === -1) return { ok: false, message: `node "${r.id}" not found.` };
  const node = board.nodes[idx]!;
  board.nodes[idx] = { ...node, position: { x, y } };
  saveBoard(ctx, board);
  return {
    ok: true,
    message: `Moved ${node.id.slice(0, 8)} to ${x},${y}.`,
    data: { id: node.id, position: { x, y } },
  };
}
