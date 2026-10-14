// sys task CLI — board.json operations for task nodes.
// Operates on todo.task nodes linked to the todo mother node.

import { randomUUID } from 'crypto';
import { loadBoardFrom, saveBoardTo } from '../../main/persistence/board';
import type { SysResult } from '../SysFacade';
import {
  taskToggle as fsmTaskToggle,
  taskEdit as fsmTaskEdit,
  taskSetSchedule as fsmTaskSetSchedule,
} from '../../renderer/components/nodes/TaskNode/commands';
import type { TaskState } from '../../renderer/components/nodes/TaskNode/types';
import {
  todoToggle as fsmTodoToggle,
  todoRemove as fsmTodoRemove,
  todoLinkTask,
  todoAdd as fsmTodoAdd,
  todoSetItemSchedule as fsmTodoSetItemSchedule,
} from '../../renderer/components/nodes/TodoNode/commands';
import type { TodoState } from '../../renderer/components/nodes/TodoNode/types';
import type { PomoState } from '../../renderer/components/nodes/PomoNode/types';
import {
  pomoStart as fsmPomoStart,
} from '../../renderer/components/nodes/PomoNode/commands';
import {
  deleteTaskCascade,
  renumberSiblings as sharedRenumberSiblings,
  stampCompletedAt,
} from '../../shared/dispatch/task';
import {
  resolveNodeRef,
  resolveTodoItemRef,
  resolutionError,
} from '../../shared/dispatch/resolveRef';
import type { AnyNode as SharedAnyNode, AnyEdge } from '../../shared/dispatch/types';
import { TASK_STEP_X, TASK_STEP_Y, MOTHER_OFFSET_Y } from '../layout';

export interface TaskCtx {
  boardPath: string;
  onBoardChanged?: () => void;
}

interface BoardShape {
  nodes: AnyNode[];
  edges: AnyEdge[];
  [k: string]: unknown;
}

type AnyNode = SharedAnyNode;

function loadBoard(ctx: TaskCtx): BoardShape {
  const raw = loadBoardFrom(ctx.boardPath);
  if (typeof raw !== 'object' || raw === null) return { nodes: [], edges: [] };
  const b = raw as Record<string, unknown>;
  if (!Array.isArray(b['nodes'])) b['nodes'] = [];
  if (!Array.isArray(b['edges'])) b['edges'] = [];
  return b as BoardShape;
}

function saveBoard(ctx: TaskCtx, board: BoardShape): void {
  saveBoardTo(ctx.boardPath, { ...board, savedAt: new Date().toISOString() });
  ctx.onBoardChanged?.();
}

function findNode(board: BoardShape, id: string): AnyNode | null {
  return (board.nodes.find(
    (n) => typeof n === 'object' && n !== null && (n as AnyNode).id === id,
  ) as AnyNode | undefined) ?? null;
}

function findTaskNode(board: BoardShape, ref: string): AnyNode | null {
  // Accept full id, prefix (≥4 chars), or unique task-text match via resolveRef.
  const r = resolveNodeRef(board, ref, 'todo.task');
  if (!r.ok) return null;
  const n = findNode(board, r.id);
  if (!n || n.kind !== 'todo.task') return null;
  return n;
}

function findTodoMother(board: BoardShape): AnyNode | null {
  return (board.nodes.find(
    (n) => typeof n === 'object' && n !== null &&
      (n as AnyNode).kind === 'todo' && (n as AnyNode).isMother === true,
  ) as AnyNode | undefined) ?? null;
}

function findPomoMother(board: BoardShape): AnyNode | null {
  return (board.nodes.find(
    (n) => typeof n === 'object' && n !== null &&
      (n as AnyNode).kind === 'pomo' && (n as AnyNode).isMother === true,
  ) as AnyNode | undefined) ?? null;
}

function updateNode(board: BoardShape, id: string, newNode: AnyNode): void {
  board.nodes = board.nodes.map((n) => {
    if (typeof n !== 'object' || n === null) return n;
    if ((n as AnyNode).id === id) return newNode;
    return n;
  });
}

// Use shared renumberSiblings from dispatch module.
const renumberSiblings = (
  board: BoardShape,
  parentTodoId: string,
  parentTaskId: string | null,
): void => sharedRenumberSiblings(board, parentTodoId, parentTaskId);

// ── Commands ────────────────────────────────────────────────────────────────

