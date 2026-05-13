// sys task CLI — board.json operations for task nodes.
// Operates on todo.task nodes linked to the todo mother node.

import { randomUUID } from 'crypto';
import { loadBoardFrom, saveBoardTo } from '../../main/persistence/board';
import type { SysResult } from '../SysFacade';
import {
  taskToggle as fsmTaskToggle,
  taskEdit as fsmTaskEdit,
} from '../../renderer/components/nodes/TaskNode/commands';
import type { TaskState } from '../../renderer/components/nodes/TaskNode/types';
import {
  todoToggle as fsmTodoToggle,
  todoRemove as fsmTodoRemove,
  todoLinkTask,
  todoAdd as fsmTodoAdd,
} from '../../renderer/components/nodes/TodoNode/commands';
import type { TodoState } from '../../renderer/components/nodes/TodoNode/types';
import type { PomoState } from '../../renderer/components/nodes/PomoNode/types';
import {
  pomoStart as fsmPomoStart,
} from '../../renderer/components/nodes/PomoNode/commands';

export interface TaskCtx {
  boardPath: string;
  onBoardChanged?: () => void;
}

interface BoardShape {
  nodes: unknown[];
  edges: unknown[];
  [k: string]: unknown;
}

interface AnyNode {
  id: string;
  kind: string;
  isMother?: boolean;
  state: unknown;
  position?: { x: number; y: number };
  [k: string]: unknown;
}

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

function findTaskNode(board: BoardShape, id: string): AnyNode | null {
  const n = findNode(board, id);
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

/** BFS collect task node id + all descendant task node ids. */
function collectDescendants(rootId: string, board: BoardShape): string[] {
  const result: string[] = [];
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    result.push(current);
    for (const n of board.nodes) {
      if (typeof n !== 'object' || n === null) continue;
      const node = n as AnyNode;
      if (node.kind !== 'todo.task') continue;
      const ts = node.state as TaskState;
      if (ts.parentTaskId === current) queue.push(node.id);
    }
  }
  return result;
}

/** Renumber sibling tasks (1-based, sorted by createdAt) after add/delete. */
function renumberSiblings(
  board: BoardShape,
  parentTodoId: string,
  parentTaskId: string | null,
): void {
  const siblings = (board.nodes as AnyNode[])
    .filter((n) => {
      if (n.kind !== 'todo.task') return false;
      const ts = n.state as TaskState;
      return ts.parentTodoId === parentTodoId && ts.parentTaskId === parentTaskId;
    })
    .sort((a, b) => {
      const ta = (a.state as TaskState).createdAt;
      const tb = (b.state as TaskState).createdAt;
      return ta.localeCompare(tb);
    });
  siblings.forEach((n, i) => {
    const ts = n.state as TaskState;
    if (ts.sequenceNumber !== i + 1) {
      updateNode(board, n.id, { ...n, state: { ...ts, sequenceNumber: i + 1 } });
    }
  });
}

// ── Commands ────────────────────────────────────────────────────────────────

