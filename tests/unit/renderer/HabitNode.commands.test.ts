import { describe, it, expect } from 'vitest';
import {
  habitAdd,
  habitToggleDay,
  habitMarkDone,
  habitRename,
  habitArchive,
  habitRemove,
  calcStreak,
  type HabitEnv,
} from '../../../src/renderer/components/nodes/HabitNode/commands';
import {
  defaultHabitState,
  getMondayOf,
  getWeekDays,
  toYMD,
  prevDay,
} from '../../../src/renderer/components/nodes/HabitNode/types';
import type { HabitState } from '../../../src/renderer/components/nodes/HabitNode/types';

// Deterministic environment for tests.
const env = (today: string, uuid = 'test-uuid', now = `${today}T10:00:00.000Z`): HabitEnv => ({
  uuid: () => uuid,
  now: () => now,
  today: () => today,
});

// Seed a state with one habit.
function stateWithHabit(name = 'Exercise', log: string[] = []): HabitState {
  const base = defaultHabitState();
  return habitAdd(base, { name }, env('2026-05-11', 'h1'));
}

describe('HabitNode — types helpers (Decision #11)', () => {
  describe('getMondayOf', () => {
    it('returns the same day when given a Monday', () => {
      // 2026-05-11 is a Monday
      const d = new Date('2026-05-11T10:00:00');
      expect(toYMD(getMondayOf(d))).toBe('2026-05-11');
    });

    it('rolls back from Sunday to the preceding Monday', () => {
      // 2026-05-17 is a Sunday
      const d = new Date('2026-05-17T10:00:00');
      expect(toYMD(getMondayOf(d))).toBe('2026-05-11');
    });

    it('rolls back from Saturday to the preceding Monday', () => {
      // 2026-05-16 is a Saturday
      const d = new Date('2026-05-16T10:00:00');
      expect(toYMD(getMondayOf(d))).toBe('2026-05-11');
    });

    it('rolls back from Wednesday to the preceding Monday', () => {
      // 2026-05-13 is a Wednesday
      const d = new Date('2026-05-13T14:30:00');
      expect(toYMD(getMondayOf(d))).toBe('2026-05-11');
    });

    it('handles a different week correctly', () => {
      // 2026-05-20 is a Wednesday; Monday of that week is 2026-05-18
      const d = new Date('2026-05-20T09:00:00');
      expect(toYMD(getMondayOf(d))).toBe('2026-05-18');
    });
  });

  describe('getWeekDays', () => {
    it('returns exactly 7 days', () => {
      const days = getWeekDays(new Date('2026-05-11T10:00:00'));
      expect(days).toHaveLength(7);
    });

    it('first day is the Monday of the week', () => {
      const days = getWeekDays(new Date('2026-05-13T10:00:00')); // Wednesday
      expect(days[0]).toBe('2026-05-11');
    });

    it('last day is the Sunday of the week', () => {
      const days = getWeekDays(new Date('2026-05-13T10:00:00'));
      expect(days[6]).toBe('2026-05-17');
    });

    it('returns consecutive dates Mon through Sun', () => {
      const days = getWeekDays(new Date('2026-05-11T10:00:00'));
      expect(days).toEqual([
        '2026-05-11',
        '2026-05-12',
        '2026-05-13',
        '2026-05-14',
        '2026-05-15',
        '2026-05-16',
        '2026-05-17',
      ]);
    });

    it('works when given a Sunday input', () => {
      // 2026-05-17 is Sunday; week should still be 2026-05-11 to 2026-05-17
      const days = getWeekDays(new Date('2026-05-17T10:00:00'));
      expect(days[0]).toBe('2026-05-11');
      expect(days[6]).toBe('2026-05-17');
    });
  });

  describe('prevDay', () => {
    it('returns the preceding calendar day', () => {
      expect(prevDay('2026-05-11')).toBe('2026-05-10');
    });

    it('rolls back across month boundary', () => {
      expect(prevDay('2026-06-01')).toBe('2026-05-31');
    });
  });
});

