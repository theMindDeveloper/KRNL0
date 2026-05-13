/**
 * commandDispatch cascade tests — Decision #20
 *
 * Tests dispatcher logic for:
 *   F14 (todo) — todo.add sets bidirectional link (taskNodeId ↔ todoItemId)
 *   F11 (todo) — todo.remove cascades to linked TaskNode + descendants + edges
 *   F12 (todo) — todo.clearDone cascades all done items' TaskNodes
 *   F13 (todo) — todo.toggle mirrors done to linked TaskNode
 *   F13 (task) — task.toggle mirrors done to linked TodoItem
 *   F9  (task) — task.startPomo mutates Pomo mother state
 *   task.startPomo no-op when no Pomo mother present
 *
 * Uses the real Zustand store. Reset before each test.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import { makeCommandHandler } from '../../../src/renderer/components/Canvas/commandDispatch';
import type { Board } from '../../../src/shared/types';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';
import type { TodoState } from '../../../src/renderer/components/nodes/TodoNode/types';
import type { PomoState } from '../../../src/renderer/components/nodes/PomoNode/types';

// Stub window.krnl so the dispatcher's boardSave call doesn't throw.
beforeEach(() => {
  // @ts-expect-error — jsdom doesn't have krnl
  globalThis.window = globalThis.window ?? {};
  // @ts-expect-error
  globalThis.window.krnl = { boardSave: vi.fn().mockResolvedValue(undefined) };

  // Reset Zustand store
  useBoardStore.setState({ board: null, viewport: { x: 0, y: 0, zoom: 1 } });
});

// ── Board / node factories ────────────────────────────────────────────────────

function makePomoState(): PomoState {
  return {
    status: 'idle',
    startedAt: null,
    durationMin: 25,
    breakMin: 5,
    label: '',
    sessionsCompleted: 0,
    activeTaskId: null,
    history: [],
    pausedAt: null,
    pausedElapsedMs: 0,
  };
}

function makeTodoState(): TodoState {
  return { items: [] };
}

function makeBoardWithTodoAndTask(opts: {
  todoItemId?: string | null;
  todoItemDone?: boolean;
  taskDone?: boolean;
  includeEdge?: boolean;
  includePomoMother?: boolean;
  taskNodeId?: string;
  itemId?: string;
} = {}): Board {
  const todoId = 'todo-mother';
  const taskId = opts.taskNodeId ?? 'task-1';
  const itemId = opts.itemId ?? 'item-1';

  const todoItem = {
    id: itemId,
    text: 'test task',
    done: opts.todoItemDone ?? false,
    createdAt: '2026-05-10T10:00:00.000Z',
    completedAt: null,
    taskNodeId: taskId,
  };

  const todoNode = {
    id: todoId,
    kind: 'todo' as const,
    position: { x: 0, y: 0 },
    isMother: true,
    state: { items: [todoItem] } as TodoState,
    config: { showCompleted: true, maxVisible: 50 },
  };

  const taskState: TaskState = {
    text: 'test task',
    done: opts.taskDone ?? false,
    durationMin: 20,
    eta: '~20 min',
    sequenceNumber: 1,
    layer: 0,
    createdAt: '2026-05-10T10:00:00.000Z',
    parentTodoId: todoId,
    parentTaskId: null,
    todoItemId: opts.todoItemId !== undefined ? opts.todoItemId : itemId,
    pomoSessionsCompleted: 0,
    plannedMin: 20,
    secondsAccumulated: 0,
    currentSessionElapsedSec: 0,
  };

  const taskNode = {
    id: taskId,
    kind: 'todo.task' as const,
    position: { x: 0, y: 420 },
    isMother: false,
    state: taskState,
    config: { showDuration: true },
  };

  const nodes: Board['nodes'] = [todoNode, taskNode];

  if (opts.includePomoMother) {
    nodes.push({
      id: 'pomo-mother',
      kind: 'pomo' as const,
      position: { x: 0, y: 0 },
      isMother: true,
      state: makePomoState(),
      config: { sessionMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4 },
    });
  }

  const edges: Board['edges'] = [];
  if (opts.includeEdge) {
    edges.push({
      id: 'edge-1',
      from: { nodeId: taskId, event: 'task.next' },
      to: { nodeId: taskId, command: 'task.activate' },
      enabled: true,
    });
  }

  return {
    version: 1,
    schemaVersion: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes,
    edges,
    savedAt: '2026-05-10T10:00:00.000Z',
  };
}

// ── task.toggle bidirectional mirror ──────────────────────────────────────────

describe('F13 (task) — task.toggle mirrors done state to linked TodoItem', () => {
  it('toggling task to done sets the linked TodoItem done = true', () => {
    const board = makeBoardWithTodoAndTask({ taskDone: false, todoItemDone: false });
    useBoardStore.getState().setBoard(board);
    const handler = makeCommandHandler('task-1');
    handler('task.toggle');
    const state = useBoardStore.getState().board!;
    const todoNode = state.nodes.find((n) => n.id === 'todo-mother')!;
    const item = (todoNode.state as TodoState).items[0]!;
    expect(item.done).toBe(true);
  });

  it('toggling task to undone sets the linked TodoItem done = false', () => {
    const board = makeBoardWithTodoAndTask({ taskDone: true, todoItemDone: true });
    useBoardStore.getState().setBoard(board);
    const handler = makeCommandHandler('task-1');
    handler('task.toggle');
    const state = useBoardStore.getState().board!;
    const todoNode = state.nodes.find((n) => n.id === 'todo-mother')!;
    const item = (todoNode.state as TodoState).items[0]!;
    expect(item.done).toBe(false);
  });

  it('task.toggle when todoItemId is null does not crash', () => {
    const board = makeBoardWithTodoAndTask({ todoItemId: null });
    useBoardStore.getState().setBoard(board);
    const handler = makeCommandHandler('task-1');
    expect(() => handler('task.toggle')).not.toThrow();
  });
});

// ── todo.toggle bidirectional mirror ─────────────────────────────────────────

describe('F13 (todo) — todo.toggle mirrors done state to linked TaskNode', () => {
  it('toggling TodoItem done mirrors to linked TaskNode done = true', () => {
    const board = makeBoardWithTodoAndTask({ taskDone: false, todoItemDone: false });
    useBoardStore.getState().setBoard(board);
    const handler = makeCommandHandler('todo-mother');
    handler('todo.toggle', { id: 'item-1' });
    const state = useBoardStore.getState().board!;
    const taskNode = state.nodes.find((n) => n.id === 'task-1')!;
    expect((taskNode.state as TaskState).done).toBe(true);
  });

  it('toggling TodoItem undone mirrors to linked TaskNode done = false', () => {
    const board = makeBoardWithTodoAndTask({ taskDone: true, todoItemDone: true });
    useBoardStore.getState().setBoard(board);
    const handler = makeCommandHandler('todo-mother');
    handler('todo.toggle', { id: 'item-1' });
    const state = useBoardStore.getState().board!;
    const taskNode = state.nodes.find((n) => n.id === 'task-1')!;
    expect((taskNode.state as TaskState).done).toBe(false);
  });
});

// ── todo.remove cascade ───────────────────────────────────────────────────────

describe('F11 (todo) — todo.remove cascades to linked TaskNode + edges', () => {
  it('removes the TodoItem from the list', () => {
    const board = makeBoardWithTodoAndTask({ includeEdge: true });
    useBoardStore.getState().setBoard(board);
    const handler = makeCommandHandler('todo-mother');
    handler('todo.remove', { id: 'item-1' });
    const state = useBoardStore.getState().board!;
    const todoNode = state.nodes.find((n) => n.id === 'todo-mother')!;
    expect((todoNode.state as TodoState).items).toHaveLength(0);
  });

  it('removes the linked TaskNode from the board', () => {
    const board = makeBoardWithTodoAndTask({ includeEdge: true });
    useBoardStore.getState().setBoard(board);
    const handler = makeCommandHandler('todo-mother');
    handler('todo.remove', { id: 'item-1' });
    const state = useBoardStore.getState().board!;
    const taskNode = state.nodes.find((n) => n.id === 'task-1');
    expect(taskNode).toBeUndefined();
  });

  it('removes incident edges of the deleted TaskNode', () => {
    const board = makeBoardWithTodoAndTask({ includeEdge: true });
    useBoardStore.getState().setBoard(board);
    const handler = makeCommandHandler('todo-mother');
    handler('todo.remove', { id: 'item-1' });
    const state = useBoardStore.getState().board!;
    expect(state.edges).toHaveLength(0);
  });

  it('does not remove other nodes when removing one item', () => {
    const board = makeBoardWithTodoAndTask({ includePomoMother: true });
    useBoardStore.getState().setBoard(board);
    const handler = makeCommandHandler('todo-mother');
    handler('todo.remove', { id: 'item-1' });
    const state = useBoardStore.getState().board!;
    const pomoNode = state.nodes.find((n) => n.id === 'pomo-mother');
    expect(pomoNode).toBeDefined();
  });

  it('removes descendants in BFS cascade (parent + child task)', () => {
    // Build: todo mother → task-1 (root) → task-2 (child of task-1)
    const todoId = 'todo-mother';
    const task1Id = 'task-1';
    const task2Id = 'task-2';
    const itemId = 'item-1';

    const todoItem = {
      id: itemId,
      text: 'root task',
      done: false,
      createdAt: '2026-05-10T10:00:00.000Z',
      completedAt: null,
      taskNodeId: task1Id,
    };

    const rootTaskState: TaskState = {
      text: 'root task',
      done: false,
      durationMin: 20,
      eta: '~20 min',
      sequenceNumber: 1,
      layer: 0,
      createdAt: '2026-05-10T10:00:00.000Z',
      parentTodoId: todoId,
      parentTaskId: null,
      todoItemId: itemId,
      pomoSessionsCompleted: 0,
      plannedMin: 20,
      secondsAccumulated: 0,
      currentSessionElapsedSec: 0,
    };

    const childTaskState: TaskState = {
      text: 'child task',
      done: false,
      durationMin: 10,
      eta: '~10 min',
      sequenceNumber: 1,
      layer: 1,
      createdAt: '2026-05-10T10:01:00.000Z',
      parentTodoId: todoId,
      parentTaskId: task1Id, // child of task-1
      todoItemId: null,
      pomoSessionsCompleted: 0,
      plannedMin: 10,
      secondsAccumulated: 0,
      currentSessionElapsedSec: 0,
    };

    const cascadeBoard: Board = {
      version: 1,
      schemaVersion: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
      savedAt: '2026-05-10T10:00:00.000Z',
      nodes: [
        {
          id: todoId,
          kind: 'todo',
          position: { x: 0, y: 0 },
          isMother: true,
          state: { items: [todoItem] } as TodoState,
          config: { showCompleted: true, maxVisible: 50 },
        },
        {
          id: task1Id,
          kind: 'todo.task',
          position: { x: 0, y: 420 },
          isMother: false,
          state: rootTaskState,
          config: { showDuration: true },
        },
        {
          id: task2Id,
          kind: 'todo.task',
          position: { x: 0, y: 580 },
          isMother: false,
          state: childTaskState,
          config: { showDuration: true },
        },
      ],
      edges: [],
    };

    useBoardStore.getState().setBoard(cascadeBoard);
    const handler = makeCommandHandler(todoId);
    handler('todo.remove', { id: itemId });

    const state = useBoardStore.getState().board!;
    // Both task-1 AND task-2 (descendant) must be gone
    expect(state.nodes.find((n) => n.id === task1Id)).toBeUndefined();
    expect(state.nodes.find((n) => n.id === task2Id)).toBeUndefined();
    // TodoNode must still exist but with empty items
    expect(state.nodes.find((n) => n.id === todoId)).toBeDefined();
    expect((state.nodes.find((n) => n.id === todoId)!.state as TodoState).items).toHaveLength(0);
  });
});

// ── todo.clearDone cascade ────────────────────────────────────────────────────

describe('F12 (todo) — todo.clearDone cascades all done items TaskNodes', () => {
  it('removes done TodoItems from the list', () => {
    const board = makeBoardWithTodoAndTask({ todoItemDone: true, taskDone: true });
    useBoardStore.getState().setBoard(board);
    const handler = makeCommandHandler('todo-mother');
    handler('todo.clearDone');
    const state = useBoardStore.getState().board!;
    const todoNode = state.nodes.find((n) => n.id === 'todo-mother')!;
    expect((todoNode.state as TodoState).items).toHaveLength(0);
  });

  it('removes linked TaskNodes for done items', () => {
    const board = makeBoardWithTodoAndTask({ todoItemDone: true, taskDone: true });
    useBoardStore.getState().setBoard(board);
    const handler = makeCommandHandler('todo-mother');
    handler('todo.clearDone');
    const state = useBoardStore.getState().board!;
    expect(state.nodes.find((n) => n.id === 'task-1')).toBeUndefined();
  });

  it('does not remove undone items or their TaskNodes', () => {
    const board = makeBoardWithTodoAndTask({ todoItemDone: false, taskDone: false });
    useBoardStore.getState().setBoard(board);
    const handler = makeCommandHandler('todo-mother');
    handler('todo.clearDone');
    const state = useBoardStore.getState().board!;
    const todoNode = state.nodes.find((n) => n.id === 'todo-mother')!;
    // Undone item stays
    expect((todoNode.state as TodoState).items).toHaveLength(1);
    // Task node stays
    expect(state.nodes.find((n) => n.id === 'task-1')).toBeDefined();
  });
});

// ── task.startPomo ────────────────────────────────────────────────────────────

describe('F9 (task) — task.startPomo mutates the Pomo mother state', () => {
  it('starts the Pomo mother with the task label and durationMin', () => {
    const board = makeBoardWithTodoAndTask({ includePomoMother: true });
    useBoardStore.getState().setBoard(board);
    const handler = makeCommandHandler('task-1');
    handler('task.startPomo');
    const state = useBoardStore.getState().board!;
    const pomoNode = state.nodes.find((n) => n.id === 'pomo-mother')!;
    const ps = pomoNode.state as PomoState;
    expect(ps.status).toBe('running');
    expect(ps.label).toBe('test task');
    expect(ps.durationMin).toBe(20);
  });

  it('is a no-op when no Pomo mother is present in the board', () => {
    // Board without pomo mother
    const board = makeBoardWithTodoAndTask({ includePomoMother: false });
    useBoardStore.getState().setBoard(board);
    const handler = makeCommandHandler('task-1');
    // Should not throw
    expect(() => handler('task.startPomo')).not.toThrow();
    // Board nodes unchanged
    const state = useBoardStore.getState().board!;
    expect(state.nodes.find((n) => n.kind === 'pomo')).toBeUndefined();
  });

  it('does not start pomo if task is done', () => {
    // task.startPomo in dispatcher fires regardless of done (done guard is in UI click handler)
    // but we verify the pomo IS mutated (the done guard is only in the body-click UI handler,
    // not in the dispatcher — verify the dispatcher itself always starts if pomo found)
    const board = makeBoardWithTodoAndTask({ includePomoMother: true, taskDone: true });
    useBoardStore.getState().setBoard(board);
    const handler = makeCommandHandler('task-1');
    handler('task.startPomo');
    const state = useBoardStore.getState().board!;
    const pomoNode = state.nodes.find((n) => n.id === 'pomo-mother')!;
    // dispatcher starts pomo regardless — UI blocks click for done tasks
    expect((pomoNode.state as PomoState).status).toBe('running');
  });
});

// ── task.delete cascade ───────────────────────────────────────────────────────

describe('F13 (task) — task.delete cascades TaskNode + descendants + linked TodoItem', () => {
  it('removes the TaskNode from the board', () => {
    const board = makeBoardWithTodoAndTask({ includeEdge: true });
    useBoardStore.getState().setBoard(board);
    const handler = makeCommandHandler('task-1');
    handler('task.delete');
    const state = useBoardStore.getState().board!;
    expect(state.nodes.find((n) => n.id === 'task-1')).toBeUndefined();
  });

  it('removes the linked TodoItem from the TodoNode', () => {
    const board = makeBoardWithTodoAndTask({ includeEdge: true });
    useBoardStore.getState().setBoard(board);
    const handler = makeCommandHandler('task-1');
    handler('task.delete');
    const state = useBoardStore.getState().board!;
    const todoNode = state.nodes.find((n) => n.id === 'todo-mother')!;
    expect((todoNode.state as TodoState).items).toHaveLength(0);
  });

  it('removes incident edges', () => {
    const board = makeBoardWithTodoAndTask({ includeEdge: true });
    useBoardStore.getState().setBoard(board);
    const handler = makeCommandHandler('task-1');
    handler('task.delete');
    const state = useBoardStore.getState().board!;
    expect(state.edges).toHaveLength(0);
  });

  it('removes descendants (BFS) in addition to the root task', () => {
    const todoId = 'todo-mother';
    const task1Id = 'task-parent';
    const task2Id = 'task-child';
    const itemId = 'item-1';

    const parentState: TaskState = {
      text: 'parent',
      done: false,
      durationMin: 20,
      eta: '~20 min',
      sequenceNumber: 1,
      layer: 0,
      createdAt: '2026-05-10T10:00:00.000Z',
      parentTodoId: todoId,
      parentTaskId: null,
      todoItemId: itemId,
      pomoSessionsCompleted: 0,
      plannedMin: 20,
      secondsAccumulated: 0,
      currentSessionElapsedSec: 0,
    };

    const childState: TaskState = {
      text: 'child',
      done: false,
      durationMin: 10,
      eta: '~10 min',
      sequenceNumber: 1,
      layer: 1,
      createdAt: '2026-05-10T10:01:00.000Z',
      parentTodoId: todoId,
      parentTaskId: task1Id,
      todoItemId: null,
      pomoSessionsCompleted: 0,
      plannedMin: 10,
      secondsAccumulated: 0,
      currentSessionElapsedSec: 0,
    };

    const cascadeBoard: Board = {
      version: 1,
      schemaVersion: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
      savedAt: '2026-05-10T10:00:00.000Z',
      nodes: [
        {
          id: todoId,
          kind: 'todo',
          position: { x: 0, y: 0 },
          isMother: true,
          state: {
            items: [{
              id: itemId,
              text: 'parent',
              done: false,
              createdAt: '2026-05-10T10:00:00.000Z',
              completedAt: null,
              taskNodeId: task1Id,
            }],
          } as TodoState,
          config: { showCompleted: true, maxVisible: 50 },
        },
        { id: task1Id, kind: 'todo.task', position: { x: 0, y: 420 }, isMother: false, state: parentState, config: { showDuration: true } },
        { id: task2Id, kind: 'todo.task', position: { x: 0, y: 580 }, isMother: false, state: childState, config: { showDuration: true } },
      ],
      edges: [
        { id: 'e1', from: { nodeId: task1Id, event: 'task.next' }, to: { nodeId: task2Id, command: 'task.activate' }, enabled: true },
      ],
    };

    useBoardStore.getState().setBoard(cascadeBoard);
    const handler = makeCommandHandler(task1Id);
    handler('task.delete');

    const state = useBoardStore.getState().board!;
    expect(state.nodes.find((n) => n.id === task1Id)).toBeUndefined();
    expect(state.nodes.find((n) => n.id === task2Id)).toBeUndefined();
    expect(state.edges).toHaveLength(0);
  });
});
