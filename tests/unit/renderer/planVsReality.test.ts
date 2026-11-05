/**
 * Plan vs reality (#180 follow-up): the pomo is an observer. Tasks only TAG
 * what it records; tracked time per task is derived from tagged work spans.
 */
import { plannedTaskAt } from '../../../src/renderer/store/plannedNow';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import { makeCommandHandler } from '../../../src/renderer/components/Canvas/commandDispatch';
import { trackedSecondsByTask, planStatus } from '../../../src/renderer/store/trackedTime';
import type { Board } from '../../../src/shared/types';
import type { PomoState } from '../../../src/renderer/components/nodes/PomoNode/types';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';

const pad = (n: number) => String(n).padStart(2, '0');
const localISO = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

function pomoState(over: Partial<PomoState> = {}): PomoState {
  return {
    status: 'idle', startedAt: null, durationMin: 25, breakMin: 5, label: '',
    sessionsCompleted: 0, activeTaskId: null, history: [], pausedAt: null,
    pausedElapsedMs: 0, sessionWorkSec: 0, ...over,
  };
}

function task(id: string, extra: Partial<TaskState> = {}): Board['nodes'][number] {
  const state: TaskState = {
    text: `Task ${id}`, done: false, durationMin: 60, eta: '~60 min', sequenceNumber: 1, layer: 0,
    createdAt: '2026-11-01T08:00:00.000Z', parentTodoId: 'todo', parentTaskId: null,
    todoItemId: `item-${id}`, pomoSessionsCompleted: 0, plannedMin: 60, secondsAccumulated: 0,
    currentSessionElapsedSec: 0, kind: 'event', ...extra,
  };
  return { id, kind: 'todo.task', position: { x: 0, y: 0 }, isMother: false, state, config: {} };
}

function board(pomo: PomoState, tasks = [task('a'), task('b')]): Board {
  return {
    version: 1, schemaVersion: 2, savedAt: '', viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      { id: 'pomo', kind: 'pomo', position: { x: 0, y: 0 }, isMother: true, state: pomo,
        config: { sessionMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4 } },
      { id: 'todo', kind: 'todo', position: { x: 0, y: 0 }, isMother: true,
        state: { items: tasks.map((t) => ({ id: `item-${t.id}`, text: 'x', done: false, createdAt: '', completedAt: null, taskNodeId: t.id })) },
        config: {} },
      ...tasks,
    ],
    edges: [],
  };
}

const pomo = () => useBoardStore.getState().board!.nodes.find((n) => n.id === 'pomo')!.state as PomoState;
const taskState = (id: string) => useBoardStore.getState().board!.nodes.find((n) => n.id === id)!.state as TaskState;

beforeEach(() => {
  // @ts-expect-error — no Electron bridge in tests
  globalThis.window = globalThis.window ?? {};
  // @ts-expect-error
  globalThis.window.krnl = { boardSave: vi.fn().mockResolvedValue(undefined) };
});

afterEach(() => vi.useRealTimers());

describe('tasks tag the pomo, they never control it', () => {
  it('Start pomo on an idle pomo starts it tagged, at the configured session length', () => {
    useBoardStore.getState().setBoard(board(pomoState()));
    makeCommandHandler('a')('task.startPomo', {});
    expect(pomo().status).toBe('running');
    expect(pomo().activeTaskId).toBe('a');
    expect(pomo().durationMin).toBe(25);
    expect(pomo().label).toBe('Task a');
  });

  it('Start pomo from the todo row works for event tasks (it used to cancel the session)', () => {
    const started = new Date(Date.now() - 10 * 60_000).toISOString();
    useBoardStore.getState().setBoard(board(pomoState({ status: 'running', startedAt: started })));
    makeCommandHandler('todo')('todo.startPomoForItem', { itemId: 'item-b' });
    expect(pomo().status).toBe('running');
    expect(pomo().startedAt).toBe(started);
    expect(pomo().activeTaskId).toBe('b');
    expect(pomo().history).toHaveLength(0);
  });

  it('switching the tag mid-session keeps the timer running and records nothing', () => {
    const started = new Date(Date.now() - 5 * 60_000).toISOString();
    useBoardStore.getState().setBoard(board(pomoState({ status: 'running', startedAt: started, activeTaskId: 'a' })));
    makeCommandHandler('b')('task.startPomo', {});
    expect(pomo().startedAt).toBe(started);
    expect(pomo().activeTaskId).toBe('b');
  });

  it('never writes tracked time onto the task', () => {
    useBoardStore.getState().setBoard(board(pomoState()));
    makeCommandHandler('a')('task.startPomo', {});
    makeCommandHandler('pomo')('pomo.stop', {});
    expect(taskState('a').secondsAccumulated).toBe(0);
    expect(taskState('a').pomoSessionsCompleted).toBe(0);
  });

  it('pomo.tag with null clears the tag', () => {
    useBoardStore.getState().setBoard(board(pomoState({ activeTaskId: 'a', label: 'Task a' })));
    makeCommandHandler('pomo')('pomo.tag', { taskId: null });
    expect(pomo().activeTaskId).toBeNull();
    expect(pomo().label).toBe('');
  });
});