describe('HabitNode — commands (Decision #11)', () => {
  describe('habitAdd', () => {
    it('adds a habit with an empty log and archived=false', () => {
      const state = defaultHabitState();
      const next = habitAdd(state, { name: 'Run' }, env('2026-05-11', 'h1'));
      expect(next.habits).toHaveLength(1);
      const h = next.habits[0];
      expect(h).toBeDefined();
      if (!h) throw new Error('expected habit');
      expect(h.name).toBe('Run');
      expect(h.id).toBe('h1');
      expect(h.log).toEqual([]);
      expect(h.archived).toBe(false);
    });

    it('trims whitespace from habit name', () => {
      const next = habitAdd(defaultHabitState(), { name: '  Read  ' }, env('2026-05-11'));
      expect(next.habits[0]?.name).toBe('Read');
    });

    it('ignores empty or whitespace-only name', () => {
      const state = defaultHabitState();
      expect(habitAdd(state, { name: '' }, env('2026-05-11'))).toBe(state);
      expect(habitAdd(state, { name: '   ' }, env('2026-05-11'))).toBe(state);
    });

    it('appends habits without removing existing ones', () => {
      const s1 = habitAdd(defaultHabitState(), { name: 'A' }, env('2026-05-11', 'h1'));
      const s2 = habitAdd(s1, { name: 'B' }, env('2026-05-11', 'h2'));
      expect(s2.habits).toHaveLength(2);
      expect(s2.habits[0]?.name).toBe('A');
      expect(s2.habits[1]?.name).toBe('B');
    });
  });

  describe('habitToggleDay', () => {
    it('adds a date to the log (toggle on)', () => {
      const s = stateWithHabit();
      const habitId = s.habits[0]!.id;
      const next = habitToggleDay(s, { id: habitId, date: '2026-05-11' });
      expect(next.habits[0]?.log).toContain('2026-05-11');
    });

    it('removes a date from the log (toggle off)', () => {
      const s = stateWithHabit('Run', ['2026-05-11']);
      // Re-build with proper state containing the log entry.
      const base = habitAdd(defaultHabitState(), { name: 'Run' }, env('2026-05-11', 'h1'));
      const withLog = habitToggleDay(base, { id: 'h1', date: '2026-05-11' });
      const toggled = habitToggleDay(withLog, { id: 'h1', date: '2026-05-11' });
      expect(toggled.habits[0]?.log).not.toContain('2026-05-11');
    });

    it('keeps log sorted descending after toggle on', () => {
      const base = habitAdd(defaultHabitState(), { name: 'Meditate' }, env('2026-05-11', 'h1'));
      const s1 = habitToggleDay(base, { id: 'h1', date: '2026-05-09' });
      const s2 = habitToggleDay(s1, { id: 'h1', date: '2026-05-11' });
      expect(s2.habits[0]?.log).toEqual(['2026-05-11', '2026-05-09']);
    });

    it('defaults to env.today() when no date is provided', () => {
      const base = habitAdd(defaultHabitState(), { name: 'X' }, env('2026-05-11', 'h1'));
      const e = env('2026-05-15', 'h1');
      const next = habitToggleDay(base, { id: 'h1' }, e);
      expect(next.habits[0]?.log).toContain('2026-05-15');
    });

    it('is a no-op for unknown habit id', () => {
      const s = stateWithHabit();
      const next = habitToggleDay(s, { id: 'nonexistent', date: '2026-05-11' });
      expect(next.habits[0]?.log).toEqual([]);
    });

    it('does not add duplicate dates', () => {
      const base = habitAdd(defaultHabitState(), { name: 'Read' }, env('2026-05-11', 'h1'));
      const s1 = habitToggleDay(base, { id: 'h1', date: '2026-05-11' });
      // Toggle off then on again — should still have one entry.
      const s2 = habitToggleDay(s1, { id: 'h1', date: '2026-05-11' });
      const s3 = habitToggleDay(s2, { id: 'h1', date: '2026-05-11' });
      expect(s3.habits[0]?.log).toHaveLength(1);
    });
  });

  describe('habitMarkDone', () => {
    it('adds today to the log if not present', () => {
      const base = habitAdd(defaultHabitState(), { name: 'Walk' }, env('2026-05-11', 'h1'));
      const e = env('2026-05-12');
      const next = habitMarkDone(base, { id: 'h1' }, e);
      expect(next.habits[0]?.log).toContain('2026-05-12');
    });

    it('is idempotent — does not duplicate today if already present', () => {
      const base = habitAdd(defaultHabitState(), { name: 'Walk' }, env('2026-05-11', 'h1'));
      const e = env('2026-05-11');
      const s1 = habitMarkDone(base, { id: 'h1' }, e);
      const s2 = habitMarkDone(s1, { id: 'h1' }, e);
      expect(s2.habits[0]?.log).toHaveLength(1);
      expect(s2.habits[0]?.log).toContain('2026-05-11');
    });
  });

  describe('habitRename', () => {
    it('updates the name of the correct habit', () => {
      const base = habitAdd(defaultHabitState(), { name: 'Old' }, env('2026-05-11', 'h1'));
      const next = habitRename(base, { id: 'h1', name: 'New' });
      expect(next.habits[0]?.name).toBe('New');
    });

    it('ignores empty name', () => {
      const base = habitAdd(defaultHabitState(), { name: 'Keep' }, env('2026-05-11', 'h1'));
      const next = habitRename(base, { id: 'h1', name: '' });
      expect(next.habits[0]?.name).toBe('Keep');
    });
  });

  describe('habitArchive', () => {
    it('sets archived=true on the target habit', () => {
      const base = habitAdd(defaultHabitState(), { name: 'Archive me' }, env('2026-05-11', 'h1'));
      const next = habitArchive(base, { id: 'h1' });
      expect(next.habits[0]?.archived).toBe(true);
    });

    it('does not affect other habits', () => {
      const s1 = habitAdd(defaultHabitState(), { name: 'A' }, env('2026-05-11', 'h1'));
      const s2 = habitAdd(s1, { name: 'B' }, env('2026-05-11', 'h2'));
      const next = habitArchive(s2, { id: 'h1' });
      expect(next.habits[1]?.archived).toBe(false);
    });
  });

  describe('habitRemove', () => {
    it('removes the correct habit', () => {
      const s1 = habitAdd(defaultHabitState(), { name: 'A' }, env('2026-05-11', 'h1'));
      const s2 = habitAdd(s1, { name: 'B' }, env('2026-05-11', 'h2'));
      const next = habitRemove(s2, { id: 'h1' });
      expect(next.habits).toHaveLength(1);
      expect(next.habits[0]?.name).toBe('B');
    });

    it('leaves state unchanged for unknown id', () => {
      const s = habitAdd(defaultHabitState(), { name: 'A' }, env('2026-05-11', 'h1'));
      const next = habitRemove(s, { id: 'nonexistent' });
      expect(next.habits).toHaveLength(1);
    });
  });

  describe('calcStreak (Decision #11)', () => {
    it('returns 0 for empty log', () => {
      expect(calcStreak([], '2026-05-11')).toBe(0);
    });

    it('returns 1 when only today is in the log', () => {
      expect(calcStreak(['2026-05-11'], '2026-05-11')).toBe(1);
    });

    it('returns 1 when only yesterday is in the log (today not yet marked)', () => {
      // Decision #11: start from yesterday if today not marked.
      expect(calcStreak(['2026-05-10'], '2026-05-11')).toBe(1);
    });

    it('returns 0 when today is not marked and gap before yesterday', () => {
      // Two days ago but not yesterday — streak should be 0.
      expect(calcStreak(['2026-05-09'], '2026-05-11')).toBe(0);
    });

    it('counts consecutive days ending today', () => {
      expect(calcStreak(['2026-05-11', '2026-05-10', '2026-05-09'], '2026-05-11')).toBe(3);
    });

    it('counts consecutive days when today is not yet marked', () => {
      // Yesterday, day-before, day-before-that — should count from yesterday backwards.
      expect(calcStreak(['2026-05-10', '2026-05-09', '2026-05-08'], '2026-05-11')).toBe(3);
    });

    it('stops at a gap', () => {
      // 2026-05-11, 2026-05-10 present but 2026-05-09 missing — streak is 2.
      expect(calcStreak(['2026-05-11', '2026-05-10', '2026-05-07'], '2026-05-11')).toBe(2);
    });

    it('is unaffected by non-consecutive future or past entries', () => {
      // A lone entry two weeks ago should not extend the streak.
      expect(calcStreak(['2026-05-11', '2026-04-01'], '2026-05-11')).toBe(1);
    });
  });
});