export async function taskAdd(
  ctx: TaskCtx,
  todoId: string | undefined,
  text: string | undefined,
  durationMin = 20,
): Promise<SysResult> {
  if (!text) return { ok: false, message: 'task add requires a <text>' };
  const board = loadBoard(ctx);

  // Resolve the parent TodoNode. `--todo <ref>` accepts:
  //   - a TodoNode id / id-prefix
  //   - a TodoItem id / id-prefix / text  (resolves to its parent TodoNode —
  //     matches the verbatim issue #117 scenario where `--todo c27bc74b` was
  //     the 8-char prefix of a TodoItem returned by `todo list`)
  //   - if --todo omitted, the mother TodoNode is used.
  let todoMother: AnyNode | null = null;
  if (todoId) {
    const nodeR = resolveNodeRef(board, todoId, 'todo');
    if (nodeR.ok) {
      const candidate = findNode(board, nodeR.id);
      if (candidate && candidate.kind === 'todo') todoMother = candidate;
    }
    if (!todoMother) {
      const itemR = resolveTodoItemRef(board, todoId);
      if (itemR.ok) {
        const candidate = findNode(board, itemR.id.todoNodeId);
        if (candidate && candidate.kind === 'todo') todoMother = candidate;
      }
    }
    if (!todoMother) {
      return { ok: false, message: `No todo node or item matching "${todoId}"` };
    }
  } else {
    todoMother = findTodoMother(board);
  }
  if (!todoMother) return { ok: false, message: 'No todo mother node found in board.' };

  const env = {
    uuid: () => randomUUID(),
    now: () => new Date().toISOString(),
  };

  // Add a TodoItem first
  const prevTodoState = todoMother.state as TodoState;
  const nextTodoState = fsmTodoAdd(prevTodoState, { text }, env);
  const addedItem = nextTodoState.items[nextTodoState.items.length - 1];
  if (!addedItem) return { ok: false, message: 'Failed to add todo item.' };

  // Count siblings for sequencing
  const siblings = (board.nodes as AnyNode[]).filter((n) => {
    if (n.kind !== 'todo.task') return false;
    const ts = n.state as TaskState;
    return ts.parentTodoId === todoMother!.id && ts.parentTaskId === null;
  });
  const seq = siblings.length + 1;

  const todoMotherNode = todoMother as AnyNode & { position?: { x: number; y: number } };
  const baseX = todoMotherNode.position?.x ?? 0;
  const baseY = todoMotherNode.position?.y ?? 0;

  const taskId = `task-${randomUUID()}`;
  const taskState: TaskState = {
    text: text.trim(),
    done: false,
    durationMin,
    eta: `~${durationMin} min`,
    sequenceNumber: seq,
    layer: 0,
    createdAt: env.now(),
    parentTodoId: todoMother.id,
    parentTaskId: null,
    todoItemId: addedItem.id,
    pomoSessionsCompleted: 0,
    plannedMin: durationMin,
    secondsAccumulated: 0,
    currentSessionElapsedSec: 0,
    kind: 'event', // #180 — Todo creates events only
  };

  // Link taskNodeId on the TodoItem
  const linkedTodoState = todoLinkTask(nextTodoState, {
    itemId: addedItem.id,
    taskNodeId: taskId,
  });

  // Spawn rule: place new task next to the most recently added sibling.
  // If no siblings yet, drop the first task below the parent mother
  // (mother row ≈ 540 tall; MOTHER_OFFSET_Y leaves a clear gap so the
  // first task doesn't clip the dock).
  //
  // For sibling tasks, step one TASK_STEP_X to the right (TASK_W + GAP_X).
  // The previous 252px step produced only a ~32px visible gap which
  // looked cramped in AI-generated pipelines and made framing messy
  // (user feedback 2026-05-17).
  let spawnPos: { x: number; y: number };
  if (siblings.length === 0) {
    spawnPos = { x: baseX, y: baseY + MOTHER_OFFSET_Y };
  } else {
    const last = siblings
      .slice()
      .sort((a, b) =>
        (a.state as TaskState).createdAt.localeCompare((b.state as TaskState).createdAt),
      )
      .at(-1)!;
    const lastNode = last as AnyNode & { position?: { x: number; y: number } };
    const lx = lastNode.position?.x ?? baseX;
    const ly = lastNode.position?.y ?? baseY + MOTHER_OFFSET_Y;
    spawnPos = { x: lx + TASK_STEP_X, y: ly };
  }

  const taskNode: AnyNode = {
    id: taskId,
    kind: 'todo.task',
    isMother: false,
    position: spawnPos,
    state: taskState,
    config: { showDuration: true },
  };

  updateNode(board, todoMother.id, { ...todoMother, state: linkedTodoState });
  board.nodes = [...board.nodes, taskNode];

  // Add chain edge from previous sibling
  if (siblings.length > 0) {
    const prev = siblings[siblings.length - 1];
    if (prev) {
      const edge = {
        id: `edge-${randomUUID()}`,
        from: { nodeId: prev.id, event: 'task.next' },
        to: { nodeId: taskId, command: 'task.activate' },
        enabled: true,
      };
      board.edges = [...board.edges, edge];
    }
  }

  saveBoard(ctx, board);
  return {
    ok: true,
    message: `Added task "${text}" (id: ${taskId.slice(0, 13)}…)`,
    data: { id: taskId, itemId: addedItem.id },
  };
}

