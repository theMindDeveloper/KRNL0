import { describe, it, expect } from 'vitest';
import { computeEstimates, describeAccuracy } from '../../../src/renderer/analytics/estimates';
import type { Board } from '../../../src/shared/types';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();
const range = { start: '2026-10-26', end: '2026-11-01' };
const NOW = new Date(2026, 10, 1, 20, 0).getTime();

function task(id: string, plannedMin: number, extra: Partial<TaskState> = {}) {
  const state: TaskState = {
    text: id, done: false, durationMin: plannedMin, eta: '', sequenceNumber: 1, layer: 0,
    createdAt: '', parentTodoId: 'todo', parentTaskId: null, todoItemId: null,
    pomoSessionsCompleted: 0, plannedMin, secondsAccumulated: 0, currentSessionElapsedSec: 0,
    kind: 'event', ...extra,
  };
  return { id, kind: 'todo.task', position: { x: 0, y: 0 }, isMother: false, state, config: {} };
}

const span = (id: string, s: string, e: string, taskId: string | null, kind: 'work' | 'break' = 'work') => ({
  id, startedAt: s, endedAt: e, durationMin: 0, label: taskId ?? '', completed: false, taskId, kind,
});

function board(): Board {
  return {
    version: 1, schemaVersion: 2, savedAt: '', viewport: { x: 0, y: 0, zoom: 1 }, edges: [],
    completions: [{ taskId: 'gone', text: 'Old essay', plannedMin: 60, completedAt: at(30, 18) }],
    nodes: [
      { id: 'pomo', kind: 'pomo', position: { x: 0, y: 0 }, isMother: true, config: {},
        state: { status: 'idle', startedAt: null, durationMin: 25, breakMin: 5, label: '', sessionsCompleted: 0,
          activeTaskId: null, pausedAt: null, pausedElapsedMs: 0, sessionWorkSec: 0,
          history: [
            span('1', at(27, 9), at(27, 10, 30), 'math'),          // 90m on a 60m task
            span('2', at(27, 10, 30), at(27, 10, 45), null, 'break'),
            span('3', at(28, 14), at(28, 14, 30), 'read'),          // 30m on a 60m task
            span('4', at(28, 15), at(28, 15, 20), null),            // untagged work
            span('5', at(30, 16), at(30, 17, 30), 'gone'),          // 90m on a deleted 60m task
          ] } },
      task('math', 60, { done: true, scheduledFor: '2026-10-27T09:00', scheduledDurationMin: 60 }),
      task('read', 60, { done: true }),
      task('idle', 45),
    ],
  } as unknown as Board;
}

describe('computeEstimates', () => {
  const r = computeEstimates(board(), range, NOW);

  it('compares each active task estimate with its tagged work, including deleted tasks', () => {
    const byId = new Map(r.tasks.map((t) => [t.taskId, t]));
    expect(byId.get('math')).toMatchObject({ plannedMin: 60, trackedMin: 90, done: true, deleted: false });
    expect(byId.get('read')).toMatchObject({ plannedMin: 60, trackedMin: 30 });
    expect(byId.get('gone')).toMatchObject({ text: 'Old essay', plannedMin: 60, trackedMin: 90, deleted: true });
    expect(byId.has('idle')).toBe(false); // no activity in range
  });

  it('KPIs: median ratio over finished tasks, over/under counts, tagged share', () => {
    // ratios: math 1.5, read 0.5, gone 1.5 → median 1.5
    expect(r.kpis.medianRatio).toBeCloseTo(1.5);
    expect(r.kpis.overCount).toBe(2);
    expect(r.kpis.underCount).toBe(1);
    expect(r.kpis.taggedShare).toBeCloseTo(210 / 230);
  });

  it('per day: planned block minutes vs worked minutes', () => {
    const d27 = r.days.find((d) => d.date === '2026-10-27')!;
    expect(d27).toEqual({ date: '2026-10-27', plannedMin: 60, workedMin: 90 });
    expect(r.days.find((d) => d.date === '2026-10-28')!.workedMin).toBe(50);
    expect(r.days).toHaveLength(7);
  });

  it('mix splits tagged work, untagged work and breaks', () => {
    expect(r.mix).toEqual({ taggedWorkMin: 210, untaggedWorkMin: 20, breakMin: 15 });
  });

  it('describes accuracy in plain words', () => {
    expect(describeAccuracy(1.5)).toBe('tasks take ×1.5 your estimate');
    expect(describeAccuracy(1.0)).toBe('your estimates are on target');
    expect(describeAccuracy(0.5)).toBe('tasks take 50% of your estimate');
    expect(describeAccuracy(null)).toMatch(/not enough/);
  });
});
