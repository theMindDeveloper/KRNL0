// Shared dispatch — task cascade pure functions.
// No React, no Zustand, no IPC. Operates on BoardShape snapshots.
//
// Extracted from:
//   renderer/components/Canvas/commandDispatch.ts  (deleteTaskNodesCascade)
//   sys/commands/task.ts                            (taskDelete, taskToggle)
//
// Exported for use by:
//   renderer/components/Canvas/commandDispatch.ts  (delegates here)
//   sys/commands/task.ts                            (delegates here)

import type { BoardShape, AnyNode, DispatchCtx } from './types';
import type { TaskState } from '../../renderer/components/nodes/TaskNode/types';
import type { TodoState } from '../../renderer/components/nodes/TodoNode/types';
import type { PomoState } from '../../renderer/components/nodes/PomoNode/types';
import {
  todoRemove as fsmTodoRemove,
  todoToggle as fsmTodoToggle,
} from '../../renderer/components/nodes/TodoNode/commands';
import {
  taskToggle as fsmTaskToggle,
} from '../../renderer/components/nodes/TaskNode/commands';
import {
  pomoCancel as fsmPomoCancel,
  pomoClearActiveTask as fsmPomoClearActiveTask,
} from '../../renderer/components/nodes/PomoNode/commands';

// ── helpers ────────────────────────────────────────────────────────────────

/** BFS: collect nodeId + all descendant todo.task node ids. */
export function collectDescendants(rootId: string, nodes: readonly AnyNode[]): string[] {
  const result: string[] = [];
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    result.push(current);
    for (const n of nodes) {
      if (n.kind !== 'todo.task') continue;
      const ts = n.state as TaskState;
      if (ts.parentTaskId === current) queue.push(n.id);
    }
  }
  return result;
}

/** Renumber sibling tasks (1-based, sorted by createdAt) in place. */
export function renumberSiblings(
  board: BoardShape,
  parentTodoId: string,
  parentTaskId: string | null,
): void {
  const siblings = board.nodes
    .filter((n) => {
      if (n.kind !== 'todo.task') return false;
      const ts = n.state as TaskState;
      return ts.parentTodoId === parentTodoId && ts.parentTaskId === parentTaskId;
    })
    .slice()
    .sort((a, b) => {
      const ta = (a.state as TaskState).createdAt;
      const tb = (b.state as TaskState).createdAt;
      return ta.localeCompare(tb);
    });
  siblings.forEach((n, i) => {
    const ts = n.state as TaskState;
    if (ts.sequenceNumber !== i + 1) {
      const idx = board.nodes.indexOf(n);
      if (idx !== -1) {
        board.nodes[idx] = { ...n, state: { ...ts, sequenceNumber: i + 1 } };
      }
    }
  });
}

// ── deleteTaskCascade ──────────────────────────────────────────────────────

export interface DeleteTaskResult {
  board: BoardShape;
  /** Number of task nodes removed (root + descendants). */
  removedCount: number;
  /** true if the pomo was cancelled because the task was the active one. */
  pomoCancelled: boolean;
}

/**
 * Pure: cascade-delete one task node and all its descendants from `board`.
 * - Removes linked TodoItem(s) from parent TodoNode(s).
 * - If the task (or any descendant) is the active pomo task, cancels the pomo
 *   and clears activeTaskId. (T17 — the load-bearing invariant.)
 * - Renumbers siblings after removal.
 *
 * Returns a new BoardShape (the input is mutated for performance — callers
 * who need immutability should shallow-clone first, or use the returned copy).
 */