export async function taskEdit(
  ctx: TaskCtx,
  taskId: string | undefined,
  text: string | undefined,
): Promise<SysResult> {
  if (!taskId) return { ok: false, message: 'task edit requires a <id>' };
  if (!text) return { ok: false, message: 'task edit requires <text>' };
  const board = loadBoard(ctx);
  const taskNode = findTaskNode(board, taskId);
  if (!taskNode) return { ok: false, message: `No task node matching "${taskId}"` };
  taskId = taskNode.id;

  const nextState = fsmTaskEdit(taskNode.state as TaskState, { text });
  updateNode(board, taskId, { ...taskNode, state: nextState });
  saveBoard(ctx, board);
  return { ok: true, message: `Task "${taskId.slice(0, 8)}" text updated to "${text}".` };
}

export async function taskToggle(
  ctx: TaskCtx,
  taskId: string | undefined,
): Promise<SysResult> {
  if (!taskId) return { ok: false, message: 'task toggle requires a <id>' };
  const board = loadBoard(ctx);
  const taskNode = findTaskNode(board, taskId);
  if (!taskNode) return { ok: false, message: `No task node matching "${taskId}"` };
  taskId = taskNode.id;

  const prevState = taskNode.state as TaskState;
  const env = { uuid: () => randomUUID(), now: () => new Date().toISOString() };
  const nextState = stampCompletedAt(prevState, fsmTaskToggle(prevState), env);
  updateNode(board, taskId, { ...taskNode, state: nextState });

  // Mirror to linked TodoItem
  if (prevState.todoItemId !== null) {
    const todoMother = findNode(board, prevState.parentTodoId);
    if (todoMother && todoMother.kind === 'todo') {
      const todoState = todoMother.state as TodoState;
      const item = todoState.items.find((i) => i.id === prevState.todoItemId);
      if (item && item.done !== nextState.done) {
        const newTodo = fsmTodoToggle(todoState, { id: prevState.todoItemId }, env);
        updateNode(board, todoMother.id, { ...todoMother, state: newTodo });
      }
    }
  }

  saveBoard(ctx, board);
  return {
    ok: true,
    message: `Task marked ${nextState.done ? 'done' : 'undone'}.`,
    data: { id: taskId, done: nextState.done },
  };
}

export async function taskDelete(
  ctx: TaskCtx,
  taskId: string | undefined,
): Promise<SysResult> {
  if (!taskId) return { ok: false, message: 'task delete requires a <id>' };
  const board = loadBoard(ctx);
  const taskNode = findTaskNode(board, taskId);
  if (!taskNode) return { ok: false, message: `No task node matching "${taskId}"` };
  taskId = taskNode.id;

  // T17: Use shared cascade — handles pomo cancel + TodoItem cleanup + renumber.
  const { removedCount, pomoCancelled } = deleteTaskCascade(board, taskId);
  saveBoard(ctx, board);

  const desc = pomoCancelled ? ' (pomo session cancelled)' : '';
  return {
    ok: true,
    message: `Task and ${removedCount - 1} descendant(s) deleted.${desc}`,
  };
}

export async function taskStartPomo(
  ctx: TaskCtx,
  taskId: string | undefined,
): Promise<SysResult> {
  if (!taskId) return { ok: false, message: 'task pomo requires a <id>' };
  const board = loadBoard(ctx);
  const taskNode = findTaskNode(board, taskId);
  if (!taskNode) return { ok: false, message: `No task node matching "${taskId}"` };
  taskId = taskNode.id;

  const pomoMother = findPomoMother(board);
  if (!pomoMother) return { ok: false, message: 'No pomo mother node found in board.' };

  const ts = taskNode.state as TaskState;
  const nextPomoState = fsmPomoStart(pomoMother.state as PomoState, {
    label: ts.text,
    durationMin: ts.durationMin,
  });
  updateNode(board, pomoMother.id, { ...pomoMother, state: nextPomoState });
  saveBoard(ctx, board);
  return {
    ok: true,
    message: `Pomo started for "${ts.text}" (${ts.durationMin} min).`,
  };
}

