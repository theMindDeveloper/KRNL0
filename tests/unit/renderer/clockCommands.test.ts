/**
 * ADR 0004 §3.2 — ClockNode day-selector command tests.
 *
 * Covers:
 *   - clock.setSelectedDate validates YYYY-MM-DD; no-op on garbage
 *   - clock.advanceDay shifts ±1 day correctly across month boundaries
 *   - clock.goToday sets selectedDate to local-today YMD
 */

import { describe, it, expect } from 'vitest';
import {
  clockSetSelectedDate,
  clockAdvanceDay,
  clockGoToday,
} from '../../../src/renderer/components/nodes/ClockNode/commands';
import { defaultClockState, todayLocalYMD } from '../../../src/renderer/components/nodes/ClockNode/types';

describe('clock.setSelectedDate (ADR 0004 §3.2)', () => {
  it('sets selectedDate to a valid YYYY-MM-DD', () => {
    const s = defaultClockState();
    const next = clockSetSelectedDate(s, { date: '2026-06-15' });
    expect(next.selectedDate).toBe('2026-06-15');
  });

  it('no-ops on a malformed date string', () => {
    const s = { ...defaultClockState(), selectedDate: '2026-05-14' };
    const next = clockSetSelectedDate(s, { date: 'not-a-date' });
    expect(next.selectedDate).toBe('2026-05-14');
  });

  it('preserves linkedTodoId and viewWindow', () => {
    const s = { ...defaultClockState(), linkedTodoId: 'todo-x', viewWindow: 1 as const };
    const next = clockSetSelectedDate(s, { date: '2026-06-15' });
    expect(next.linkedTodoId).toBe('todo-x');
    expect(next.viewWindow).toBe(1);
  });
});

describe('clock.advanceDay (ADR 0004 §3.2)', () => {
  it('advances forward by one day', () => {
    const s = { ...defaultClockState(), selectedDate: '2026-05-14' };
    const next = clockAdvanceDay(s, { delta: 1 });
    expect(next.selectedDate).toBe('2026-05-15');
  });

  it('advances backward by one day', () => {
    const s = { ...defaultClockState(), selectedDate: '2026-05-14' };
    const next = clockAdvanceDay(s, { delta: -1 });
    expect(next.selectedDate).toBe('2026-05-13');
  });

  it('rolls over a month boundary going forward', () => {
    const s = { ...defaultClockState(), selectedDate: '2026-05-31' };
    const next = clockAdvanceDay(s, { delta: 1 });
    expect(next.selectedDate).toBe('2026-06-01');
  });

  it('rolls back across a year boundary', () => {
    const s = { ...defaultClockState(), selectedDate: '2026-01-01' };
    const next = clockAdvanceDay(s, { delta: -1 });
    expect(next.selectedDate).toBe('2025-12-31');
  });

  it('handles leap-year Feb 29 correctly going forward', () => {
    // 2028 is a leap year. Feb 29 + 1 = Mar 1.
    const s = { ...defaultClockState(), selectedDate: '2028-02-29' };
    const next = clockAdvanceDay(s, { delta: 1 });
    expect(next.selectedDate).toBe('2028-03-01');
  });

  it('coerces other delta values to a no-op', () => {
    const s = { ...defaultClockState(), selectedDate: '2026-05-14' };
    const next = clockAdvanceDay(s, { delta: 0 as never });
    expect(next.selectedDate).toBe('2026-05-14');
  });

  it('does not mutate input state', () => {
    const s = { ...defaultClockState(), selectedDate: '2026-05-14' };
    clockAdvanceDay(s, { delta: 1 });
    expect(s.selectedDate).toBe('2026-05-14');
  });
});

describe('clock.goToday (ADR 0004 §3.2)', () => {
  it('sets selectedDate to local-today YMD', () => {
    const s = { ...defaultClockState(), selectedDate: '2020-01-01' };
    const next = clockGoToday(s);
    expect(next.selectedDate).toBe(todayLocalYMD());
  });

  it('preserves linkedTodoId and viewWindow', () => {
    const s = {
      linkedTodoId: 'todo-x',
      viewWindow: 1 as const,
      selectedDate: '2020-01-01',
    };
    const next = clockGoToday(s);
    expect(next.linkedTodoId).toBe('todo-x');
    expect(next.viewWindow).toBe(1);
  });

  it('emits a YYYY-MM-DD-shaped string', () => {
    const s = { ...defaultClockState(), selectedDate: '2020-01-01' };
    const next = clockGoToday(s);
    expect(next.selectedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('defaultClockState (ADR 0004 §3)', () => {
  it('initializes selectedDate to today (local)', () => {
    const s = defaultClockState();
    expect(s.selectedDate).toBe(todayLocalYMD());
  });
});