describe('starting the pomo suggests the task planned for now (never silently)', () => {
  it('starts untagged; plannedTaskAt names the open task whose block contains now', () => {
    const start = new Date(Date.now() - 15 * 60_000);
    useBoardStore.getState().setBoard(board(pomoState(), [
      task('a'),
      task('b', { scheduledFor: localISO(start), scheduledDurationMin: 60 }),
    ]));
    makeCommandHandler('pomo')('pomo.start', {});
    expect(pomo().status).toBe('running');
    expect(pomo().activeTaskId).toBeNull();
    expect(plannedTaskAt(useBoardStore.getState().board, Date.now())?.id).toBe('b');
  });

  it('accepting the suggestion tags the running session', () => {
    const start = new Date(Date.now() - 15 * 60_000);
    useBoardStore.getState().setBoard(board(pomoState(), [task('b', { scheduledFor: localISO(start), scheduledDurationMin: 60 })]));
    makeCommandHandler('pomo')('pomo.start', {});
    makeCommandHandler('pomo')('pomo.tag', { taskId: 'b' });
    expect(pomo().activeTaskId).toBe('b');
  });

  it('leaves the session untagged when nothing is planned now', () => {
    useBoardStore.getState().setBoard(board(pomoState()));
    makeCommandHandler('pomo')('pomo.start', {});
    expect(pomo().activeTaskId).toBeNull();
  });
});

describe('tracked time is derived from tagged spans', () => {
  const rec = (id: string, startMin: number, endMin: number, taskId: string | null, kind: 'work' | 'break' = 'work') => ({
    id, startedAt: new Date(Date.UTC(2026, 10, 1, 9, startMin)).toISOString(),
    endedAt: new Date(Date.UTC(2026, 10, 1, 9, endMin)).toISOString(),
    durationMin: endMin - startMin, label: '', completed: false, taskId, kind,
  });

  it('sums work spans per tag, ignoring breaks and untagged work', () => {
    const b = board(pomoState({ history: [rec('1', 0, 30, 'a'), rec('2', 30, 40, null, 'break'), rec('3', 40, 50, 'a'), rec('4', 50, 55, null)] }));
    const tracked = trackedSecondsByTask(b, Date.UTC(2026, 10, 1, 12));
    expect(tracked.get('a')).toBe(40 * 60);
    expect(tracked.size).toBe(1);
  });

  it('retagging a span moves its minutes to the other task', () => {
    useBoardStore.getState().setBoard(board(pomoState({ history: [rec('1', 0, 30, 'a')] })));
    makeCommandHandler('pomo')('pomo.retagSegment', { id: '1', taskId: 'b' });
    const tracked = trackedSecondsByTask(useBoardStore.getState().board, Date.now());
    expect(tracked.get('a')).toBeUndefined();
    expect(tracked.get('b')).toBe(30 * 60);
    expect(pomo().history[0]!.label).toBe('Task b');
  });

  it('counts the live span and the paused-but-unrecorded span', () => {
    const now = Date.UTC(2026, 10, 1, 10, 0);
    const running = board(pomoState({ status: 'running', startedAt: new Date(now - 20 * 60_000).toISOString(), activeTaskId: 'a' }));
    expect(trackedSecondsByTask(running, now).get('a')).toBe(20 * 60);
    const paused = board(pomoState({
      status: 'paused', activeTaskId: 'a', startedAt: new Date(now - 30 * 60_000).toISOString(),
      pausedAt: new Date(now - 10 * 60_000).toISOString(), pausedElapsedMs: 20 * 60_000,
    }));
    expect(trackedSecondsByTask(paused, now).get('a')).toBe(20 * 60);
  });

  it('overrun means more tracked than planned', () => {
    expect(planStatus(0, 60)).toBe('untracked');
    expect(planStatus(59 * 60, 60)).toBe('on-track');
    expect(planStatus(61 * 60, 60)).toBe('overrun');
  });
});