export async function taskAdd(
  ctx: TaskCtx,
  todoId: string | undefined,
  text: string | undefined,
  durationMin = 20,
): Promise<SysResult> {
  if (!text) return { ok: false, message: 'task add requires a <text>' };
  const board = loadBoard(ctx);

  // Find the todo mother (use first one if todoId not specified)
  let todoMother: AnyNode | null = null;
  if (todoId) {
    const candidate = findNode(board, todoId);
    if (!candidate || candidate.kind !== 'todo') {
      return { ok: false, message: `No todo node with id "${todoId}"` };
    }
    todoMother = candidate;
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
  };

  // Link taskNodeId on the TodoItem
  const linkedTodoState = todoLinkTask(nextTodoState, {
    itemId: addedItem.id,
    taskNodeId: taskId,
  });

  const taskNode: AnyNode = {
    id: taskId,
    kind: 'todo.task',
    isMother: false,
    position: { x: baseX + (seq - 1) * 252, y: baseY + 420 },
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
  if (!taskNode) return { ok: false, message: `No task node with id "${taskId}"` };

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
  if (!taskNode) return { ok: false, message: `No task node with id "${taskId}"` };

  const prevState = taskNode.state as TaskState;
  const nextState = fsmTaskToggle(prevState);
  updateNode(board, taskId, { ...taskNode, state: nextState });

  // Mirror to linked TodoItem
  if (prevState.todoItemId !== null) {
    const todoMother = findNode(board, prevState.parentTodoId);
    if (todoMother && todoMother.kind === 'todo') {
      const todoState = todoMother.state as TodoState;
      const item = todoState.items.find((i) => i.id === prevState.todoItemId);
      if (item && item.done !== nextState.done) {
        const env = { uuid: () => randomUUID(), now: () => new Date().toISOString() };
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
  if (!taskNode) return { ok: false, message: `No task node with id "${taskId}"` };

  const ts = taskNode.state as TaskState;
  const toRemove = new Set(collectDescendants(taskId, board));

  // Remove linked TodoItem
  if (ts.todoItemId !== null) {
    const todoMother = findNode(board, ts.parentTodoId);
    if (todoMother && todoMother.kind === 'todo') {
      const newTodo = fsmTodoRemove(todoMother.state as TodoState, {
        id: ts.todoItemId,
      });
      updateNode(board, todoMother.id, { ...todoMother, state: newTodo });
    }
  }

  board.nodes = board.nodes.filter(
    (n) => typeof n !== 'object' || n === null || !toRemove.has((n as AnyNode).id),
  );
  board.edges = board.edges.filter(
    (e) => {
      if (typeof e !== 'object' || e === null) return true;
      const ed = e as { from?: { nodeId?: string }; to?: { nodeId?: string } };
      return !toRemove.has(ed.from?.nodeId ?? '') && !toRemove.has(ed.to?.nodeId ?? '');
    },
  );

  renumberSiblings(board, ts.parentTodoId, ts.parentTaskId);
  saveBoard(ctx, board);
  return { ok: true, message: `Task and ${toRemove.size - 1} descendant(s) deleted.` };
}

export async function taskStartPomo(
  ctx: TaskCtx,
  taskId: string | undefined,
): Promise<SysResult> {
  if (!taskId) return { ok: false, message: 'task pomo requires a <id>' };
  const board = loadBoard(ctx);
  const taskNode = findTaskNode(board, taskId);
  if (!taskNode) return { ok: false, message: `No task node with id "${taskId}"` };

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
  if (!parentNode) return { ok: false, message: `No task node with id "${parentTaskId}"` };

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
  };

  const childNode: AnyNode = {
    id: childId,
    kind: 'todo.task',
    isMother: false,
    position: {
      x: (parentNode.position?.x ?? 0) + (seq - 1) * 252,
      y: (parentNode.position?.y ?? 0) + 160,
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
  if (!taskNode) return { ok: false, message: `No task node with id "${taskId}"` };

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
  if (!sourceNode) return { ok: false, message: `No task node with id "${taskId}"` };

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
  };

  const newNode: AnyNode = {
    id: newNodeId,
    kind: 'todo.task',
    isMother: false,
    // Parallel fork: position below source, not beside it
    position: {
      x: sourceNode.position?.x ?? 0,
      y: (sourceNode.position?.y ?? 0) + 240,
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
  if (!taskNode) return { ok: false, message: `No task node with id "${taskId}"` };

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

export async function taskList(
  ctx: TaskCtx,
  todoId?: string,
): Promise<SysResult> {
  const board = loadBoard(ctx);
  const tasks = (board.nodes as AnyNode[]).filter((n) => {
    if (n.kind !== 'todo.task') return false;
    if (todoId) {
      const ts = n.state as TaskState;
      return ts.parentTodoId === todoId;
    }
    return true;
  });

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
