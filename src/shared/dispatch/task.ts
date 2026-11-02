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
import type { CompletionRecord } from '../types/board';
import {
  recordCompletion as ledgerRecord,
  clearCompletion as ledgerClear,
} from '../../renderer/store/completionLedger';
import type { TaskState } from '../../renderer/components/nodes/TaskNode/types';
import type { TodoState } from '../../renderer/components/nodes/TodoNode/types';
import type { PomoConfig, PomoState } from '../../renderer/components/nodes/PomoNode/types';
import {
  todoRemove as fsmTodoRemove,
  todoToggle as fsmTodoToggle,
  tagExamples,
} from '../../renderer/components/nodes/TodoNode/commands';
import { classifyTask, mergeTagLibrary } from '../tags/classify';
import {
  taskToggle as fsmTaskToggle,
} from '../../renderer/components/nodes/TaskNode/commands';
import {
  pomoCancel as fsmPomoCancel,
  pomoClearActiveTask as fsmPomoClearActiveTask,
  pomoSkipBreak as fsmPomoSkipBreak,
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
      // pomoCancel only covers running/paused; pomoSkipBreak transitions a
      // 'break' status back to idle. Without that branch, deleting a task
      // mid-break would leave the break timer ticking on a phantom session.
      if (ps.status === 'running' || ps.status === 'paused') {
        cancelledState = fsmPomoCancel(ps);
      } else if (ps.status === 'break') {
        cancelledState = fsmPomoSkipBreak(ps);
      }
      // Pass the pomo mother's live config so durationMin/breakMin snap back
      // to user-configured defaults — without this, a deleted task left the
      // pomo stuck on the task's per-session minutes (user report 2026-05-18).
      const cfg = (pomoNode.config as PomoConfig | null) ?? undefined;
      const cleared = fsmPomoClearActiveTask(cancelledState, cfg);
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

// ── syncCompletion ────────────────────────────────────────────────────────
// #169 — keep board.completions in step with a task's done state. Mirrors the
// renderer's syncCompletionLedger so CLI toggles count in analytics too.

export function syncCompletion(board: BoardShape, taskId: string): void {
  const node = board.nodes.find((n) => n.id === taskId && n.kind === 'todo.task');
  if (!node) return;
  const ts = node.state as TaskState;
  const ledger = board['completions'] as CompletionRecord[] | undefined;
  const tag = ts.done && ts.completedAt ? completionTagFor(board, ts) : undefined;
  board['completions'] = ts.done && ts.completedAt
    ? ledgerRecord(ledger, {
        taskId,
        text: ts.text,
        plannedMin: ts.plannedMin ?? ts.durationMin ?? 25,
        completedAt: ts.completedAt,
        ...(tag !== undefined ? { tag } : {}),
      })
    : ledgerClear(ledger, taskId);
}

/**
 * ADR 0016 — the tag a completion is filed under: the linked TodoItem's tag,
 * else the task's own legacy tag, else a fresh classification of its text (so
 * subtasks without a Todo row still land in a category).
 */
export function completionTagFor(
  board: { nodes: ReadonlyArray<{ id: string; kind: string; state: unknown }> },
  ts: Pick<TaskState, 'text' | 'parentTodoId' | 'todoItemId' | 'tag'>,
): string | undefined {
  const todo = board.nodes.find((n) => n.id === ts.parentTodoId && n.kind === 'todo');
  const todoState = todo?.state as TodoState | undefined;
  const item = ts.todoItemId ? todoState?.items.find((i) => i.id === ts.todoItemId) : undefined;
  if (item?.tag) return item.tag;
  if (ts.tag) return ts.tag;
  const library = mergeTagLibrary(todoState?.tagLibrary);
  return classifyTask(ts.text, library, todoState ? tagExamples(todoState) : []) ?? undefined;
}

// ── taskToggleMirror ──────────────────────────────────────────────────────

export interface ToggleTaskResult {
  board: BoardShape;
  done: boolean;
}

/**
 * Pure: toggle a task's done flag, mirror to its linked TodoItem, and update
 * the completion ledger.
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

  syncCompletion(board, taskId);
  return { board, done: nextState.done };
}
