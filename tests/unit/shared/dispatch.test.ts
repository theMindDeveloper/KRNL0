// Unit tests for shared dispatch — task cascade pure functions.
// Focus: T17 — task.delete cancels active pomo when the deleted task is active.

import { describe, it, expect } from 'vitest';
import { deleteTaskCascade, collectDescendants, renumberSiblings } from '../../../src/shared/dispatch/task';
import type { BoardShape, AnyNode } from '../../../src/shared/dispatch/types';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';
import type { TodoState } from '../../../src/renderer/components/nodes/TodoNode/types';
import type { PomoState } from '../../../src/renderer/components/nodes/PomoNode/types';

// ── helpers ────────────────────────────────────────────────────────────────

function makeTask(
  id: string,
  opts: {
    parentTodoId?: string;
    parentTaskId?: string | null;
    todoItemId?: string | null;
    done?: boolean;
    sequenceNumber?: number;
    createdAt?: string;
  } = {},
): AnyNode {
  const state: TaskState = {
    text: `task-${id}`,
    done: opts.done ?? false,
    durationMin: 25,
    eta: '~25 min',
    sequenceNumber: opts.sequenceNumber ?? 1,
    layer: opts.parentTaskId ? 1 : 0,
    createdAt: opts.createdAt ?? '2026-01-01T00:00:00.000Z',
    parentTodoId: opts.parentTodoId ?? 'todo-mother',
    parentTaskId: opts.parentTaskId ?? null,
    todoItemId: opts.todoItemId ?? null,
    pomoSessionsCompleted: 0,
    plannedMin: 25,
    secondsAccumulated: 0,
    currentSessionElapsedSec: 0,
  };
  return { id, kind: 'todo.task', isMother: false, state };
}

function makeTodo(id: string, items: TodoState['items'] = []): AnyNode {
  const state: TodoState = { items };
  return { id, kind: 'todo', isMother: true, state };
}

function makePomo(id: string, activeTaskId: string | null, status: PomoState['status'] = 'running'): AnyNode {
  const state: PomoState = {
    status,
    startedAt: status === 'running' ? '2026-01-01T00:00:00.000Z' : null,
    durationMin: 25,
    breakMin: 5,
    label: 'test',
    sessionsCompleted: 0,
    activeTaskId,
    history: [],
    pausedAt: null,
    pausedElapsedMs: 0,
  };
  return { id, kind: 'pomo', isMother: true, state };
}

function makeBoard(nodes: AnyNode[], edges = []): BoardShape {
  return { nodes: [...nodes], edges };
}

// ── collectDescendants ─────────────────────────────────────────────────────

describe('collectDescendants', () => {
  it('returns just the root when it has no children', () => {
    const nodes = [makeTask('t1'), makeTask('t2')];
    expect(collectDescendants('t1', nodes)).toEqual(['t1']);
  });

  it('returns root + direct children', () => {
    const child = makeTask('t1-child', { parentTaskId: 't1' });
    const nodes = [makeTask('t1'), child];
    const result = collectDescendants('t1', nodes);
    expect(result).toContain('t1');
    expect(result).toContain('t1-child');
    expect(result).toHaveLength(2);
  });

  it('BFS collects all levels of descendants', () => {
    const nodes = [
      makeTask('root'),
      makeTask('child1', { parentTaskId: 'root' }),
      makeTask('child2', { parentTaskId: 'root' }),
      makeTask('grandchild', { parentTaskId: 'child1' }),
    ];
    const result = collectDescendants('root', nodes);
    expect(result).toHaveLength(4);
    expect(result).toContain('grandchild');
  });
});

// ── deleteTaskCascade — basic ──────────────────────────────────────────────

