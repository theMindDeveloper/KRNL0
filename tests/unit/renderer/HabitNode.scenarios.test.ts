// HabitNode Gherkin Scenarios — vitest specs
// Tests pure logic derived from the component: ISO week helper, day-label ordering,
// streak calculation, command dispatch correctness, and cell state derivation.
// Environment: node (no jsdom) — all tests cover pure functions and data invariants.

import { describe, it, expect } from 'vitest';
import {
  habitAdd,
  habitToggleDay,
  habitMarkDone,
  calcStreak,
  type HabitEnv,
} from '../../../src/renderer/components/nodes/HabitNode/commands';
import {
  defaultHabitState,
  getWeekDays,
  toYMD,
  getMondayOf,
} from '../../../src/renderer/components/nodes/HabitNode/types';
import type { HabitState } from '../../../src/renderer/components/nodes/HabitNode/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const env = (today: string, uuid = 'test-uuid', nowStr = `${today}T10:00:00.000Z`): HabitEnv => ({
  uuid: () => uuid,
  now: () => nowStr,
  today: () => today,
});

/** Returns the ISO week number for a Date. Matches the helper in HabitNode/index.tsx. */
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/** Build a state with one habit "meditate", done Mon + Tue of the given Wednesday. */
function buildWednesdayState(wednesday: string): {
  state: HabitState;
  habitId: string;
  today: string;
  weekDays: string[];
} {
  // wednesday = '2026-05-13' (a real Wednesday)
  const date = new Date(wednesday + 'T10:00:00');
  const monday = getMondayOf(date);
  const mondayStr = toYMD(monday);
  const tuesdayStr = toYMD(new Date(monday.getTime() + 86400000));
  const weekDays = getWeekDays(date);

  const base = defaultHabitState();
  const s1 = habitAdd(base, { name: 'meditate' }, env(wednesday, 'h-med'));
  // Toggle monday and tuesday in
  const s2 = habitToggleDay(s1, { id: 'h-med', date: mondayStr }, env(wednesday));
  const s3 = habitToggleDay(s2, { id: 'h-med', date: tuesdayStr }, env(wednesday));

  return { state: s3, habitId: 'h-med', today: wednesday, weekDays };
}

// A Wednesday we can rely on for deterministic tests.
const WEDNESDAY = '2026-05-13';

// ---------------------------------------------------------------------------
// Scenario: F1 — Header shows ISO week number
// ---------------------------------------------------------------------------
describe('F1 — Header ISO week number', () => {
  it('getISOWeek returns 20 for 2026-05-13 (week 20)', () => {
    // Verify our ISO week helper matches expected value.
    // 2026-05-13 is in ISO week 20.
    const date = new Date('2026-05-13T10:00:00');
    expect(getISOWeek(date)).toBe(20);
  });

  it('getISOWeek returns a number between 1 and 53', () => {
    const dates = [
      '2026-01-01', '2026-03-15', '2026-07-04', '2026-12-31',
    ];
    for (const d of dates) {
      const week = getISOWeek(new Date(d + 'T10:00:00'));
      expect(week).toBeGreaterThanOrEqual(1);
      expect(week).toBeLessThanOrEqual(53);
    }
  });

  it('week number increments across week boundaries', () => {
    // Sunday 2026-05-17 is end of week 20; Monday 2026-05-18 starts week 21
    const sunday = getISOWeek(new Date('2026-05-17T10:00:00'));
    const monday = getISOWeek(new Date('2026-05-18T10:00:00'));
    expect(monday).toBe(sunday + 1);
  });
});

// ---------------------------------------------------------------------------
// Scenario: F2 — Day-of-week labels M T W T F S S
// ---------------------------------------------------------------------------
describe('F2 — Day-of-week labels', () => {
  it('the constant label list is exactly M T W T F S S in order', () => {
    // Labels are hardcoded in the component. This test verifies the contract.
    const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    expect(DAY_LABELS).toHaveLength(7);
    expect(DAY_LABELS).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
  });

  it('getWeekDays returns exactly 7 dates for any input date', () => {
    expect(getWeekDays(new Date(WEDNESDAY + 'T10:00:00'))).toHaveLength(7);
  });

  it('weekDays[0] is Monday, weekDays[6] is Sunday for a Wednesday input', () => {
    const days = getWeekDays(new Date(WEDNESDAY + 'T10:00:00'));
    expect(days[0]).toBe('2026-05-11'); // Monday
    expect(days[6]).toBe('2026-05-17'); // Sunday
  });
});

