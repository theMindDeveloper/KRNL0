// Shared dispatch — todo.add pair creation.
// Decision 20 invariant 1: every TodoItem has a paired TaskNode at creation,
// with bidirectional link via item.taskNodeId ↔ task.state.todoItemId.
// ADR-0014 §11 (shared-dispatch parity): renderer and CLI both go through here.
//
// This is a pure function. It mutates the input board's `nodes` and `edges`
// arrays in place (the caller decides whether to clone first).

import {
  todoAdd as fsmTodoAdd,
  todoLinkTask,
} from '../../renderer/components/nodes/TodoNode/commands';
import {
  defaultPomoConfig,
} from '../../renderer/components/nodes/PomoNode/types';
import type { TodoState } from '../../renderer/components/nodes/TodoNode/types';
import type { TaskState } from '../../renderer/components/nodes/TaskNode/types';
import type { PomoConfig } from '../../renderer/components/nodes/PomoNode/types';
import type { AnyNode, AnyEdge, BoardShape, DispatchCtx } from './types';

export interface CreateTodoTaskPairArgs {
  /** Optional TodoNode id. If omitted, uses the first mother TodoNode. */
  todoNodeId?: string;
  /** Task / TodoItem text. */
  text: string;
  /** Optional tag label, e.g. "WORK". */
  tag?: string;
  /** Optional planned duration in minutes. Falls back to pomo sessionMin. */
  plannedMin?: number;
}

export interface CreateTodoTaskPairResult {
  todoItemId: string;
  taskNodeId: string;
}

/** Find the first mother TodoNode in a board, or null. */
function findTodoMother(board: BoardShape): AnyNode | null {
  return board.nodes.find((n) => n.kind === 'todo' && n.isMother === true) ?? null;
}

/** Find the first PomoNode (mother or otherwise) in a board, or null. */
function findPomoNode(board: BoardShape): AnyNode | null {
  return board.nodes.find((n) => n.kind === 'pomo') ?? null;
}

/**
 * Create a TodoItem on a TodoNode + a paired TaskNode + the chain edge from
 * the previous sibling task (if any). Mutates `board` in place.
 *
 * Throws if the TodoNode is missing — callers must check first or catch.
 */
export function createTodoTaskPair(
  board: BoardShape,
  args: CreateTodoTaskPairArgs,
  ctx: DispatchCtx,
): CreateTodoTaskPairResult | null {
  const trimmed = args.text.trim();
  if (!trimmed) return null;

  const todoNode = args.todoNodeId
    ? board.nodes.find((n) => n.id === args.todoNodeId && n.kind === 'todo') ?? null
    : findTodoMother(board);
  if (!todoNode) return null;

  // ── 1. Add the TodoItem via the existing FSM ─────────────────────────────
  const prevTodoState = todoNode.state as TodoState;
  const todoEnv = { uuid: ctx.uuid, now: ctx.now };
  const todoArgs: { text: string; tag?: string } = { text: trimmed };
  if (args.tag !== undefined) todoArgs.tag = args.tag;
  const nextTodoState = fsmTodoAdd(prevTodoState, todoArgs, todoEnv);
  const addedItem = nextTodoState.items[nextTodoState.items.length - 1];
  if (!addedItem) return null;

  // ── 2. Sequence + position the new task ──────────────────────────────────
  const siblings = board.nodes.filter((n) => {
    if (n.kind !== 'todo.task') return false;
    const ts = n.state as TaskState;
    return ts.parentTodoId === todoNode.id && ts.parentTaskId === null;
  });
  const seq = siblings.length + 1;

  // Spawn rule: place new task next to the most recently added sibling.
  // If no siblings yet, drop the first task below the parent mother
  // (540px tall + 40px gap).
  const baseX = todoNode.position?.x ?? 0;
  const baseY = todoNode.position?.y ?? 0;
  let position: { x: number; y: number };
  if (siblings.length === 0) {
    position = { x: baseX, y: baseY + 580 };
  } else {
    const last = siblings
      .slice()
      .sort((a, b) =>
        (a.state as TaskState).createdAt.localeCompare((b.state as TaskState).createdAt),
      )
      .at(-1)!;
    position = { x: (last.position?.x ?? baseX) + 252, y: last.position?.y ?? baseY + 580 };
  }

  // ── 3. Pomo session minutes drive durationMin (renderer semantics) ───────
  const pomoNode = findPomoNode(board);
  const pomoCfg = (pomoNode?.config as PomoConfig | null) ?? defaultPomoConfig();
  const sessionMin = pomoCfg.sessionMin;
  const plannedMin =
    args.plannedMin !== undefined && Number.isFinite(args.plannedMin) && args.plannedMin >= 1
      ? Math.max(1, Math.round(args.plannedMin))
      : sessionMin;

  // ── 4. Build the TaskNode ────────────────────────────────────────────────
  const taskNodeId = `task-${ctx.uuid()}`;
  const taskState: TaskState = {
    text: trimmed,
    done: false,
    ...(args.tag !== undefined ? { tag: args.tag } : {}),
    durationMin: sessionMin,
    eta: `~${plannedMin} min`,
    sequenceNumber: seq,
    layer: 0,
    createdAt: ctx.now(),
    parentTodoId: todoNode.id,
    parentTaskId: null,
    todoItemId: addedItem.id,
    pomoSessionsCompleted: 0,
    plannedMin,
    secondsAccumulated: 0,
    currentSessionElapsedSec: 0,
    kind: 'focus',
  };
  const taskNode: AnyNode = {
    id: taskNodeId,
    kind: 'todo.task',
    isMother: false,
    position,
    state: taskState,
    config: { showDuration: true },
  };

  // ── 5. Write bidirectional link on the TodoItem ──────────────────────────
  const linkedTodoState = todoLinkTask(nextTodoState, {
    itemId: addedItem.id,
    taskNodeId,
  });

  // ── 6. Persist into the board (in-place mutation) ────────────────────────
  const idx = board.nodes.indexOf(todoNode);
  if (idx !== -1) {
    board.nodes[idx] = { ...todoNode, state: linkedTodoState };
  }
  board.nodes = [...board.nodes, taskNode];

  // ── 7. Chain edge from previous sibling ──────────────────────────────────
  if (siblings.length > 0) {
    const prev = siblings[siblings.length - 1];
    if (prev) {
      const edge: AnyEdge = {
        id: `edge-${ctx.uuid()}`,
        from: { nodeId: prev.id, event: 'task.next' },
        to: { nodeId: taskNodeId, command: 'task.activate' },
        enabled: true,
      };
      board.edges = [...board.edges, edge];
    }
  }

  return { todoItemId: addedItem.id, taskNodeId };
}