export async function taskSubtask(
  ctx: TaskCtx,
  parentTaskId: string | undefined,
  text: string | undefined,
): Promise<SysResult> {
  if (!parentTaskId) return { ok: false, message: 'task subtask requires a <parentId>' };
  if (!text) return { ok: false, message: 'task subtask requires <text>' };
  const board = loadBoard(ctx);
  const parentNode = findTaskNode(board, parentTaskId);
  if (!parentNode) return { ok: false, message: `No task node matching "${parentTaskId}"` };
  parentTaskId = parentNode.id;

  const parentTs = parentNode.state as TaskState;
  const now = new Date().toISOString();

  const siblings = (board.nodes as AnyNode[]).filter((n) => {
    if (n.kind !== 'todo.task') return false;
    const ts = n.state as TaskState;
    return ts.parentTodoId === parentTs.parentTodoId && ts.parentTaskId === parentTaskId;
  });
  const seq = siblings.length + 1;

  const childId = `task-${randomUUID()}`;
  const childState: TaskState = {
    text: text.trim(),
    done: false,
    durationMin: parentTs.durationMin,
    eta: parentTs.eta,
    sequenceNumber: seq,
    layer: parentTs.layer + 1,
    createdAt: now,
    parentTodoId: parentTs.parentTodoId,
    parentTaskId,
    todoItemId: null,
    pomoSessionsCompleted: 0,
    plannedMin: parentTs.plannedMin ?? parentTs.durationMin,
    secondsAccumulated: 0,
    currentSessionElapsedSec: 0,
    kind: 'event', // #180 — Todo creates events only
  };

  const childNode: AnyNode = {
    id: childId,
    kind: 'todo.task',
    isMother: false,
    position: {
      x: (parentNode.position?.x ?? 0) + (seq - 1) * TASK_STEP_X,
      y: (parentNode.position?.y ?? 0) + 200,
    },
    state: childState,
    config: { showDuration: true },
  };

  board.nodes = [...board.nodes, childNode];
  board.edges = [
    ...board.edges,
    {
      id: `edge-${randomUUID()}`,
      from: { nodeId: parentTaskId, event: 'task.next' },
      to: { nodeId: childId, command: 'task.activate' },
      enabled: true,
    },
  ];

  saveBoard(ctx, board);
  return {
    ok: true,
    message: `Subtask "${text}" added under task ${parentTaskId.slice(0, 8)}….`,
    data: { id: childId },
  };
}

export async function taskDuration(
  ctx: TaskCtx,
  taskId: string | undefined,
  minutes: number | undefined,
): Promise<SysResult> {
  if (!taskId) return { ok: false, message: 'task duration requires a <taskId>' };
  if (minutes === undefined || isNaN(minutes) || minutes <= 0) {
    return { ok: false, message: 'task duration requires a positive <minutes> number' };
  }
  const board = loadBoard(ctx);
  const taskNode = findTaskNode(board, taskId);
  if (!taskNode) return { ok: false, message: `No task node matching "${taskId}"` };
  taskId = taskNode.id;

  // Guard: if the pomo mother is actively running, refuse to change duration.
  const pomoMother = findPomoMother(board);
  if (pomoMother) {
    const ps = pomoMother.state as import('../../renderer/components/nodes/PomoNode/types').PomoState;
    if (ps.status === 'running' && ps.startedAt !== null) {
      return {
        ok: false,
        message: 'Cannot change duration while a pomo session is running. Stop the pomo first.',
      };
    }
  }

  const ts = taskNode.state as TaskState;
  const nextState: TaskState = {
    ...ts,
    durationMin: minutes,
    eta: `~${minutes} min`,
  };
  updateNode(board, taskId, { ...taskNode, state: nextState });
  saveBoard(ctx, board);
  return {
    ok: true,
    message: `Task "${taskId.slice(0, 8)}" duration set to ${minutes} min.`,
    data: { id: taskId, durationMin: minutes },
  };
}