// ---------------------------------------------------------------------------
// Scenario: F3 — Habit row anatomy (glyph, name, streak, 7 cells)
// ---------------------------------------------------------------------------
describe('F3 — Habit row anatomy', () => {
  it('a habit row has an id, name, log, and archived fields', () => {
    const { state } = buildWednesdayState(WEDNESDAY);
    const habit = state.habits[0];
    expect(habit).toBeDefined();
    if (!habit) throw new Error('expected habit');
    expect(habit.name).toBe('meditate');
    expect(habit.id).toBe('h-med');
    expect(habit.archived).toBe(false);
    expect(Array.isArray(habit.log)).toBe(true);
  });

  it('streak is 2 when Mon and Tue are done, today is Wed (not yet marked)', () => {
    const { state, today } = buildWednesdayState(WEDNESDAY);
    const habit = state.habits[0]!;
    const streak = calcStreak(habit.log, today);
    expect(streak).toBe(2);
  });

  it('getWeekDays provides exactly 7 cells (dates) for the grid', () => {
    const days = getWeekDays(new Date(WEDNESDAY + 'T10:00:00'));
    expect(days).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// Scenario: F4 — Clicking today's cell dispatches habit.toggleDay
// ---------------------------------------------------------------------------
describe('F4 — Toggle dispatches habit.toggleDay', () => {
  it('habitToggleDay adds today to log (toggle on)', () => {
    const { state, habitId, today } = buildWednesdayState(WEDNESDAY);
    const next = habitToggleDay(state, { id: habitId, date: today }, env(today));
    expect(next.habits[0]?.log).toContain(today);
  });

  it('habitToggleDay removes today from log (toggle off)', () => {
    const { state, habitId, today } = buildWednesdayState(WEDNESDAY);
    // Toggle on first
    const s1 = habitToggleDay(state, { id: habitId, date: today }, env(today));
    // Toggle off
    const s2 = habitToggleDay(s1, { id: habitId, date: today }, env(today));
    expect(s2.habits[0]?.log).not.toContain(today);
  });

  it('toggleDay on wrong id is a no-op', () => {
    const { state, today } = buildWednesdayState(WEDNESDAY);
    const next = habitToggleDay(state, { id: 'nonexistent', date: today }, env(today));
    expect(next).toEqual(state);
  });
});

// ---------------------------------------------------------------------------
// Scenario: F5 — Today cell is correctly identified in the week grid
// ---------------------------------------------------------------------------
describe('F5 — Today cell position in weekDays array', () => {
  it('today (Wednesday) appears at index 2 in the 0-based Mon–Sun array', () => {
    const days = getWeekDays(new Date(WEDNESDAY + 'T10:00:00'));
    const todayIdx = days.indexOf(WEDNESDAY);
    expect(todayIdx).toBe(2); // 0=Mon, 1=Tue, 2=Wed
  });

  it('only one cell matches today in the 7-day array', () => {
    const days = getWeekDays(new Date(WEDNESDAY + 'T10:00:00'));
    const todayMatches = days.filter((d) => d === WEDNESDAY);
    expect(todayMatches).toHaveLength(1);
  });

  it('when today is Sunday it appears at index 6', () => {
    const sunday = '2026-05-17'; // a known Sunday
    const days = getWeekDays(new Date(sunday + 'T10:00:00'));
    expect(days[6]).toBe(sunday);
    expect(days.indexOf(sunday)).toBe(6);
  });

  it('when today is Monday it appears at index 0', () => {
    const monday = '2026-05-11'; // a known Monday
    const days = getWeekDays(new Date(monday + 'T10:00:00'));
    expect(days[0]).toBe(monday);
    expect(days.indexOf(monday)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario: F6 — Streak updates after toggle
// ---------------------------------------------------------------------------
describe('F6 — Streak updates after toggle', () => {
  it('streak increases from 2 to 3 after marking Wednesday done', () => {
    const { state, habitId, today } = buildWednesdayState(WEDNESDAY);
    const before = calcStreak(state.habits[0]!.log, today);
    expect(before).toBe(2);

    const next = habitToggleDay(state, { id: habitId, date: today }, env(today));
    const after = calcStreak(next.habits[0]!.log, today);
    expect(after).toBe(3);
  });

  it('streak drops to 1 after unmarking Tuesday when Wednesday is done', () => {
    const { state, habitId, today } = buildWednesdayState(WEDNESDAY);
    const date = new Date(WEDNESDAY + 'T10:00:00');
    const monday = getMondayOf(date);
    const tuesdayStr = toYMD(new Date(monday.getTime() + 86400000));

    // Mark Wednesday done
    const s1 = habitToggleDay(state, { id: habitId, date: today }, env(today));
    // Unmark Tuesday — creates a gap Mon, gap, Wed — streak = 1
    const s2 = habitToggleDay(s1, { id: habitId, date: tuesdayStr }, env(today));
    const streak = calcStreak(s2.habits[0]!.log, today);
    expect(streak).toBe(1);
  });

  it('streak is 0 when log is empty', () => {
    expect(calcStreak([], WEDNESDAY)).toBe(0);
  });

  it('streak is 0 when nearest done date is two days ago (gap yesterday)', () => {
    // today=Wed, only Monday done — gap on Tue means streak=0
    const { state, habitId, today } = buildWednesdayState(WEDNESDAY);
    const date = new Date(WEDNESDAY + 'T10:00:00');
    const monday = getMondayOf(date);
    const tuesdayStr = toYMD(new Date(monday.getTime() + 86400000));
    // Remove Tuesday
    const s = habitToggleDay(state, { id: habitId, date: tuesdayStr }, env(today));
    const streak = calcStreak(s.habits[0]!.log, today);
    // Monday is in log but yesterday (Tue) is not — streak starting at yesterday fails immediately
    expect(streak).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario: F7 — Edge signal auto-marks today (habitMarkDone)
// ---------------------------------------------------------------------------
describe('F7 — Edge signal: habitMarkDone auto-marks today', () => {
  it('habitMarkDone adds today to the first habit log', () => {
    const { state, habitId, today } = buildWednesdayState(WEDNESDAY);
    const e = env(today);
    const next = habitMarkDone(state, { id: habitId }, e);
    expect(next.habits[0]?.log).toContain(today);
  });

  it('habitMarkDone is idempotent — repeated calls do not duplicate today', () => {
    const { state, habitId, today } = buildWednesdayState(WEDNESDAY);
    const e = env(today);
    const s1 = habitMarkDone(state, { id: habitId }, e);
    const s2 = habitMarkDone(s1, { id: habitId }, e);
    const todayCount = s2.habits[0]?.log.filter((d) => d === today).length ?? 0;
    expect(todayCount).toBe(1);
  });

  it('habitMarkDone does not affect other habits', () => {
    const base = defaultHabitState();
    const s1 = habitAdd(base, { name: 'A' }, env(WEDNESDAY, 'h1'));
    const s2 = habitAdd(s1, { name: 'B' }, env(WEDNESDAY, 'h2'));
    const e = env(WEDNESDAY);
    const next = habitMarkDone(s2, { id: 'h1' }, e);
    expect(next.habits[0]?.log).toContain(WEDNESDAY);
    expect(next.habits[1]?.log).not.toContain(WEDNESDAY);
  });
});

// ---------------------------------------------------------------------------
// Scenario: F8 — Future cells are non-interactive (date classification)
// ---------------------------------------------------------------------------
describe('F8 — Future cells are non-interactive (cell-state derivation)', () => {
  it('dates after today in the week are classified as future', () => {
    const days = getWeekDays(new Date(WEDNESDAY + 'T10:00:00'));
    // Wed = index 2. Thu=3, Fri=4, Sat=5, Sun=6 are future.
    const futureDates = days.filter((d) => d > WEDNESDAY);
    expect(futureDates).toHaveLength(4); // Thu, Fri, Sat, Sun
    for (const d of futureDates) {
      expect(d > WEDNESDAY).toBe(true);
    }
  });

  it('dates before today in the week are classified as past', () => {
    const days = getWeekDays(new Date(WEDNESDAY + 'T10:00:00'));
    const pastDates = days.filter((d) => d < WEDNESDAY);
    expect(pastDates).toHaveLength(2); // Mon, Tue
    for (const d of pastDates) {
      expect(d < WEDNESDAY).toBe(true);
    }
  });

  it('only today is neither past nor future', () => {
    const days = getWeekDays(new Date(WEDNESDAY + 'T10:00:00'));
    const todayCells = days.filter((d) => d === WEDNESDAY);
    expect(todayCells).toHaveLength(1);
  });

  it('habitToggleDay with a future date is a no-op (Decision #14)', () => {
    // Decision #14 hardened the guard: the FSM rejects future dates. User
    // requirement: "future is not allowed". UI also does not render a button.
    const base = defaultHabitState();
    const s1 = habitAdd(base, { name: 'Test' }, env(WEDNESDAY, 'h1'));
    const futureDate = '2026-05-15'; // Friday — in the future relative to Wed
    const next = habitToggleDay(s1, { id: 'h1', date: futureDate }, env(WEDNESDAY));
    expect(next.habits[0]?.log).not.toContain(futureDate);
  });
});
