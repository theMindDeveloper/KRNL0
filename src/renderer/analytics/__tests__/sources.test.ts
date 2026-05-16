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
  it('emits only completed sessions', () => {
    const board = makeBoard([
      {
        id: 'p',
        kind: 'pomo',
        state: {
          history: [
            {
              id: '1',
              startedAt: '2026-05-10T09:00:00.000Z',
              endedAt: '2026-05-10T09:25:00.000Z',
              durationMin: 25,
              completed: true,
              label: '',
            },
            {
              id: '2',
              startedAt: '2026-05-10T10:00:00.000Z',
              endedAt: '2026-05-10T10:05:00.000Z',
              durationMin: 5,
              completed: false,
              label: '',
            },
          ],
        },
      },
    ]);
    const events = pomoSource.collect(board);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      source: 'pomo',
      type: 'pomo.session',
      durationMin: 25,
    });
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