export async function taskSibling(
  ctx: TaskCtx,
  taskId: string | undefined,
): Promise<SysResult> {
  if (!taskId) return { ok: false, message: 'task sibling requires a <taskId>' };
  const board = loadBoard(ctx);
  const sourceNode = findTaskNode(board, taskId);
  if (!sourceNode) return { ok: false, message: `No task node matching "${taskId}"` };
  taskId = sourceNode.id;

  const sourceTs = sourceNode.state as TaskState;

  const now = new Date().toISOString();
  const newItemId = randomUUID();
  const newNodeId = `task-${randomUUID()}`;
  const plannedMin = sourceTs.plannedMin ?? sourceTs.durationMin;

  const newTaskState: TaskState = {
    text: 'New task',
    done: false,
    durationMin: sourceTs.durationMin,
    eta: `~${plannedMin} min`,
    sequenceNumber: sourceTs.sequenceNumber + 1,
    layer: sourceTs.layer,
    createdAt: now,
    parentTodoId: sourceTs.parentTodoId,
    parentTaskId: sourceTs.parentTaskId,
    todoItemId: newItemId,
    pomoSessionsCompleted: 0,
    plannedMin,
    secondsAccumulated: 0,
    currentSessionElapsedSec: 0,
    kind: 'event', // #180 — Todo creates events only
  };

  const newNode: AnyNode = {
    id: newNodeId,
    kind: 'todo.task',
    isMother: false,
    // Parallel fork: position below source, not beside it.
    // TASK_STEP_Y = TASK_H (140) + TASK_GAP_Y (120) = 260.
    position: {
      x: sourceNode.position?.x ?? 0,
      y: (sourceNode.position?.y ?? 0) + TASK_STEP_Y,
    },
    state: newTaskState,
    config: { showDuration: true },
  };

  // Bug 2: Walk downstream chain from taskId at the same layer,
  // collecting all reachable targets. Add fork edges from newNode to each.
  // Do NOT remove any existing edges (purely additive parallel fork).
  type RawEdge = {
    id: string;
    from: { nodeId: string; event: string };
    to: { nodeId: string; command: string };
    enabled: boolean;
  };
  const edgesArr = board.edges as RawEdge[];
  const downstreamTargets: string[] = [];
  const visited = new Set<string>();
  let current: string | undefined = taskId;
  const cap = board.nodes.length + 1;
  let steps = 0;
  while (current !== undefined && steps < cap) {
    steps++;
    const nextEdge = edgesArr.find(
      (e) => e.from.nodeId === current && e.from.event === 'task.next',
    );
    if (!nextEdge) break;
    const nextId = nextEdge.to.nodeId;
    if (visited.has(nextId)) break; // cycle guard
    const nextNode = findTaskNode(board, nextId);
    if (!nextNode) break;
    const nextTs = nextNode.state as TaskState;
    if (nextTs.layer !== sourceTs.layer) break;
    visited.add(nextId);
    downstreamTargets.push(nextId);
    current = nextId;
  }

  const forkEdges: RawEdge[] = downstreamTargets.map((targetId) => ({
    id: `edge-${randomUUID()}`,
    from: { nodeId: newNodeId, event: 'task.next' },
    to: { nodeId: targetId, command: 'task.activate' },
    enabled: true,
  }));

  // Bug 3: Append a new TodoItem to the parent TodoNode (bidirectional link).
  const todoNode = (board.nodes as AnyNode[]).find(
    (n) => n.id === sourceTs.parentTodoId && n.kind === 'todo',
  );
  if (todoNode) {
    const todoState = todoNode.state as TodoState;
    const newItem = {
      id: newItemId,
      text: 'New task',
      done: false,
      createdAt: now,
      completedAt: null as string | null,
      taskNodeId: newNodeId,
    };
    todoNode.state = { ...todoState, items: [...todoState.items, newItem] };
  }

  board.nodes = [...board.nodes, newNode];
  board.edges = [...edgesArr, ...forkEdges];

  // Renumber siblings (same parentTodoId + parentTaskId) by createdAt
  renumberSiblings(board, sourceTs.parentTodoId, sourceTs.parentTaskId);

  saveBoard(ctx, board);
  return {
    ok: true,
    message: `Sibling task inserted after "${taskId.slice(0, 8)}…" (id: ${newNodeId.slice(0, 13)}…).`,
    data: { id: newNodeId },
  };
}

export async function taskResetPomo(
  ctx: TaskCtx,
  taskId: string | undefined,
): Promise<SysResult> {
  if (!taskId) return { ok: false, message: 'task reset-pomo requires a <taskId>' };
  const board = loadBoard(ctx);
  const taskNode = findTaskNode(board, taskId);
  if (!taskNode) return { ok: false, message: `No task node matching "${taskId}"` };
  taskId = taskNode.id;

  const ts = taskNode.state as TaskState;
  const nextState: TaskState = {
    ...ts,
    pomoSessionsCompleted: 0,
  };
  updateNode(board, taskId, { ...taskNode, state: nextState });
  saveBoard(ctx, board);
  return {
    ok: true,
    message: `Pomo progress reset for task "${taskId.slice(0, 8)}".`,
    data: { id: taskId, pomoSessionsCompleted: 0 },
  };
}

/**
 * `krnl task chain <ref1> <ref2> [<ref3> ...]` — wire `task.next → task.activate`
 * edges between consecutive task refs. Skips edges that already exist.
 */
