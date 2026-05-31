import { describe, it, expect, beforeEach } from 'vitest';
import { buildAnalytics } from '../engine';
import {
  clearDataSources,
  registerDataSource,
} from '../registry';
import { taskSource } from '../sources/taskSource';
import { habitSource } from '../sources/habitSource';
import { pomoSource } from '../sources/pomoSource';
import type { BoardLike } from '../types';

const board: BoardLike = {
  nodes: [
    {
      id: 't1',
      kind: 'todo.task',
      state: { done: true, completedAt: '2026-05-10T09:00:00.000Z', text: 'a' },
    },
    {
      id: 't2',
      kind: 'todo.task',
      state: { done: true, completedAt: '2026-05-11T16:30:00.000Z', text: 'b' },
    },
    {
      id: 't3',
      kind: 'todo.task',
      state: { done: false, text: 'c' },
    },
    {
      id: 'p',
      kind: 'pomo',
      state: {
        history: [
          {
            id: '1',
            startedAt: '2026-05-10T08:00:00.000Z',
            endedAt: '2026-05-10T08:25:00.000Z',
            durationMin: 25,
            completed: true,
            label: '',
          },
        ],
      },
    },
    {
      id: 'h',
      kind: 'habit',
      state: {
        habits: [
          { id: 'a', name: 'Run', log: ['2026-05-10', '2026-05-11'], archived: false },
        ],
      },
    },
  ],
};

describe('analytics engine', () => {
  beforeEach(() => {
    clearDataSources();
    registerDataSource(taskSource);
    registerDataSource(habitSource);
    registerDataSource(pomoSource);
  });

  it('merges all sources into the event stream', () => {
    const a = buildAnalytics(board);
    const events = a.events();
    expect(events.filter((e) => e.source === 'task')).toHaveLength(2);
    expect(events.filter((e) => e.source === 'habit')).toHaveLength(2);
    // Issue #166: completed work span emits pomo.work + pomo.session = 2 events
    expect(events.filter((e) => e.source === 'pomo')).toHaveLength(2);
  });

  it('returns stable references across repeated calls with the same range', () => {
    const a = buildAnalytics(board);
    const r = { start: '2026-05-10', end: '2026-05-11' };
    expect(a.byDay(r)).toBe(a.byDay(r));
    expect(a.totals(r)).toBe(a.totals(r));
    expect(a.byDayOfWeek(r)).toBe(a.byDayOfWeek(r));
  });

  it('computes open counters', () => {
    const a = buildAnalytics(board);
    const open = a.open();
    expect(open.tasksTotal).toBe(3);
    expect(open.tasksOpen).toBe(1);
  });

  it('skips unknown source errors without crashing', () => {
    registerDataSource({
      id: 'boom',
      label: 'boom',
      collect() {
        throw new Error('exploded');
      },
    });
    const a = buildAnalytics(board);
    expect(() => a.events()).not.toThrow();
  });

  it('byDay returns zero-filled buckets for an empty range', () => {
    const a = buildAnalytics({ nodes: [] });
    const out = a.byDay({ start: '2026-05-10', end: '2026-05-12' });
    expect(out).toHaveLength(3);
    expect(out.every((d) => d.taskCount === 0)).toBe(true);
  });

  it('byMonth scopes to the requested year', () => {
    const a = buildAnalytics(board);
    const out = a.byMonth(2026);
    expect(out).toHaveLength(12);
    expect(out[4]?.tasks).toBeGreaterThan(0); // May (month 5, index 4)
  });
});
