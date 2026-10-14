/**
 * #169 — completion ledger acceptance tests. These ARE the requirement:
 *
 *   1. created + done + deleted   → STILL in analytics (work was real)
 *   2. created + undone + deleted → NOT in analytics (plan abandoned)
 *   3. created by mistake, deleted→ NOT in analytics (never completed)
 *
 * Plus the undo invariant: completing then Ctrl+Z reverts the ledger entry AND
 * the done-state in a single step (the ledger write rides the toggle's history
 * slot, it does not push its own).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import { makeCommandHandler } from '../../../src/renderer/components/Canvas/commandDispatch';
import { taskSource } from '../../../src/renderer/analytics/sources/taskSource';
import type { Board } from '../../../src/shared/types';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';
import type { TodoState } from '../../../src/renderer/components/nodes/TodoNode/types';

beforeEach(() => {
  // @ts-expect-error — jsdom doesn't have krnl
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
    text: 'Write report',
    done: false,
    durationMin: 25,
    eta: '~25 min',
    sequenceNumber: 1,
    layer: 0,
    createdAt: '2026-05-10T10:00:00.000Z',
    parentTodoId: todoId,
    parentTaskId: null,
    todoItemId: itemId,
    pomoSessionsCompleted: 0,
    plannedMin: 25,
    secondsAccumulated: 0,
    currentSessionElapsedSec: 0,
    kind: 'event',
  };

  return {
    version: 1,
    schemaVersion: 2,
    viewport: { x: 0, y: 0, zoom: 1 },
    layoutMode: 'canvas',
    nodes: [
      {
        id: todoId,
        kind: 'todo',
        position: { x: 100, y: 0 },
        isMother: true,
        state: {
          items: [
            { id: itemId, text: 'Write report', done: false, createdAt: '2026-05-10T10:00:00.000Z', completedAt: null, taskNodeId: taskId },
          ],
        } as TodoState,
        config: { showCompleted: true, maxVisible: 50 },
      },
      { id: taskId, kind: 'todo.task', position: { x: 300, y: 420 }, isMother: false, state: taskState, config: { showDuration: true } },
    ],
    edges: [],
    savedAt: '2026-05-10T10:00:00.000Z',
  };
}

function completedCount(): number {
  const board = useBoardStore.getState().board!;
  return taskSource.collect({ nodes: board.nodes, completions: board.completions }).length;
}

describe('#169 completion ledger — acceptance (the three cases)', () => {
  it('case 1: created + done + deleted → STILL counted in analytics', () => {
    useBoardStore.getState().setBoard(makeBoard());
    const handler = makeCommandHandler('task-1');

    // Mark done → ledger entry written.
    handler('task.toggle', {});
    expect(completedCount()).toBe(1);

    // Delete the task node — the entry must survive.
    useBoardStore.getState().removeNode('task-1');
    expect(useBoardStore.getState().board!.nodes.find((n) => n.id === 'task-1')).toBeUndefined();
    expect(completedCount()).toBe(1);
  });

  it('case 2: created + undone + deleted → NOT counted', () => {
    useBoardStore.getState().setBoard(makeBoard());
    // Never completed. Delete it.
    useBoardStore.getState().removeNode('task-1');
    expect(completedCount()).toBe(0);
  });

  it('case 3: created by mistake, deleted immediately → NOT counted', () => {
    useBoardStore.getState().setBoard(makeBoard());
    expect(completedCount()).toBe(0);
    useBoardStore.getState().removeNode('task-1');
    expect(completedCount()).toBe(0);
  });

  it('reopening a done task (done → undone) removes its ledger entry', () => {
    useBoardStore.getState().setBoard(makeBoard());
    const handler = makeCommandHandler('task-1');
    handler('task.toggle', {}); // done
    expect(completedCount()).toBe(1);
    handler('task.toggle', {}); // undone
    expect(completedCount()).toBe(0);
  });

  it('undo invariant: complete then undo reverts ledger AND done-state in one step', () => {
    useBoardStore.getState().setBoard(makeBoard());
    const handler = makeCommandHandler('task-1');

    handler('task.toggle', {}); // done + ledger entry
    expect(completedCount()).toBe(1);
    expect((useBoardStore.getState().board!.nodes.find((n) => n.id === 'task-1')!.state as TaskState).done).toBe(true);

    useBoardStore.getState().undo();

    const task = useBoardStore.getState().board!.nodes.find((n) => n.id === 'task-1')!.state as TaskState;
    expect(task.done).toBe(false);       // done-state reverted
    expect(completedCount()).toBe(0);    // ledger entry reverted — same step
  });

  it('completing the same task twice does not duplicate the ledger entry (idempotent upsert)', () => {
    useBoardStore.getState().setBoard(makeBoard());
    const handler = makeCommandHandler('task-1');
    handler('task.toggle', {});   // done
    handler('task.toggle', {});   // undone
    handler('task.toggle', {});   // done again
    expect(completedCount()).toBe(1);
  });
});