export async function taskChain(ctx: TaskCtx, refs: string[]): Promise<SysResult> {
  if (refs.length < 2) {
    return { ok: false, message: 'task chain requires at least 2 task refs.' };
  }
  const board = loadBoard(ctx);
  const ids: string[] = [];
  for (const ref of refs) {
    const node = findTaskNode(board, ref);
    if (!node) return { ok: false, message: `No task node matching "${ref}"` };
    ids.push(node.id);
  }
  let added = 0;
  for (let i = 0; i < ids.length - 1; i++) {
    const fromId = ids[i]!;
    const toId = ids[i + 1]!;
    const exists = board.edges.some(
      (e) =>
        e.from.nodeId === fromId &&
        e.from.event === 'task.next' &&
        e.to.nodeId === toId &&
        e.to.command === 'task.activate',
    );
    if (exists) continue;
    board.edges = [
      ...board.edges,
      {
        id: `edge-${randomUUID()}`,
        from: { nodeId: fromId, event: 'task.next' },
        to: { nodeId: toId, command: 'task.activate' },
        enabled: true,
      },
    ];
    added++;
  }
  saveBoard(ctx, board);
  return {
    ok: true,
    message: `Chained ${ids.length} tasks (${added} new edge${added === 1 ? '' : 's'}).`,
    data: { count: ids.length, edgesAdded: added },
  };
}

// ── ADR 0003/0005 — taskSchedule / taskUnschedule ────────────────────────────

/**
 * `krnl task schedule <ref> --at <ISO> [--duration <min>]`
 * Sets scheduledFor (and optional scheduledDurationMin) on a TaskNode, then
 * mirrors to the linked TodoItem via todoSetItemSchedule.
 */
export async function taskSchedule(
  ctx: TaskCtx,
  taskId: string | undefined,
  at: string | undefined,
  durationMin?: number,
): Promise<SysResult> {
  if (!taskId) return { ok: false, message: 'task schedule requires a <ref>' };
  if (!at) return { ok: false, message: 'task schedule requires --at <ISO>' };
  const board = loadBoard(ctx);
  const taskNode = findTaskNode(board, taskId);
  if (!taskNode) return { ok: false, message: `No task node matching "${taskId}"` };
  taskId = taskNode.id;

  const ts = taskNode.state as TaskState;
  const nextState = fsmTaskSetSchedule(ts, {
    scheduledFor: at,
    ...(durationMin !== undefined ? { scheduledDurationMin: durationMin } : {}),
  });
  updateNode(board, taskId, { ...taskNode, state: nextState });

  // Mirror to linked TodoItem.
  if (ts.todoItemId !== null) {
    const todoNode = findNode(board, ts.parentTodoId);
    if (todoNode && todoNode.kind === 'todo') {
      const newTodoState = fsmTodoSetItemSchedule(todoNode.state as TodoState, {
        itemId: ts.todoItemId,
        scheduledFor: at,
      });
      updateNode(board, todoNode.id, { ...todoNode, state: newTodoState });
    }
  }

  saveBoard(ctx, board);
  return {
    ok: true,
    message: `Task "${taskId.slice(0, 8)}" scheduled at ${at}${durationMin !== undefined ? ` for ${durationMin} min` : ''}.`,
    data: { id: taskId, scheduledFor: at, scheduledDurationMin: durationMin },
  };
}

/**
 * `krnl task unschedule <ref>`
 * Clears scheduledFor from a TaskNode (removes the field entirely, matching
 * the FSM behaviour) and mirrors the clear to the linked TodoItem.
 */
export async function taskUnschedule(
  ctx: TaskCtx,
  taskId: string | undefined,
): Promise<SysResult> {
  if (!taskId) return { ok: false, message: 'task unschedule requires a <ref>' };
  const board = loadBoard(ctx);
  const taskNode = findTaskNode(board, taskId);
  if (!taskNode) return { ok: false, message: `No task node matching "${taskId}"` };
  taskId = taskNode.id;

  const ts = taskNode.state as TaskState;
  if (!('scheduledFor' in ts)) {
    return { ok: true, message: `Task "${taskId.slice(0, 8)}" was not scheduled.` };
  }
  const nextState = fsmTaskSetSchedule(ts, { scheduledFor: null });
  updateNode(board, taskId, { ...taskNode, state: nextState });

  // Mirror to linked TodoItem.
  if (ts.todoItemId !== null) {
    const todoNode = findNode(board, ts.parentTodoId);
    if (todoNode && todoNode.kind === 'todo') {
      const newTodoState = fsmTodoSetItemSchedule(todoNode.state as TodoState, {
        itemId: ts.todoItemId,
        scheduledFor: null,
      });
      updateNode(board, todoNode.id, { ...todoNode, state: newTodoState });
    }
  }

  saveBoard(ctx, board);
  return {
    ok: true,
    message: `Task "${taskId.slice(0, 8)}" unscheduled.`,
    data: { id: taskId },
  };
}

// ── ADR 0004 — taskAddNext ────────────────────────────────────────────────────

