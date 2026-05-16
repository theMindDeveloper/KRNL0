/**
 * Decision 28 §10 item 6 — task.toggleKind dispatcher tests.
 *
 * Tests:
 *   - Toggle a non-active focus task → event: pomoCancel NOT called (pomo unchanged).
 *   - Toggle an active running focus task → event: pomo cancelled (idle), pomoSessionsCompleted preserved.
 *   - Toggle a focus task → event: kind becomes 'event'.
 *   - Toggle an event task → focus: kind becomes 'focus'.
 *   - Toggle active paused task → event: pomo cancelled.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import { makeCommandHandler } from '../../../src/renderer/components/Canvas/commandDispatch';
import type { Board } from '../../../src/shared/types';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';
import type { PomoState } from '../../../src/renderer/components/nodes/PomoNode/types';

// Stub window.krnl so boardSave doesn't throw.
beforeEach(() => {
  // @ts-expect-error — jsdom doesn't have krnl
  globalThis.window = globalThis.window ?? {};
  // @ts-expect-error
  globalThis.window.krnl = { boardSave: vi.fn().mockResolvedValue(undefined) };

  useBoardStore.setState({ board: null, viewport: { x: 0, y: 0, zoom: 1 } });
});

// ── Factories ─────────────────────────────────────────────────────────────────

function makePomoState(overrides: Partial<PomoState> = {}): PomoState {
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
    ...overrides,
  };
}

function makeTaskState(overrides: Partial<TaskState> = {}): TaskState {
  return {
    text: 'Task A',
    done: false,
    durationMin: 25,
    eta: '~25 min',
    sequenceNumber: 1,
    layer: 0,
    createdAt: '2026-05-16T10:00:00.000Z',
    parentTodoId: 'todo-mother',
    parentTaskId: null,
    todoItemId: 'item-1',
    pomoSessionsCompleted: 0,
    plannedMin: 25,
    secondsAccumulated: 0,
    currentSessionElapsedSec: 0,
    kind: 'focus',
    ...overrides,
  };
}

interface BoardOpts {
  taskState?: Partial<TaskState>;
  pomoState?: Partial<PomoState>;
}

function makeBoard(opts: BoardOpts = {}): Board {
  return {
    version: 1,
    schemaVersion: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    savedAt: '2026-05-16T10:00:00.000Z',
    nodes: [
      {
        id: 'todo-mother',
        kind: 'todo',
        position: { x: -840, y: 0 },
        isMother: true,
        state: {
          items: [
            {
              id: 'item-1',
              text: 'Task A',
              done: false,
              createdAt: '2026-05-16T10:00:00.000Z',
              completedAt: null,
              taskNodeId: 'task-a',
            },
          ],
        },
        config: { showCompleted: true, maxVisible: 50 },
      },
      {
        id: 'task-a',
        kind: 'todo.task',
        position: { x: 0, y: 420 },
        isMother: false,
        state: makeTaskState(opts.taskState ?? {}),
        config: { showDuration: true },
      },
      {
        id: 'pomo-mother',
        kind: 'pomo',
        position: { x: -1400, y: 0 },
        isMother: true,
        state: makePomoState(opts.pomoState ?? {}),
        config: { sessionMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4 },
      },
    ],
    edges: [],
  };
}

function getPomoState(): PomoState {
  const board = useBoardStore.getState().board!;
  const pomo = board.nodes.find((n) => n.kind === 'pomo')!;
  return pomo.state as PomoState;
}

function getTaskState(): TaskState {
  const board = useBoardStore.getState().board!;
  const task = board.nodes.find((n) => n.id === 'task-a')!;
  return task.state as TaskState;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('task.toggleKind — non-active task', () => {
  it('toggles a non-active focus task to event without touching the pomo', () => {
    const board = makeBoard({
      taskState: { kind: 'focus', pomoSessionsCompleted: 2 },
      pomoState: { status: 'idle', activeTaskId: null },
    });
    useBoardStore.getState().setBoard(board);

    const handler = makeCommandHandler('task-a');
    handler('task.toggleKind');

    const ts = getTaskState();
    expect(ts.kind).toBe('event');

    const ps = getPomoState();
    // Pomo was idle with no active task — it should remain unchanged
    expect(ps.status).toBe('idle');
    expect(ps.activeTaskId).toBeNull();
    expect(ps.history).toHaveLength(0);
  });

  it('toggles a non-active focus task to event — pomoSessionsCompleted preserved', () => {
    const board = makeBoard({
      taskState: { kind: 'focus', pomoSessionsCompleted: 3 },
      pomoState: { status: 'idle', activeTaskId: 'other-task' },
    });
    useBoardStore.getState().setBoard(board);

    const handler = makeCommandHandler('task-a');
    handler('task.toggleKind');

    const ts = getTaskState();
    expect(ts.kind).toBe('event');
    expect(ts.pomoSessionsCompleted).toBe(3);
  });

  it('toggles an event task back to focus', () => {
    const board = makeBoard({
      taskState: { kind: 'event' },
      pomoState: { status: 'idle', activeTaskId: null },
    });
    useBoardStore.getState().setBoard(board);

    const handler = makeCommandHandler('task-a');
    handler('task.toggleKind');

    const ts = getTaskState();
    expect(ts.kind).toBe('focus');
  });
});

describe('task.toggleKind — active running task (clean handoff)', () => {
  it('cancels the pomo when toggling the active running task to event', () => {
    const board = makeBoard({
      taskState: { kind: 'focus', pomoSessionsCompleted: 1 },
      pomoState: {
        status: 'running',
        activeTaskId: 'task-a',
        startedAt: new Date(Date.now() - 30_000).toISOString(), // started 30s ago
        durationMin: 25,
      },
    });
    useBoardStore.getState().setBoard(board);

    const handler = makeCommandHandler('task-a');
    handler('task.toggleKind');

    const ps = getPomoState();
    expect(ps.status).toBe('idle');
    expect(ps.activeTaskId).toBeNull();
    // pomoCancel records a history entry (completed: false)
    expect(ps.history).toHaveLength(1);
    expect(ps.history[0]!.completed).toBe(false);
  });

  it('preserves pomoSessionsCompleted after cancelling pomo on toggleKind', () => {
    const board = makeBoard({
      taskState: { kind: 'focus', pomoSessionsCompleted: 2 },
      pomoState: {
        status: 'running',
        activeTaskId: 'task-a',
        startedAt: new Date(Date.now() - 60_000).toISOString(),
        durationMin: 25,
      },
    });
    useBoardStore.getState().setBoard(board);

    const handler = makeCommandHandler('task-a');
    handler('task.toggleKind');

    const ts = getTaskState();
    expect(ts.kind).toBe('event');
    // pomoSessionsCompleted MUST be preserved — toggling back to focus must resume from here
    expect(ts.pomoSessionsCompleted).toBe(2);
  });

  it('cancels the pomo when toggling the active paused task to event', () => {
    const board = makeBoard({
      taskState: { kind: 'focus', pomoSessionsCompleted: 0 },
      pomoState: {
        status: 'paused',
        activeTaskId: 'task-a',
        startedAt: new Date(Date.now() - 120_000).toISOString(),
        pausedAt: new Date(Date.now() - 10_000).toISOString(),
        pausedElapsedMs: 110_000,
        durationMin: 25,
      },
    });
    useBoardStore.getState().setBoard(board);

    const handler = makeCommandHandler('task-a');
    handler('task.toggleKind');

    const ps = getPomoState();
    expect(ps.status).toBe('idle');
    expect(ps.activeTaskId).toBeNull();
  });

  it('does NOT cancel the pomo when toggling a DIFFERENT (non-active) task to event', () => {
    const board = makeBoard({
      taskState: { kind: 'focus' },
      pomoState: {
        status: 'running',
        activeTaskId: 'other-task-xyz', // different task is active
        startedAt: new Date(Date.now() - 60_000).toISOString(),
        durationMin: 25,
      },
    });
    useBoardStore.getState().setBoard(board);

    const handler = makeCommandHandler('task-a');
    handler('task.toggleKind');

    const ps = getPomoState();
    // Pomo should still be running on the other task
    expect(ps.status).toBe('running');
    expect(ps.activeTaskId).toBe('other-task-xyz');
    expect(ps.history).toHaveLength(0);

    const ts = getTaskState();
    expect(ts.kind).toBe('event');
  });
});
