/**
 * #170 — deleting a task must be undoable.
 *
 * The cascade delete (task.delete → deleteTaskNodesCascade) and the bulk
 * removeNodeSet path previously wrote the board with a raw setState that
 * bypassed pushHistory, so undo had nothing to restore. These tests drive the
 * REAL command path (not the store's removeNode, which always pushed and would
 * pass falsely) and assert one undo brings the task back.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import { makeCommandHandler } from '../../../src/renderer/components/Canvas/commandDispatch';
import type { Board } from '../../../src/shared/types';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';
import type { TodoState } from '../../../src/renderer/components/nodes/TodoNode/types';

beforeEach(() => {
  // @ts-expect-error — jsdom has no krnl bridge
  globalThis.window = globalThis.window ?? {};
  // @ts-expect-error
  globalThis.window.krnl = { boardSave: vi.fn().mockResolvedValue(undefined) };
  useBoardStore.setState({ board: null, viewport: { x: 0, y: 0, zoom: 1 }, history: [], future: [] });
});

function makeBoard(): Board {
  const todoId = 'todo-mother';
  const taskId = 'task-1';
  const itemId = 'item-1';
  const taskState: TaskState = {
    text: 'Write report', done: false, durationMin: 25, eta: '~25 min',
    sequenceNumber: 1, layer: 0, createdAt: '2026-05-10T10:00:00.000Z',
    parentTodoId: todoId, parentTaskId: null, todoItemId: itemId,
    pomoSessionsCompleted: 0, plannedMin: 25, secondsAccumulated: 0,
    currentSessionElapsedSec: 0, kind: 'event',
  };
  return {
    version: 1, schemaVersion: 2, viewport: { x: 0, y: 0, zoom: 1 }, layoutMode: 'canvas',
    nodes: [
      {
        id: todoId, kind: 'todo', position: { x: 100, y: 0 }, isMother: true,
        state: { items: [{ id: itemId, text: 'Write report', done: false, createdAt: '2026-05-10T10:00:00.000Z', completedAt: null, taskNodeId: taskId }] } as TodoState,
        config: { showCompleted: true, maxVisible: 50 },
      },
      { id: taskId, kind: 'todo.task', position: { x: 300, y: 420 }, isMother: false, state: taskState, config: { showDuration: true } },
    ],
    edges: [],
    savedAt: '2026-05-10T10:00:00.000Z',
  };
}

const hasTask = () => useBoardStore.getState().board!.nodes.some((n) => n.id === 'task-1');

describe('#170 — undo task delete', () => {
  it('task.delete removes the node and one undo restores it', () => {
    useBoardStore.getState().setBoard(makeBoard());
    expect(hasTask()).toBe(true);

    makeCommandHandler('task-1')('task.delete', {});
    expect(hasTask()).toBe(false);

    useBoardStore.getState().undo();
    expect(hasTask()).toBe(true);
  });

  it('does not require a second undo (single history slot)', () => {
    useBoardStore.getState().setBoard(makeBoard());
    makeCommandHandler('task-1')('task.delete', {});
    useBoardStore.getState().undo();
    // After one undo the task is back AND there is nothing left to undo from
    // this action (history empty → board unchanged on a second undo).
    const afterFirst = useBoardStore.getState().board;
    useBoardStore.getState().undo();
    expect(useBoardStore.getState().board).toBe(afterFirst);
    expect(hasTask()).toBe(true);
  });

  it('removing a todo item (cascade) is undoable in one step', () => {
    useBoardStore.getState().setBoard(makeBoard());
    makeCommandHandler('todo-mother')('todo.remove', { id: 'item-1' });
    expect(hasTask()).toBe(false);

    useBoardStore.getState().undo();
    expect(hasTask()).toBe(true);
    const item = (useBoardStore.getState().board!.nodes.find((n) => n.id === 'todo-mother')!.state as TodoState).items.find((i) => i.id === 'item-1');
    expect(item).toBeDefined();
  });
});