/**
 * `krnl task addNext <sourceRef> "<text>" [--duration <min>]`
 * Creates a sequential successor: same parentTaskId as source, same layer,
 * positioned beside source (x + TASK_STEP_X), with task.next → task.activate edge
 * from source to the new node. Also creates a TodoItem on the parent TodoNode.
 */
export async function taskAddNext(
  ctx: TaskCtx,
  sourceRef: string | undefined,
  text: string | undefined,
  durationMin?: number,
): Promise<SysResult> {
  if (!sourceRef) return { ok: false, message: 'task addNext requires a <sourceRef>' };
  if (!text) return { ok: false, message: 'task addNext requires <text>' };
  const board = loadBoard(ctx);
  const sourceNode = findTaskNode(board, sourceRef);
  if (!sourceNode) return { ok: false, message: `No task node matching "${sourceRef}"` };

  const sourceTs = sourceNode.state as TaskState;
  const effectiveDuration = durationMin ?? sourceTs.durationMin;

  const env = {
    uuid: () => randomUUID(),
    now: () => new Date().toISOString(),
  };

  // Add a TodoItem to the parent TodoNode.
  const todoNode = findNode(board, sourceTs.parentTodoId);
  if (!todoNode || todoNode.kind !== 'todo') {
    return { ok: false, message: `Parent TodoNode "${sourceTs.parentTodoId}" not found.` };
  }
  const nextTodoState = fsmTodoAdd(todoNode.state as TodoState, { text }, env);
  const addedItem = nextTodoState.items[nextTodoState.items.length - 1];
  if (!addedItem) return { ok: false, message: 'Failed to add todo item.' };

  const newNodeId = `task-${randomUUID()}`;
  const now = env.now();

  // Count siblings at the same level for sequencing.
  const siblings = (board.nodes as AnyNode[]).filter((n) => {
    if (n.kind !== 'todo.task') return false;
    const ts = n.state as TaskState;
    return (
      ts.parentTodoId === sourceTs.parentTodoId &&
      ts.parentTaskId === sourceTs.parentTaskId
    );
  });
  const seq = siblings.length + 1;

  const newTaskState: TaskState = {
    text: text.trim(),
    done: false,
    durationMin: effectiveDuration,
    eta: `~${effectiveDuration} min`,
    sequenceNumber: seq,
    layer: sourceTs.layer,
    createdAt: now,
    parentTodoId: sourceTs.parentTodoId,
    parentTaskId: sourceTs.parentTaskId,
    todoItemId: addedItem.id,
    pomoSessionsCompleted: 0,
    plannedMin: effectiveDuration,
    secondsAccumulated: 0,
    currentSessionElapsedSec: 0,
    kind: 'event', // #180 — Todo creates events only
  };

  const newNode: AnyNode = {
    id: newNodeId,
    kind: 'todo.task',
    isMother: false,
    position: {
      x: (sourceNode.position?.x ?? 0) + TASK_STEP_X,
      y: sourceNode.position?.y ?? 0,
    },
    state: newTaskState,
    config: { showDuration: true },
  };

  // Link taskNodeId on the TodoItem.
  const linkedTodoState = todoLinkTask(nextTodoState, {
    itemId: addedItem.id,
    taskNodeId: newNodeId,
  });
  updateNode(board, todoNode.id, { ...todoNode, state: linkedTodoState });

  board.nodes = [...board.nodes, newNode];

  // Wire task.next → task.activate from source to new node.
  board.edges = [
    ...board.edges,
    {
      id: `edge-${randomUUID()}`,
      from: { nodeId: sourceNode.id, event: 'task.next' },
      to: { nodeId: newNodeId, command: 'task.activate' },
      enabled: true,
    },
  ];

  saveBoard(ctx, board);
  return {
    ok: true,
    message: `Next task "${text}" added after "${sourceNode.id.slice(0, 8)}…" (id: ${newNodeId.slice(0, 13)}…).`,
    data: { id: newNodeId, itemId: addedItem.id },
  };
}

// ── ADR 0004 — taskParallel (alias for taskSibling) ───────────────────────────

/**
 * `krnl task parallel <ref>` — canonical alias for `task sibling`.
 * Kept as a one-liner alias so both names route to the same implementation.
 */
export const taskParallel = taskSibling;

// ── Decision 29 — task kind + task note ──────────────────────────────────────

/**
 * `krnl task kind <ref> <focus|event>`
 *
 * Decision 29 §3 refusal contract:
 * - Renderer path: dispatches task.toggleKind (allows pomoCancel first).
 * - Headless (no renderer): REFUSE with exit 1 if the task is the active pomo
 *   task and the toggle direction is focus → event. This prevents corrupting
 *   the pomo FSM state.
 */
