/**
 * Decision 35 — renderer side of the durable time log (time-log F3).
 * Every board change made in the window goes through boardStore; the writer
 * subscription diffs it and appends via IPC `timelog:append` (mocked here).
 * Loads / CLI reloads are not logged; undo is.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import { makeCommandHandler } from '../../../src/renderer/components/Canvas/commandDispatch';
import { installTimeLogWriter, logTime, queryTimeLog } from '../../../src/renderer/store/timeLog';
import { defaultPomoState, type PomoState } from '../../../src/renderer/components/nodes/PomoNode/types';
import type { Board } from '../../../src/shared/types';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';
import type { TodoState } from '../../../src/renderer/components/nodes/TodoNode/types';
import type { TimeLogEntry } from '../../../src/shared/timelog';

const TODO = 'mother-todo';
const POMO = 'mother-pomo';
const TASK = 'task-math';

const SEG = (id: string, extra: Record<string, unknown> = {}) => ({
  id, startedAt: '2026-11-03T09:00:00.000Z', endedAt: '2026-11-03T09:30:00.000Z', durationMin: 30, label: 'Math', completed: false, taskId: TASK, kind: 'work' as const, ...extra,
});

function makeBoard(pomo: Partial<PomoState> = {}): Board {
  const taskState: TaskState = {
    text: 'Math', done: false, durationMin: 30, eta: '~30 min', sequenceNumber: 1, layer: 0,
    createdAt: '2026-11-01T08:00:00.000Z', parentTodoId: TODO, parentTaskId: null, todoItemId: 'item-math',
    pomoSessionsCompleted: 0, plannedMin: 30, secondsAccumulated: 0, currentSessionElapsedSec: 0, kind: 'event', tag: 'study',
  };
  const todoState = {
    items: [{ id: 'item-math', text: 'Math', done: false, createdAt: '2026-11-01T08:00:00.000Z', completedAt: null, taskNodeId: TASK }],
  } as unknown as TodoState;
  return {
    version: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    layoutMode: 'canvas',
    edges: [],
    nodes: [
      { id: TODO, kind: 'todo', position: { x: 0, y: 0 }, isMother: true, state: todoState, config: { showCompleted: true, maxVisible: 50 } },
      { id: TASK, kind: 'todo.task', position: { x: 0, y: 300 }, isMother: false, state: taskState, config: { showDuration: true } },
      { id: POMO, kind: 'pomo', position: { x: 400, y: 0 }, isMother: true, state: { ...defaultPomoState(), ...pomo }, config: { sessionMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4 } },
    ],
  } as unknown as Board;
}

let append: ReturnType<typeof vi.fn>;
let uninstall: () => void;

/** Every entry sent over IPC so far. */
const sent = (): TimeLogEntry[] => append.mock.calls.flatMap((c) => c[0] as TimeLogEntry[]);
const types = (): string[] => sent().map((e) => e.type);

beforeEach(() => {
  append = vi.fn().mockResolvedValue({ ok: true, written: 1 });
  // @ts-expect-error — node env has no window
  globalThis.window = globalThis.window ?? {};
  // @ts-expect-error — partial bridge
  globalThis.window.krnl = { boardSave: vi.fn().mockResolvedValue(undefined), timelogAppend: append };
  useBoardStore.setState({ board: null, history: [], future: [] });
  uninstall = installTimeLogWriter();
});
afterEach(() => uninstall());

const load = (b: Board): void => useBoardStore.getState().setBoard(b);
const taskCmd = makeCommandHandler(TASK);
const pomoCmd = makeCommandHandler(POMO);
const todoCmd = makeCommandHandler(TODO);