describe('deleteTaskCascade — basic', () => {
  it('removes the root task node', () => {
    const task = makeTask('t1', { todoItemId: null });
    const board = makeBoard([task]);
    const result = deleteTaskCascade(board, 't1');
    expect(result.board.nodes.find((n) => n.id === 't1')).toBeUndefined();
  });

  it('returns removedCount = 1 for a leaf task', () => {
    const board = makeBoard([makeTask('t1')]);
    const { removedCount } = deleteTaskCascade(board, 't1');
    expect(removedCount).toBe(1);
  });

  it('returns removedCount = 3 when task has two descendants', () => {
    const nodes = [
      makeTask('root'),
      makeTask('child1', { parentTaskId: 'root' }),
      makeTask('child2', { parentTaskId: 'root' }),
    ];
    const board = makeBoard(nodes);
    const { removedCount } = deleteTaskCascade(board, 'root');
    expect(removedCount).toBe(3);
  });

  it('removes incident edges', () => {
    const task = makeTask('t1');
    const board: BoardShape = {
      nodes: [task],
      edges: [
        { id: 'e1', from: { nodeId: 't1', event: 'task.next' }, to: { nodeId: 'other', command: 'task.activate' }, enabled: true },
        { id: 'e2', from: { nodeId: 'other', event: 'task.next' }, to: { nodeId: 'elsewhere', command: 'task.activate' }, enabled: true },
      ],
    };
    deleteTaskCascade(board, 't1');
    expect(board.edges.find((e) => e.id === 'e1')).toBeUndefined();
    expect(board.edges.find((e) => e.id === 'e2')).toBeDefined(); // unrelated edge survives
  });
});

// ── deleteTaskCascade — TodoItem cleanup ───────────────────────────────────

describe('deleteTaskCascade — TodoItem cleanup', () => {
  it('removes linked TodoItem from parent TodoNode', () => {
    const item = { id: 'item-1', text: 'buy milk', done: false, createdAt: '2026-01-01T00:00:00.000Z', completedAt: null, taskNodeId: 't1' };
    const todo = makeTodo('todo-mother', [item]);
    const task = makeTask('t1', { todoItemId: 'item-1', parentTodoId: 'todo-mother' });
    const board = makeBoard([todo, task]);

    deleteTaskCascade(board, 't1');

    const updatedTodo = board.nodes.find((n) => n.id === 'todo-mother');
    const todoState = updatedTodo?.state as TodoState;
    expect(todoState.items.find((i) => i.id === 'item-1')).toBeUndefined();
  });

  it('does not affect unrelated TodoItems', () => {
    const item1 = { id: 'item-1', text: 'buy milk', done: false, createdAt: '2026-01-01T00:00:00.000Z', completedAt: null, taskNodeId: 't1' };
    const item2 = { id: 'item-2', text: 'other', done: false, createdAt: '2026-01-01T00:00:00.000Z', completedAt: null, taskNodeId: 't2' };
    const todo = makeTodo('todo-mother', [item1, item2]);
    const task = makeTask('t1', { todoItemId: 'item-1', parentTodoId: 'todo-mother' });
    const board = makeBoard([todo, task]);

    deleteTaskCascade(board, 't1');

    const updatedTodo = board.nodes.find((n) => n.id === 'todo-mother');
    const todoState = updatedTodo?.state as TodoState;
    expect(todoState.items.find((i) => i.id === 'item-2')).toBeDefined();
  });
});

// ── T17: deleteTaskCascade — pomo cancel ──────────────────────────────────