export function deleteTaskCascade(
  board: BoardShape,
  taskId: string,
): DeleteTaskResult {
  const allDescendants = new Set(collectDescendants(taskId, board.nodes));

  if (allDescendants.size === 0) {
    return { board, removedCount: 0, pomoCancelled: false };
  }

  const rootNode = board.nodes.find((n) => n.id === taskId);
  if (!rootNode || rootNode.kind !== 'todo.task') {
    return { board, removedCount: 0, pomoCancelled: false };
  }

  const rootTs = rootNode.state as TaskState;

  // ── T17: cancel pomo if the deleted task (or any descendant) is active ──
  let pomoCancelled = false;
  const pomoNode = board.nodes.find((n) => n.kind === 'pomo');
  if (pomoNode) {
    const ps = pomoNode.state as PomoState;
    if (ps.activeTaskId !== null && allDescendants.has(ps.activeTaskId)) {
      let cancelledState = ps;
      if (ps.status !== 'idle') cancelledState = fsmPomoCancel(ps);
      const cleared = fsmPomoClearActiveTask(cancelledState);
      const idx = board.nodes.indexOf(pomoNode);
      if (idx !== -1) {
        board.nodes[idx] = { ...pomoNode, state: cleared };
      }
      pomoCancelled = true;
    }
  }

  // ── Remove linked TodoItems, grouped by parent TodoNode ──
  const todoItemsByParent = new Map<string, string[]>();
  for (const descId of allDescendants) {
    const descNode = board.nodes.find((n) => n.id === descId);
    if (!descNode || descNode.kind !== 'todo.task') continue;
    const ts = descNode.state as TaskState;
    if (ts.todoItemId === null) continue;
    const existing = todoItemsByParent.get(ts.parentTodoId);
    if (existing) existing.push(ts.todoItemId);
    else todoItemsByParent.set(ts.parentTodoId, [ts.todoItemId]);
  }

  for (const [parentTodoId, itemIds] of todoItemsByParent) {
    const todoNode = board.nodes.find((n) => n.id === parentTodoId);
    if (!todoNode || todoNode.kind !== 'todo') continue;
    let state = todoNode.state as TodoState;
    for (const itemId of itemIds) {
      state = fsmTodoRemove(state, { id: itemId });
    }
    const idx = board.nodes.indexOf(todoNode);
    if (idx !== -1) {
      board.nodes[idx] = { ...todoNode, state };
    }
  }

  // ── Remove nodes + incident edges ──
  board.nodes = board.nodes.filter((n) => !allDescendants.has(n.id));
  board.edges = board.edges.filter(
    (e) => !allDescendants.has(e.from.nodeId) && !allDescendants.has(e.to.nodeId),
  );

  // ── Renumber siblings ──
  renumberSiblings(board, rootTs.parentTodoId, rootTs.parentTaskId);

  return { board, removedCount: allDescendants.size, pomoCancelled };
}

// ── stampCompletedAt ──────────────────────────────────────────────────────
// Issue #134 — applied at every task.toggle call site (renderer, sys CLI,
// taskToggleMirror) so analytics buckets can date completions.

export function stampCompletedAt(
  prev: TaskState,
  next: TaskState,
  ctx: DispatchCtx,
): TaskState {
  if (!prev.done && next.done) return { ...next, completedAt: ctx.now() };
  if (prev.done && !next.done) {
    const { completedAt: _ca, ...rest } = next;
    void _ca;
    return rest;
  }
  return next;
}

// ── taskToggleMirror ──────────────────────────────────────────────────────

export interface ToggleTaskResult {
  board: BoardShape;
  done: boolean;
}

/**
 * Pure: toggle a task's done flag and mirror to its linked TodoItem.
 */
export function taskToggleMirror(
  board: BoardShape,
  taskId: string,
  ctx: DispatchCtx,
): ToggleTaskResult | null {
  const taskNode = board.nodes.find((n) => n.id === taskId && n.kind === 'todo.task');
  if (!taskNode) return null;

  const prevState = taskNode.state as TaskState;
  const nextState = stampCompletedAt(prevState, fsmTaskToggle(prevState), ctx);

  const taskIdx = board.nodes.indexOf(taskNode);
  board.nodes[taskIdx] = { ...taskNode, state: nextState };

  // Mirror to linked TodoItem
  if (prevState.todoItemId !== null) {
    const todoNode = board.nodes.find(
      (n) => n.id === prevState.parentTodoId && n.kind === 'todo',
    );
    if (todoNode) {
      const todoState = todoNode.state as TodoState;
      const item = todoState.items.find((i) => i.id === prevState.todoItemId);
      if (item && item.done !== nextState.done) {
        const newTodo = fsmTodoToggle(todoState, { id: prevState.todoItemId }, ctx);
        const todoIdx = board.nodes.indexOf(todoNode);
        board.nodes[todoIdx] = { ...todoNode, state: newTodo };
      }
    }
  }

  return { board, done: nextState.done };
}