describe('renderer writers (F3)', () => {
  it('loading a board logs nothing', () => {
    load(makeBoard({ history: [SEG('s1')] }));
    expect(append).not.toHaveBeenCalled();
  });

  it('task.toggle → task.completed, again → task.reopened (one entry each, despite the todo mirror)', () => {
    load(makeBoard());
    taskCmd('task.toggle');
    expect(types()).toEqual(['task.completed']);
    expect(sent()[0]).toMatchObject({ v: 1, taskId: TASK, taskText: 'Math', tag: 'study', plannedMin: 30 });
    expect(typeof sent()[0]!.id).toBe('string');
    taskCmd('task.toggle');
    expect(types()).toEqual(['task.completed', 'task.reopened']);
  });

  it('task.edit → task.renamed', () => {
    load(makeBoard());
    taskCmd('task.edit', { text: 'Maths' });
    expect(sent()).toEqual([expect.objectContaining({ type: 'task.renamed', taskId: TASK, taskText: 'Maths' })]);
  });

  it('task.setSchedule → plan.set (move → plan.set), unschedule → plan.cleared', () => {
    load(makeBoard());
    taskCmd('task.setSchedule', { scheduledFor: '2026-11-09T10:00', scheduledDurationMin: 45 });
    taskCmd('task.setSchedule', { scheduledFor: '2026-11-11T10:00', scheduledDurationMin: 45 });
    taskCmd('task.setSchedule', { scheduledFor: null });
    expect(types()).toEqual(['plan.set', 'plan.set', 'plan.cleared']);
    expect(sent()[0]).toMatchObject({ start: '2026-11-09T10:00', durationMin: 45, taskText: 'Math' });
  });

  it('todo.add → task.created', () => {
    load(makeBoard());
    todoCmd('todo.add', { text: 'Physics' });
    expect(sent()).toEqual([expect.objectContaining({ type: 'task.created', taskText: 'Physics' })]);
  });

  it('pomo.stop records the running span → span.closed with the task snapshot', () => {
    load(makeBoard({ status: 'running', startedAt: new Date(Date.now() - 30 * 60_000).toISOString(), activeTaskId: TASK, label: 'Math' }));
    pomoCmd('pomo.stop');
    expect(sent()).toEqual([expect.objectContaining({ type: 'span.closed', taskId: TASK, taskText: 'Math', tag: 'study', kind: 'work' })]);
  });

  it('pomo.retagSegment → span.retagged; pomo.deleteSegment → span.deleted; undo → span.closed again', () => {
    load(makeBoard({ history: [SEG('s1'), SEG('s2')] }));
    pomoCmd('pomo.retagSegment', { id: 's1', label: 'emails', tag: 'admin' });
    expect(sent()[0]).toMatchObject({ type: 'span.retagged', spanId: 's1', taskId: null, taskText: 'emails', tag: 'admin' });
    pomoCmd('pomo.deleteSegment', { id: 's2' });
    expect(sent()[1]).toMatchObject({ type: 'span.deleted', spanId: 's2' });
    // Both commands ran in one tick, so they share one undo step: undo
    // reverses both, and the log records both reversals.
    useBoardStore.getState().undo();
    expect(sent().slice(2)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'span.closed', spanId: 's2' }),
      expect.objectContaining({ type: 'span.retagged', spanId: 's1', taskId: TASK, taskText: 'Math' }),
    ]));
  });

  it('a span start/end change → span.edited', () => {
    load(makeBoard({ history: [SEG('s1')] }));
    const pomo = useBoardStore.getState().board!.nodes.find((n) => n.id === POMO)!;
    const ps = pomo.state as PomoState;
    useBoardStore.getState().updateNode(POMO, { state: { ...ps, history: [{ ...ps.history[0]!, endedAt: '2026-11-03T09:10:00.000Z' }] } });
    expect(sent()).toEqual([expect.objectContaining({ type: 'span.edited', spanId: 's1', endedAt: '2026-11-03T09:10:00.000Z' })]);
  });

  it('a reload after a CLI write is not logged again (main logged it)', () => {
    load(makeBoard());
    const fromDisk = makeBoard({ history: [SEG('cli-span')] });
    useBoardStore.getState().reloadBoard(fromDisk);
    expect(append).not.toHaveBeenCalled();
  });

  it('a failing bridge never breaks the action', () => {
    append.mockRejectedValue(new Error('main gone'));
    load(makeBoard());
    expect(() => taskCmd('task.toggle')).not.toThrow();
    expect((useBoardStore.getState().board!.nodes.find((n) => n.id === TASK)!.state as TaskState).done).toBe(true);
  });
});

describe('logTime / queryTimeLog', () => {
  it('logTime stamps id/at and is a no-op without the bridge', () => {
    logTime({ type: 'span.deleted', spanId: 'x' });
    expect(sent()[0]).toMatchObject({ v: 1, type: 'span.deleted', spanId: 'x' });
    expect(Number.isFinite(Date.parse(sent()[0]!.at))).toBe(true);
    // @ts-expect-error — bridge gone
    globalThis.window.krnl = undefined;
    expect(() => logTime({ type: 'span.deleted', spanId: 'y' })).not.toThrow();
  });

  it('queryTimeLog validates what main returns and never rejects', async () => {
    const good = { v: 1, id: 'a', at: '2026-11-05T10:00:00.000Z', type: 'span.deleted', spanId: 's' };
    // @ts-expect-error — partial bridge
    globalThis.window.krnl = { timelogQuery: vi.fn().mockResolvedValue([good, { junk: true }]) };
    expect(await queryTimeLog('2026-11-01', '2026-11-30')).toEqual([good]);
    // @ts-expect-error — partial bridge
    globalThis.window.krnl = { timelogQuery: vi.fn().mockRejectedValue(new Error('x')) };
    expect(await queryTimeLog('2026-11-01', '2026-11-30')).toEqual([]);
    expect(await queryTimeLog('nope', '2026-11-30')).toEqual([]);
  });
});
