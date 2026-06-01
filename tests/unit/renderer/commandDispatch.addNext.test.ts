/**
 * ADR 0004 §2 — task.addNext command tests.
 *
 * Verifies dispatcher behaviour:
 *   - Creates a new TaskNode with parentTaskId matching SOURCE's parentTaskId
 *     (NOT source.id — same chain level, not a subtask).
 *   - Creates exactly ONE task.next edge from source to the new task.
 *   - Appends a TodoItem on the parent TodoNode (bidirectional invariant).
 *   - selectScheduledTasksForRange places the new task AFTER source when
 *     source is anchored.
 *   - Layer matches source.layer (not source.layer + 1).
 *   - Position is offset to the right of source (horizontal flow).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import { makeCommandHandler } from '../../../src/renderer/components/Canvas/commandDispatch';
import { selectScheduledTasksForRange } from '../../../src/renderer/store/scheduleSelector';
import type { Board } from '../../../src/shared/types';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';
import type { TodoState } from '../../../src/renderer/components/nodes/TodoNode/types';

beforeEach(() => {
  // @ts-expect-error — jsdom doesn't have krnl
  globalThis.window = globalThis.window ?? {};
  // @ts-expect-error
  globalThis.window.krnl = { boardSave: vi.fn().mockResolvedValue(undefined) };
  useBoardStore.setState({ board: null, viewport: { x: 0, y: 0, zoom: 1 } });
});

function makeBoardWithSource(opts: {
  scheduledFor?: string;
  parentTaskIdOnSource?: string | null;
} = {}): Board {
  const todoId = 'todo-mother';
  const sourceId = 'task-source';
  const itemId = 'item-source';

  const todoNode = {
    id: todoId,
    kind: 'todo' as const,
    position: { x: 100, y: 0 },
    isMother: true,
    state: {
      items: [
        {
          id: itemId,
          text: 'source',
          done: false,
          createdAt: '2026-05-10T10:00:00.000Z',
          completedAt: null,
          taskNodeId: sourceId,
        },
      ],
    } as TodoState,
    config: { showCompleted: true, maxVisible: 50 },
  };

  const sourceState: TaskState = {
    text: 'source',
    done: false,
    durationMin: 25,
    eta: '~25 min',
    sequenceNumber: 1,
    layer: 0,
    createdAt: '2026-05-10T10:00:00.000Z',
    parentTodoId: todoId,
    parentTaskId: opts.parentTaskIdOnSource ?? null,
    todoItemId: itemId,
    pomoSessionsCompleted: 0,
    plannedMin: 25,
    secondsAccumulated: 0,
    currentSessionElapsedSec: 0,
    ...(opts.scheduledFor !== undefined ? { scheduledFor: opts.scheduledFor } : {}),
  };

  const sourceNode = {
    id: sourceId,
    kind: 'todo.task' as const,
    position: { x: 300, y: 420 },
    isMother: false,
    state: sourceState,
    config: { showDuration: true },
  };

  return {
    version: 1,
    schemaVersion: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: 'mother-pomo',
        kind: 'pomo' as const,
        position: { x: 0, y: 0 },
        isMother: true,
        state: {
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
        },
        config: { sessionMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4 },
      },
      todoNode,
      sourceNode,
    ],
    edges: [],
    savedAt: '2026-05-10T10:00:00.000Z',
  };
}

describe('task.addNext — creates a sibling-level sequential successor', () => {
  it('creates a node with parentTaskId matching source.parentTaskId (null when source is root)', () => {
    useBoardStore.getState().setBoard(makeBoardWithSource());
    const handler = makeCommandHandler('task-source');
    handler('task.addNext', { text: 'after', durationMin: 30 });

    const board = useBoardStore.getState().board!;
    const newTasks = board.nodes.filter(
      (n) => n.kind === 'todo.task' && n.id !== 'task-source',
    );
    expect(newTasks).toHaveLength(1);
    const newState = newTasks[0]!.state as TaskState;
    expect(newState.parentTaskId).toBeNull();
    expect(newState.parentTodoId).toBe('todo-mother');
    expect(newState.layer).toBe(0); // matches source.layer, not source.layer + 1
    expect(newState.plannedMin).toBe(30);
    expect(newState.text).toBe('after');
  });

  it('propagates source.parentTaskId when source itself is a subtask', () => {
    useBoardStore
      .getState()
      .setBoard(makeBoardWithSource({ parentTaskIdOnSource: 'task-parent' }));
    const handler = makeCommandHandler('task-source');
    handler('task.addNext', { text: 'after', durationMin: 30 });

    const board = useBoardStore.getState().board!;
    const newTask = board.nodes.find(
      (n) => n.kind === 'todo.task' && n.id !== 'task-source',
    )!;
    expect((newTask.state as TaskState).parentTaskId).toBe('task-parent');
  });

  it('creates exactly one task.next edge from source to new task', () => {
    useBoardStore.getState().setBoard(makeBoardWithSource());
    const handler = makeCommandHandler('task-source');
    handler('task.addNext', { text: 'after', durationMin: 30 });

    const board = useBoardStore.getState().board!;
    const newTask = board.nodes.find(
      (n) => n.kind === 'todo.task' && n.id !== 'task-source',
    )!;

    const nextEdges = board.edges.filter(
      (e) => e.from.event === 'task.next' && e.to.nodeId === newTask.id,
    );
    expect(nextEdges).toHaveLength(1);
    expect(nextEdges[0]!.from.nodeId).toBe('task-source');
    expect(nextEdges[0]!.to.command).toBe('task.activate');
  });

  it('appends a TodoItem on the parent TodoNode linked to the new task', () => {
    useBoardStore.getState().setBoard(makeBoardWithSource());
    const handler = makeCommandHandler('task-source');
    handler('task.addNext', { text: 'after', durationMin: 30 });

    const board = useBoardStore.getState().board!;
    const todoNode = board.nodes.find((n) => n.id === 'todo-mother')!;
    const items = (todoNode.state as TodoState).items;
    expect(items).toHaveLength(2);
    const newTask = board.nodes.find(
      (n) => n.kind === 'todo.task' && n.id !== 'task-source',
    )!;
    expect(items[1]!.taskNodeId).toBe(newTask.id);
    expect(items[1]!.text).toBe('after');
    expect((newTask.state as TaskState).todoItemId).toBe(items[1]!.id);
  });

  it('positions the new task one card width to the right of source (same y)', () => {
    useBoardStore.getState().setBoard(makeBoardWithSource());
    const handler = makeCommandHandler('task-source');
    handler('task.addNext', { text: 'after', durationMin: 30 });

    const board = useBoardStore.getState().board!;
    const newTask = board.nodes.find(
      (n) => n.kind === 'todo.task' && n.id !== 'task-source',
    )!;
    expect(newTask.position.x).toBe(300 + 252);
    expect(newTask.position.y).toBe(420);
  });

  it('selectScheduledTasksForRange places the new task AFTER source when source is anchored', () => {
    useBoardStore
      .getState()
      .setBoard(makeBoardWithSource({ scheduledFor: '2026-05-20T10:00' }));
    const handler = makeCommandHandler('task-source');
    handler('task.addNext', { text: 'after', durationMin: 30 });

    const board = useBoardStore.getState().board!;
    const inRange = selectScheduledTasksForRange(
      board,
      '2026-05-20T00:00',
      '2026-05-21T00:00',
    );
    expect(inRange).toHaveLength(2);
    const source = inRange.find((p) => p.taskId === 'task-source')!;
    const newTask = board.nodes.find(
      (n) => n.kind === 'todo.task' && n.id !== 'task-source',
    )!;
    const next = inRange.find((p) => p.taskId === newTask.id)!;

    // Source: anchored at 10:00, 25min focus (1 session, no breaks) → ends 10:25.
    expect(source.startISO).toBe('2026-05-20T10:00');
    expect(source.endISO).toBe('2026-05-20T10:25');
    // Next: starts exactly when source ends.
    // #180: Todo creates EVENTS only — no break expansion. Next (event 30min)
    // runs 10:25–10:55 exactly.
    expect(next.startISO).toBe('2026-05-20T10:25');
    expect(next.endISO).toBe('2026-05-20T10:55');
  });

  it('no-op when text is empty / whitespace', () => {
    useBoardStore.getState().setBoard(makeBoardWithSource());
    const handler = makeCommandHandler('task-source');
    handler('task.addNext', { text: '   ' });

    const board = useBoardStore.getState().board!;
    const taskCount = board.nodes.filter((n) => n.kind === 'todo.task').length;
    expect(taskCount).toBe(1);
    expect(board.edges).toHaveLength(0);
  });
});