describe('T17 — deleteTaskCascade cancels active pomo', () => {
  it('cancels pomo and clears activeTaskId when deleted task is active', () => {
    const pomo = makePomo('pomo-1', 't1', 'running');
    const task = makeTask('t1', { parentTodoId: 'todo-mother' });
    const todo = makeTodo('todo-mother', []);
    const board = makeBoard([pomo, todo, task]);

    const { pomoCancelled } = deleteTaskCascade(board, 't1');

    expect(pomoCancelled).toBe(true);
    const updatedPomo = board.nodes.find((n) => n.id === 'pomo-1');
    const ps = updatedPomo?.state as PomoState;
    expect(ps.activeTaskId).toBeNull();
    expect(ps.status).toBe('idle');
  });

  it('cancels pomo when a DESCENDANT is the active task', () => {
    const pomo = makePomo('pomo-1', 'child-1', 'running');
    const root = makeTask('root', { parentTodoId: 'todo-mother' });
    const child = makeTask('child-1', { parentTaskId: 'root', parentTodoId: 'todo-mother' });
    const todo = makeTodo('todo-mother', []);
    const board = makeBoard([pomo, todo, root, child]);

    const { pomoCancelled } = deleteTaskCascade(board, 'root');

    expect(pomoCancelled).toBe(true);
    const updatedPomo = board.nodes.find((n) => n.id === 'pomo-1');
    const ps = updatedPomo?.state as PomoState;
    expect(ps.activeTaskId).toBeNull();
  });

  it('does NOT cancel pomo when a DIFFERENT task is active', () => {
    const pomo = makePomo('pomo-1', 't2', 'running');
    const t1 = makeTask('t1', { parentTodoId: 'todo-mother' });
    const t2 = makeTask('t2', { parentTodoId: 'todo-mother' });
    const todo = makeTodo('todo-mother', []);
    const board = makeBoard([pomo, todo, t1, t2]);

    const { pomoCancelled } = deleteTaskCascade(board, 't1');

    expect(pomoCancelled).toBe(false);
    const updatedPomo = board.nodes.find((n) => n.id === 'pomo-1');
    const ps = updatedPomo?.state as PomoState;
    expect(ps.activeTaskId).toBe('t2'); // untouched
    expect(ps.status).toBe('running');  // still running
  });

  it('does NOT cancel pomo when pomo is already idle', () => {
    const pomo = makePomo('pomo-1', 't1', 'idle');
    const task = makeTask('t1', { parentTodoId: 'todo-mother' });
    const todo = makeTodo('todo-mother', []);
    const board = makeBoard([pomo, todo, task]);

    const { pomoCancelled } = deleteTaskCascade(board, 't1');

    // pomoCancelled is still true (activeTaskId was cleared) but status stays idle
    expect(pomoCancelled).toBe(true);
    const updatedPomo = board.nodes.find((n) => n.id === 'pomo-1');
    const ps = updatedPomo?.state as PomoState;
    expect(ps.activeTaskId).toBeNull();
  });

  it('returns pomoCancelled=false when no pomo node exists', () => {
    const task = makeTask('t1', { parentTodoId: 'todo-mother' });
    const todo = makeTodo('todo-mother', []);
    const board = makeBoard([todo, task]);

    const { pomoCancelled } = deleteTaskCascade(board, 't1');
    expect(pomoCancelled).toBe(false);
  });
});

// ── renumberSiblings ────────────────────────────────────────────────────────

describe('renumberSiblings', () => {
  it('renumbers tasks 1-based after deletion', () => {
    const t1 = makeTask('t1', { parentTodoId: 'todo', sequenceNumber: 1, createdAt: '2026-01-01T00:00:00.000Z' });
    const t2 = makeTask('t2', { parentTodoId: 'todo', sequenceNumber: 2, createdAt: '2026-01-01T00:00:01.000Z' });
    // Simulate t0 was deleted, now t1 and t2 need renumber
    const board = makeBoard([t1, t2]);
    // Update t2's sequenceNumber to 3 to create a gap
    (board.nodes[1]!.state as TaskState).sequenceNumber = 3;

    renumberSiblings(board, 'todo', null);

    const updated1 = board.nodes.find((n) => n.id === 't1');
    const updated2 = board.nodes.find((n) => n.id === 't2');
    expect((updated1?.state as TaskState).sequenceNumber).toBe(1);
    expect((updated2?.state as TaskState).sequenceNumber).toBe(2);
  });
});
