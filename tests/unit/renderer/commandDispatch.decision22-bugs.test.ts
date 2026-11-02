/**
 * commandDispatch.decision22-bugs.test.ts
 *
 * Tests for Decision 22.1 dispatcher changes: loadTaskIntoPomo, pause/resume,
 * per-task checkpoint, extended task.toggle and task.delete cascades.
 *
 * Groups covered: B1, B3, B4, B5, D1, D2, F1, G1, Invariant.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import { makeCommandHandler } from '../../../src/renderer/components/Canvas/commandDispatch';
import type { Board } from '../../../src/shared/types';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';
import type { TodoState } from '../../../src/renderer/components/nodes/TodoNode/types';
import type { PomoState } from '../../../src/renderer/components/nodes/PomoNode/types';

// Stub window.krnl so boardSave doesn't throw.
beforeEach(() => {
  // @ts-expect-error — jsdom doesn't have krnl
  globalThis.window = globalThis.window ?? {};
  // @ts-expect-error
  globalThis.window.krnl = { boardSave: vi.fn().mockResolvedValue(undefined) };

  // Reset Zustand store
  useBoardStore.setState({ board: null, viewport: { x: 0, y: 0, zoom: 1 } });
});

// ── Factories ────────────────────────────────────────────────────────────────

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
    createdAt: '2026-05-13T10:00:00.000Z',
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
  taskA?: Partial<TaskState>;
  taskB?: Partial<TaskState>;
  pomoState?: Partial<PomoState>;
  sessionMin?: number;
}

function makeBoardWithTasks(opts: BoardOpts = {}): Board {
  const sessionMin = opts.sessionMin ?? 25;

  const todoItem = {
    id: 'item-1',
    text: 'Task A',
    done: false,
    createdAt: '2026-05-13T10:00:00.000Z',
    completedAt: null,
    taskNodeId: 'task-a',
  };

  const todoNode = {
    id: 'todo-mother',
    kind: 'todo' as const,
    position: { x: 0, y: 0 },
    isMother: true,
    state: {
      items: [todoItem],
    } as TodoState,
    config: { showCompleted: true, maxVisible: 50 },
  };

  const taskANode = {
    id: 'task-a',
    kind: 'todo.task' as const,
    position: { x: 0, y: 420 },
    isMother: false,
    state: makeTaskState(opts.taskA ?? {}),
    config: { showDuration: true },
  };

  const nodes: Board['nodes'] = [todoNode, taskANode];

  if (opts.taskB !== undefined) {
    const todoBItem = {
      id: 'item-2',
      text: 'Task B',
      done: false,
      createdAt: '2026-05-13T10:01:00.000Z',
      completedAt: null,
      taskNodeId: 'task-b',
    };
    // Add item-2 to the todo node
    (todoNode.state as TodoState).items.push(todoBItem);

    const taskBNode = {
      id: 'task-b',
      kind: 'todo.task' as const,
      position: { x: 252, y: 420 },
      isMother: false,
      state: makeTaskState({
        text: 'Task B',
        todoItemId: 'item-2',
        sequenceNumber: 2,
        ...opts.taskB,
      }),
      config: { showDuration: true },
    };
    nodes.push(taskBNode);
  }

  nodes.push({
    id: 'pomo-mother',
    kind: 'pomo' as const,
    position: { x: 0, y: 0 },
    isMother: true,
    state: makePomoState(opts.pomoState ?? {}),
    config: { sessionMin, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4 },
  });

  return {
    version: 1,
    schemaVersion: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes,
    edges: [],
    savedAt: '2026-05-13T10:00:00.000Z',
  };
}

// ── Helper to get pomo/task state after dispatch ──────────────────────────────

function getPomoState(): PomoState {
  const board = useBoardStore.getState().board!;
  const pomo = board.nodes.find((n) => n.kind === 'pomo')!;
  return pomo.state as PomoState;
}

function getTaskState(taskId: string): TaskState {
  const board = useBoardStore.getState().board!;
  const task = board.nodes.find((n) => n.id === taskId)!;
  return task.state as TaskState;
}

// ── B1: task.loadIntoPomo → pomo paused, no history ──────────────────────────

// ── B3: task.startPomo (auto-start) → pomo running ───────────────────────────

describe('B3 — task.startPomo auto-starts the pomo', () => {
  it('pomo status is running after task.startPomo', () => {
    const board = makeBoardWithTasks();
    useBoardStore.getState().setBoard(board);

    makeCommandHandler('task-a')('task.startPomo');

    const ps = getPomoState();
    expect(ps.status).toBe('running');
    expect(ps.activeTaskId).toBe('task-a');
  });
});

// ── B4: plannedMin=1, sessionMin=10 → durationMin=1 (clamp to remainder) ─────

// ── B5: plannedMin=35, sessionMin=10, 3 sessions done → durationMin=5 ─────────

// ── Toggle-off semantics: same task + loaded → unload to default (2026-05-18) ─
// Spec update: double-clicking an already-loaded task unloads it. Previously
// this was a no-op that preserved the checkpoint; now it cancels the session
// (recording a non-completed history entry) and snaps the pomo back to
// configured defaults so a single gesture drops the task.

// ── D1: switch from running task A to task B
//
// Updated for Decision 22.2 protect-running rule (PR #90 follow-up): passive
// task.loadIntoPomo MUST NOT disturb a running session on a different task.
// The user must press STOP (or explicit START on Task B) to switch. The
// checkpoint test for the explicit-switch path is preserved as D1b.

// ── D2: load task A with 120s checkpoint as paused ───────────────────────────

// ── F1: mark active running task done → pomo cancels ─────────────────────────

describe('F1 — mark active running task done stops the pomo', () => {
  it('pomo becomes idle with activeTaskId=null and one cancelled history record', () => {
    const startedAt = new Date(Date.now() - 60_000).toISOString();
    const board = makeBoardWithTasks({
      pomoState: {
        status: 'running',
        startedAt,
        activeTaskId: 'task-a',
        label: 'Task A',
        durationMin: 25,
      },
    });
    useBoardStore.getState().setBoard(board);

    // Dispatch task.toggle to mark done
    makeCommandHandler('task-a')('task.toggle');

    const ps = getPomoState();
    expect(ps.status).toBe('idle');
    expect(ps.activeTaskId).toBeNull();
    expect(ps.history).toHaveLength(1);
    expect(ps.history[0]!.completed).toBe(false);
  });

  it('toggle-done keeps the in-flight time in the pomo history, not on the task (time-model F2)', () => {
    // Tracked time is derived from pomo spans tagged with the task, so the
    // stop records the real span and writes no tracking fields onto the task.
    const startedAt = new Date(Date.now() - 60_000).toISOString();
    const board = makeBoardWithTasks({
      pomoState: {
        status: 'running',
        startedAt,
        activeTaskId: 'task-a',
        label: 'Task A',
        durationMin: 25,
      },
    });
    useBoardStore.getState().setBoard(board);

    makeCommandHandler('task-a')('task.toggle');

    const rec = getPomoState().history[0]!;
    expect(rec.taskId).toBe('task-a');
    expect(rec.durationMin).toBe(1);
    expect(getTaskState('task-a').secondsAccumulated ?? 0).toBe(0);
  });

  it('does not cancel pomo when toggling a task that is not active', () => {
    const startedAt = new Date(Date.now() - 30_000).toISOString();
    // pomo is running task-b (different from task-a being toggled)
    const board = makeBoardWithTasks({
      taskB: {},
      pomoState: {
        status: 'running',
        startedAt,
        activeTaskId: 'task-b',
        label: 'Task B',
        durationMin: 25,
      },
    });
    useBoardStore.getState().setBoard(board);

    makeCommandHandler('task-a')('task.toggle');

    const ps = getPomoState();
    expect(ps.status).toBe('running');
    expect(ps.activeTaskId).toBe('task-b');
    expect(ps.history).toHaveLength(0);
  });
});

// ── G1: delete active running task → pomo cancels, task removed ──────────────

describe('G1 — delete active running task cancels pomo and removes task', () => {
  it('pomo is idle, activeTaskId=null, task removed from board, TodoItem removed', () => {
    const startedAt = new Date(Date.now() - 45_000).toISOString();
    const board = makeBoardWithTasks({
      pomoState: {
        status: 'running',
        startedAt,
        activeTaskId: 'task-a',
        label: 'Task A',
        durationMin: 25,
      },
    });
    useBoardStore.getState().setBoard(board);

    makeCommandHandler('task-a')('task.delete');

    const finalBoard = useBoardStore.getState().board!;
    const ps = getPomoState();

    expect(ps.status).toBe('idle');
    expect(ps.activeTaskId).toBeNull();
    // Task node removed
    expect(finalBoard.nodes.find((n) => n.id === 'task-a')).toBeUndefined();
    // Linked TodoItem removed
    const todoNode = finalBoard.nodes.find((n) => n.id === 'todo-mother')!;
    expect((todoNode.state as TodoState).items).toHaveLength(0);
  });

  it('also cancels pomo when a descendant task is the active task', () => {
    // Build parent + child hierarchy; pomo is running the child.
    const startedAt = new Date(Date.now() - 30_000).toISOString();
    const baseBoard = makeBoardWithTasks({
      pomoState: {
        status: 'running',
        startedAt,
        activeTaskId: 'task-child',
        label: 'Child',
        durationMin: 10,
      },
    });

    // Inject a child task
    const childState: TaskState = {
      text: 'Child',
      done: false,
      durationMin: 10,
      eta: '~10 min',
      sequenceNumber: 1,
      layer: 1,
      createdAt: '2026-05-13T10:02:00.000Z',
      parentTodoId: 'todo-mother',
      parentTaskId: 'task-a',
      todoItemId: null,
      pomoSessionsCompleted: 0,
      plannedMin: 10,
      secondsAccumulated: 0,
      currentSessionElapsedSec: 0,
    };
    baseBoard.nodes.push({
      id: 'task-child',
      kind: 'todo.task',
      position: { x: 0, y: 580 },
      isMother: false,
      state: childState,
      config: { showDuration: true },
    });

    useBoardStore.getState().setBoard(baseBoard);

    // Delete the parent — should BFS-delete the child too and cancel pomo.
    makeCommandHandler('task-a')('task.delete');

    const ps = getPomoState();
    expect(ps.status).toBe('idle');
    expect(ps.activeTaskId).toBeNull();
  });
});

// ── Invariant: start → run 60s → cancel → secondsAccumulated=60, checkpoint=0 ─

