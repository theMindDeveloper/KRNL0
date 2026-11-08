/** Analytics shows the same habit streak as the Habit node (rest days, weekly targets). */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildAnalytics } from '../engine';

afterEach(() => { vi.useRealTimers(); });

describe('analytics streaks = habitStreak', () => {
  it('a rest day keeps the run; a weekly target is in weeks and stays out of the day record', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 8, 10, 0)); // Sun 8 Nov 2026
    const board = {
      nodes: [{ id: 'h', kind: 'habit', isMother: true, state: { habits: [
        { id: 'read', name: 'Read', log: ['2026-11-04', '2026-11-05', '2026-11-07', '2026-11-08'], archived: false, rest: ['2026-11-06'] },
        { id: 'gym', name: 'Gym', log: ['2026-10-19', '2026-10-21', '2026-10-23', '2026-10-27', '2026-10-29', '2026-10-31', '2026-11-08'], archived: false, perWeek: 3 },
      ] } }],
      edges: [],
    };
    const s = buildAnalytics(board as never).streaks();
    expect(s.perHabit.find((p) => p.habitId === 'read')).toMatchObject({ streak: 4, unit: 'day' }) // the rest day is stepped over, not counted;
    expect(s.perHabit.find((p) => p.habitId === 'gym')).toMatchObject({ streak: 2, unit: 'week' });
    expect(s.longestHabitStreak).toBe(4);
  });
});
