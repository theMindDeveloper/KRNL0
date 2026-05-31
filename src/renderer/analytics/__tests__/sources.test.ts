import { describe, it, expect } from 'vitest';
import { taskSource } from '../sources/taskSource';
import { habitSource, calcHabitStreak } from '../sources/habitSource';
import { pomoSource } from '../sources/pomoSource';
import type { BoardLike } from '../types';

const makeBoard = (nodes: BoardLike['nodes']): BoardLike => ({ nodes });

describe('taskSource', () => {
  it('emits one event per completed task with completedAt', () => {
    const board = makeBoard([
      {
        id: 't1',
        kind: 'todo.task',
        state: { done: true, completedAt: '2026-05-10T09:00:00.000Z', text: 'a' },
      },
      {
        id: 't2',
        kind: 'todo.task',
        state: { done: false, text: 'b' },
      },
    ]);
    const events = taskSource.collect(board);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      source: 'task',
      type: 'task.completed',
      isoTimestamp: '2026-05-10T09:00:00.000Z',
    });
  });

  it('excludes legacy done:true rows without completedAt', () => {
    const board = makeBoard([
      { id: 't1', kind: 'todo.task', state: { done: true, text: 'legacy' } },
    ]);
    expect(taskSource.collect(board)).toEqual([]);
  });

  it('ignores non-task nodes', () => {
    const board = makeBoard([
      { id: 'p', kind: 'pomo', state: {} },
      { id: 'h', kind: 'habit', state: {} },
    ]);
    expect(taskSource.collect(board)).toEqual([]);
  });
});

describe('habitSource', () => {
  it('fans out the log per habit', () => {
    const board = makeBoard([
      {
        id: 'h',
        kind: 'habit',
        state: {
          habits: [
            { id: 'a', name: 'Run', log: ['2026-05-10', '2026-05-11'], archived: false },
            { id: 'b', name: 'Read', log: ['2026-05-11'], archived: false },
            { id: 'c', name: 'Hidden', log: ['2026-05-12'], archived: true },
          ],
        },
      },
    ]);
    const events = habitSource.collect(board);
    expect(events).toHaveLength(3);
    expect(events.every((e) => e.type === 'habit.checkin')).toBe(true);
    expect(events.filter((e) => e.date === '2026-05-11')).toHaveLength(2);
  });
});

describe('pomoSource', () => {
  it('emits pomo.work for every work span; pomo.session only for completed; pomo.break for breaks', () => {
    const board = makeBoard([
      {
        id: 'p',
        kind: 'pomo',
        state: {
          history: [
            // completed work span → pomo.work + pomo.session
            {
              id: '1',
              startedAt: '2026-05-10T09:00:00.000Z',
              endedAt: '2026-05-10T09:25:00.000Z',
              durationMin: 25,
              completed: true,
              kind: 'work',
              label: '',
            },
            // partial work span → pomo.work only
            {
              id: '2',
              startedAt: '2026-05-10T10:00:00.000Z',
              endedAt: '2026-05-10T10:05:00.000Z',
              durationMin: 5,
              completed: false,
              kind: 'work',
              label: '',
            },
            // break span → pomo.break only
            {
              id: '3',
              startedAt: '2026-05-10T09:25:00.000Z',
              endedAt: '2026-05-10T09:30:00.000Z',
              durationMin: 5,
              completed: false,
              kind: 'break',
              label: '',
            },
          ],
        },
      },
    ]);
    const events = pomoSource.collect(board);
    // completed work: pomo.work + pomo.session = 2
    // partial work: pomo.work = 1
    // break: pomo.break = 1
    expect(events).toHaveLength(4);
    const sessions = events.filter((e) => e.type === 'pomo.session');
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ source: 'pomo', durationMin: 25 });
    const work = events.filter((e) => e.type === 'pomo.work');
    expect(work).toHaveLength(2);
    const breaks = events.filter((e) => e.type === 'pomo.break');
    expect(breaks).toHaveLength(1);
    expect(breaks[0]).toMatchObject({ source: 'pomo', durationMin: 5 });
  });

  it('legacy records without kind field treated as work', () => {
    const board = makeBoard([
      {
        id: 'p',
        kind: 'pomo',
        state: {
          history: [
            { id: '1', endedAt: '2026-05-10T09:25:00.000Z', durationMin: 25, completed: true, label: '' },
          ],
        },
      },
    ]);
    const events = pomoSource.collect(board);
    expect(events.some((e) => e.type === 'pomo.session')).toBe(true);
    expect(events.some((e) => e.type === 'pomo.work')).toBe(true);
    expect(events.some((e) => e.type === 'pomo.break')).toBe(false);
  });
});

describe('calcHabitStreak', () => {
  it('counts consecutive days back from today', () => {
    expect(
      calcHabitStreak(
        ['2026-05-16', '2026-05-15', '2026-05-14', '2026-05-12'],
        '2026-05-16',
      ),
    ).toBe(3);
  });

  it('returns 0 when today is missing', () => {
    expect(calcHabitStreak(['2026-05-14'], '2026-05-16')).toBe(0);
  });
});
