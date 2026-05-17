// Schedule-aware streak + isDayScheduled helper tests.
// 2026-05-17: per spec — only scheduled days count toward the streak; non-
// scheduled days are skipped (neither extend nor break the streak).

import { describe, it, expect } from 'vitest';
import { calcStreak } from '../commands';
import { isDayScheduled, isoDowOf } from '../types';
import type { HabitSchedule } from '../types';

describe('isoDowOf', () => {
  it('returns ISO dow (1=Mon..7=Sun)', () => {
    // 2026-05-11 is a Monday.
    expect(isoDowOf('2026-05-11')).toBe(1);
    expect(isoDowOf('2026-05-12')).toBe(2);
    expect(isoDowOf('2026-05-17')).toBe(7); // Sunday
  });
});

describe('isDayScheduled', () => {
  it('returns true when schedule is absent', () => {
    expect(isDayScheduled(undefined, '2026-05-17')).toBe(true);
  });

  it('daily → every day true', () => {
    const s: HabitSchedule = { kind: 'daily', timeOfDay: '08:00' };
    expect(isDayScheduled(s, '2026-05-17')).toBe(true);
    expect(isDayScheduled(s, '2026-05-12')).toBe(true);
  });

  it('weekdays → Mon-Fri only', () => {
    const s: HabitSchedule = { kind: 'weekdays', timeOfDay: '08:00' };
    expect(isDayScheduled(s, '2026-05-11')).toBe(true);  // Mon
    expect(isDayScheduled(s, '2026-05-15')).toBe(true);  // Fri
    expect(isDayScheduled(s, '2026-05-16')).toBe(false); // Sat
    expect(isDayScheduled(s, '2026-05-17')).toBe(false); // Sun
  });

  it('weekly → only listed ISO dows', () => {
    // Mon (1) + Wed (3) + Fri (5)
    const s: HabitSchedule = { kind: 'weekly', timeOfDay: '08:00', days: [1, 3, 5] };
    expect(isDayScheduled(s, '2026-05-11')).toBe(true);  // Mon
    expect(isDayScheduled(s, '2026-05-12')).toBe(false); // Tue
    expect(isDayScheduled(s, '2026-05-13')).toBe(true);  // Wed
    expect(isDayScheduled(s, '2026-05-17')).toBe(false); // Sun
  });
});

describe('calcStreak — unscheduled habit (legacy)', () => {
  it('counts consecutive days back from today', () => {
    expect(calcStreak(['2026-05-17', '2026-05-16', '2026-05-15'], '2026-05-17')).toBe(3);
  });

  it('today-grace: yesterday counts when today missing', () => {
    expect(calcStreak(['2026-05-16', '2026-05-15'], '2026-05-17')).toBe(2);
  });
});

describe('calcStreak — daily schedule', () => {
  const sched: HabitSchedule = { kind: 'daily', timeOfDay: '08:00' };

  it('behaves like legacy when every day is scheduled', () => {
    expect(calcStreak(['2026-05-17', '2026-05-16'], '2026-05-17', sched)).toBe(2);
  });
});

describe('calcStreak — weekly schedule (Mon/Wed/Fri)', () => {
  // ISO 1=Mon, 3=Wed, 5=Fri.
  const sched: HabitSchedule = { kind: 'weekly', timeOfDay: '08:00', days: [1, 3, 5] };

  it('counts only scheduled days; skips non-scheduled days between them', () => {
    // Today = Fri 2026-05-15. Log includes Fri, Wed (5-13), Mon (5-11).
    // Tue/Thu/weekend are non-scheduled and skipped → streak = 3.
    expect(
      calcStreak(['2026-05-15', '2026-05-13', '2026-05-11'], '2026-05-15', sched),
    ).toBe(3);
  });

  it('breaks when a scheduled day is missing even if surrounding non-scheduled days are not', () => {
    // Missing Wed 2026-05-13 between Mon and Fri.
    expect(
      calcStreak(['2026-05-15', '2026-05-11'], '2026-05-15', sched),
    ).toBe(1);
  });

  it('today-grace: today is Sun (non-scheduled) — start from last scheduled (Fri)', () => {
    // Sun 2026-05-17 is not scheduled; cursor moves to Fri 2026-05-15.
    expect(
      calcStreak(['2026-05-15', '2026-05-13', '2026-05-11'], '2026-05-17', sched),
    ).toBe(3);
  });

  it('today is scheduled but not yet logged → start from prior scheduled day', () => {
    // Today = Fri 2026-05-15, not in log. Wed + Mon are logged → streak = 2.
    expect(
      calcStreak(['2026-05-13', '2026-05-11'], '2026-05-15', sched),
    ).toBe(2);
  });

  it('returns 0 when no scheduled days are logged', () => {
    // Logged Tue 5-12 only, which is not scheduled. Streak = 0.
    expect(calcStreak(['2026-05-12'], '2026-05-15', sched)).toBe(0);
  });
});

describe('calcStreak — weekdays schedule', () => {
  const sched: HabitSchedule = { kind: 'weekdays', timeOfDay: '08:00' };

  it('weekends are skipped, not counted as gaps', () => {
    // Today = Mon 2026-05-18. Logged: Mon 18, Fri 15, Thu 14.
    // Sat/Sun between 15 and 18 are non-scheduled and skipped.
    expect(
      calcStreak(['2026-05-18', '2026-05-15', '2026-05-14'], '2026-05-18', sched),
    ).toBe(3);
  });

  it('breaks on a missed weekday', () => {
    // Missing Thu 5-14: streak only counts Mon + Fri ... no wait, walking back
    // from Mon 5-18 → grace? today is logged. Mon→ Fri (5-15, present) → Thu
    // (5-14, missing) → break. Streak = 2.
    expect(
      calcStreak(['2026-05-18', '2026-05-15'], '2026-05-18', sched),
    ).toBe(2);
  });
});