export async function taskKind(
  ctx: TaskCtx,
  ref: string | undefined,
  taskKind: 'focus' | 'event' | undefined,
): Promise<SysResult> {
  if (!ref) return { ok: false, message: 'task kind requires <ref>' };
  if (!taskKind) return { ok: false, message: 'task kind requires <event>' };
  // #180 — 'focus' is gone. Tasks are events; the Pomodoro is an independent
  // observer with no task link. 'focus' is no longer a valid kind.
  if (taskKind === 'focus') {
    return {
      ok: false,
      message: "'focus' is no longer a task kind (#180) — tasks are events; the Pomodoro observes time independently.",
      data: { exitCode: 1 },
    };
  }
  const board = loadBoard(ctx);
  const taskNode = findTaskNode(board, ref);
  if (!taskNode) return { ok: false, message: `No task node matching "${ref}"` };

  const ts = taskNode.state as TaskState;
  if (ts.kind === taskKind) {
    return { ok: true, message: `Task "${taskNode.id.slice(0, 8)}" kind is already ${taskKind}.`, data: { id: taskNode.id, kind: taskKind } };
  }

  const nextState: TaskState = { ...ts, kind: taskKind };
  updateNode(board, taskNode.id, { ...taskNode, state: nextState });
  saveBoard(ctx, board);
  return {
    ok: true,
    message: `Task "${taskNode.id.slice(0, 8)}" kind → ${taskKind}.`,
    data: { id: taskNode.id, kind: taskKind },
  };
}

/**
 * `krnl task note <ref> "<text>"` / `--clear`
 * Empty/trimmed note drops the field (mirrors habitSetNote semantics).
 */
export async function taskNote(
  ctx: TaskCtx,
  ref: string | undefined,
  text: string | undefined,
  clear: boolean,
): Promise<SysResult> {
  if (!ref) return { ok: false, message: 'task note requires <ref>' };
  if (!clear && text === undefined) {
    return { ok: false, message: 'task note requires "<text>" or --clear' };
  }
  const board = loadBoard(ctx);
  const taskNode = findTaskNode(board, ref);
  if (!taskNode) return { ok: false, message: `No task node matching "${ref}"` };

  const ts = taskNode.state as TaskState;
  let nextState: TaskState;
  if (clear) {
    const { note: _removed, ...rest } = ts;
    void _removed;
    nextState = rest as TaskState;
  } else {
    const trimmed = (text ?? '').trim();
    if (trimmed === '') {
      const { note: _removed, ...rest } = ts;
      void _removed;
      nextState = rest as TaskState;
    } else {
      nextState = { ...ts, note: trimmed };
    }
  }
  updateNode(board, taskNode.id, { ...taskNode, state: nextState });
  saveBoard(ctx, board);
  const action = (clear || !(nextState as TaskState).note) ? 'cleared' : `set to "${nextState.note}"`;
  return {
    ok: true,
    message: `Task "${taskNode.id.slice(0, 8)}" note ${action}.`,
    data: { id: taskNode.id },
  };
}

export async function taskList(
  ctx: TaskCtx,
  todoId?: string,
  json = false,
): Promise<SysResult> {
  const board = loadBoard(ctx);
  let resolvedTodoId: string | undefined;
  if (todoId) {
    // Accept TodoNode ref OR TodoItem ref (resolves to its parent TodoNode).
    const nodeR = resolveNodeRef(board, todoId, 'todo');
    if (nodeR.ok) {
      resolvedTodoId = nodeR.id;
    } else {
      const itemR = resolveTodoItemRef(board, todoId);
      if (itemR.ok) {
        resolvedTodoId = itemR.id.todoNodeId;
      } else {
        return { ok: false, message: resolutionError('todo node or item', todoId, nodeR) };
      }
    }
  }
  const tasks = (board.nodes as AnyNode[]).filter((n) => {
    if (n.kind !== 'todo.task') return false;
    if (resolvedTodoId) {
      const ts = n.state as TaskState;
      return ts.parentTodoId === resolvedTodoId;
    }
    return true;
  });

  if (json) {
    const payload = tasks.map((n) => ({ id: n.id, ...(n.state as TaskState) }));
    return { ok: true, message: JSON.stringify(payload), data: payload };
  }

  if (tasks.length === 0) {
    return { ok: true, message: 'No tasks.', data: [] };
  }

  const lines = tasks.map((n) => {
    const ts = n.state as TaskState;
    const status = ts.done ? '[x]' : '[ ]';
    const indent = '  '.repeat(ts.layer);
    return `${status} ${n.id.slice(0, 8)}  ${indent}#${ts.sequenceNumber} L${ts.layer} — ${ts.text}`;
  });

  return {
    ok: true,
    message: lines.join('\n'),
    data: tasks.map((n) => ({ id: n.id, ...(n.state as TaskState) })),
  };
}
