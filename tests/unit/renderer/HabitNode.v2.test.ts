// HabitNode v2 — Decision #14 contract tests
// Covers: color schema, view config, past-day backfill, future block,
// month-grid helper, year-grid helper, popover-issued commands.

import { describe, it, expect } from 'vitest';
import {
  habitAdd,
  habitToggleDay,
  habitSetColor,
  habitSetView,
  habitRemove,
  calcStreak,
  type HabitEnv,
} from '../../../src/renderer/components/nodes/HabitNode/commands';
import {
  defaultHabitConfig,
  defaultHabitState,
  getMonthDays,
  getYearGridCells,
  HABIT_COLORS,
  HABIT_VIEWS,
  isHabitColor,
  isHabitView,
} from '../../../src/renderer/components/nodes/HabitNode/types';

const env = (today: string, uuid = 'test-uuid'): HabitEnv => ({
  uuid: () => uuid,
  now: () => `${today}T10:00:00.000Z`,
  today: () => today,
});

const WED = '2026-05-13';

// ── color schema ────────────────────────────────────────────────────────

describe('F11/F12 — habit color schema', () => {
  it('habitAdd defaults color to acid', () => {
    const s = habitAdd(defaultHabitState(), { name: 'meditate' }, env(WED));
    expect(s.habits[0]?.color).toBe('acid');
  });

  it('habitAdd accepts a valid color override', () => {
    const s = habitAdd(defaultHabitState(), { name: 'run', color: 'rust' }, env(WED));
    expect(s.habits[0]?.color).toBe('rust');
  });

  it('habitAdd falls back to acid on unknown color', () => {
    const s = habitAdd(
      defaultHabitState(),
      // @ts-expect-error testing runtime guard
      { name: 'run', color: 'magenta' },
      env(WED),
    );
    expect(s.habits[0]?.color).toBe('acid');
  });

  it('habitSetColor changes a habit color', () => {
    const s1 = habitAdd(defaultHabitState(), { name: 'a' }, env(WED, 'h1'));
    const s2 = habitSetColor(s1, { id: 'h1', color: 'cyan' });
    expect(s2.habits[0]?.color).toBe('cyan');
  });

  it('habitSetColor is no-op for unknown color', () => {
    const s1 = habitAdd(defaultHabitState(), { name: 'a' }, env(WED, 'h1'));
    // @ts-expect-error testing runtime guard
    const s2 = habitSetColor(s1, { id: 'h1', color: 'magenta' });
    expect(s2).toEqual(s1);
  });

  it('habitSetColor only touches the matching habit', () => {
    let s = habitAdd(defaultHabitState(), { name: 'a' }, env(WED, 'h1'));
    s = habitAdd(s, { name: 'b' }, env(WED, 'h2'));
    const out = habitSetColor(s, { id: 'h1', color: 'plum' });
    expect(out.habits[0]?.color).toBe('plum');
    expect(out.habits[1]?.color).toBe('acid');
  });

  it('HABIT_COLORS contains exactly the 6 cyber tokens', () => {
    expect([...HABIT_COLORS]).toEqual(['acid', 'rust', 'cyan', 'plum', 'spine', 'ink']);
  });

  it('isHabitColor narrows correctly', () => {
    expect(isHabitColor('acid')).toBe(true);
    expect(isHabitColor('hot-pink')).toBe(false);
    expect(isHabitColor(42)).toBe(false);
    expect(isHabitColor(null)).toBe(false);
  });
});

// ── view config ─────────────────────────────────────────────────────────

describe('F10/F16 — habit view config', () => {
  it('defaultHabitConfig has view = week', () => {
    expect(defaultHabitConfig().view).toBe('week');
  });

  it('habitSetView switches view', () => {
    const c = habitSetView(defaultHabitConfig(), { view: 'month' });
    expect(c.view).toBe('month');
  });

  it('habitSetView is no-op for unknown view', () => {
    const before = defaultHabitConfig();
    // @ts-expect-error testing runtime guard
    const after = habitSetView(before, { view: 'decade' });
    expect(after).toEqual(before);
  });

  it('habitSetView leaves weekStartsOn untouched', () => {
    const c = habitSetView(defaultHabitConfig(), { view: 'year' });
    expect(c.weekStartsOn).toBe('monday');
  });

  it('HABIT_VIEWS is week, month, year', () => {
    expect([...HABIT_VIEWS]).toEqual(['week', 'month', 'year']);
  });

  it('isHabitView narrows correctly', () => {
    expect(isHabitView('week')).toBe(true);
    expect(isHabitView('decade')).toBe(false);
  });
});

// ── past-day backfill + future block ────────────────────────────────────

describe('F14 — past-day backfill / future block', () => {
  it('toggleDay accepts a past date (any past day, regardless of createdAt)', () => {
    const s1 = habitAdd(defaultHabitState(), { name: 'a' }, env(WED, 'h1'));
    const yesterday = '2026-05-12';
    const next = habitToggleDay(s1, { id: 'h1', date: yesterday }, env(WED));
    expect(next.habits[0]?.log).toContain(yesterday);
  });

  it('toggleDay accepts a date long before habit creation (user back-fill)', () => {
    const s1 = habitAdd(defaultHabitState(), { name: 'a' }, env(WED, 'h1'));
    const longAgo = '2024-01-15';
    const next = habitToggleDay(s1, { id: 'h1', date: longAgo }, env(WED));
    expect(next.habits[0]?.log).toContain(longAgo);
  });

  it('toggleDay rejects a future date (no-op)', () => {
    const s1 = habitAdd(defaultHabitState(), { name: 'a' }, env(WED, 'h1'));
    const tomorrow = '2026-05-14';
    const next = habitToggleDay(s1, { id: 'h1', date: tomorrow }, env(WED));
    expect(next.habits[0]?.log).not.toContain(tomorrow);
  });

  it('toggleDay rejects far-future dates', () => {
    const s1 = habitAdd(defaultHabitState(), { name: 'a' }, env(WED, 'h1'));
    const next = habitToggleDay(s1, { id: 'h1', date: '2099-12-31' }, env(WED));
    expect(next.habits[0]?.log).toHaveLength(0);
  });

  it('streak unaffected by future toggles (since they no-op)', () => {
    const s1 = habitAdd(defaultHabitState(), { name: 'a' }, env(WED, 'h1'));
    const next = habitToggleDay(s1, { id: 'h1', date: '2026-05-15' }, env(WED));
    expect(calcStreak(next.habits[0]!.log, WED)).toBe(0);
  });

  it('back-fill of consecutive past days builds a streak', () => {
    let s = habitAdd(defaultHabitState(), { name: 'a' }, env(WED, 'h1'));
    s = habitToggleDay(s, { id: 'h1', date: '2026-05-11' }, env(WED)); // Mon
    s = habitToggleDay(s, { id: 'h1', date: '2026-05-12' }, env(WED)); // Tue
    expect(calcStreak(s.habits[0]!.log, WED)).toBe(2);
  });
});

// ── month grid helper ───────────────────────────────────────────────────

describe('getMonthDays', () => {
  it('returns 31 cells for May 2026', () => {
    const days = getMonthDays(new Date('2026-05-13T10:00:00'));
    expect(days).toHaveLength(31);
  });

  it('returns 30 cells for April 2026', () => {
    const days = getMonthDays(new Date('2026-04-15T10:00:00'));
    expect(days).toHaveLength(30);
  });

  it('returns 28 cells for non-leap February 2026', () => {
    const days = getMonthDays(new Date('2026-02-10T10:00:00'));
    expect(days).toHaveLength(28);
  });

  it('returns 29 cells for leap February 2024', () => {
    const days = getMonthDays(new Date('2024-02-10T10:00:00'));
    expect(days).toHaveLength(29);
  });

  it('first cell is day 01 of the month', () => {
    const days = getMonthDays(new Date('2026-05-13T10:00:00'));
    expect(days[0]).toBe('2026-05-01');
  });

  it('last cell is the final day of the month', () => {
    const days = getMonthDays(new Date('2026-05-13T10:00:00'));
    expect(days[days.length - 1]).toBe('2026-05-31');
  });

  it('every cell belongs to the input month', () => {
    const days = getMonthDays(new Date('2026-05-13T10:00:00'));
    for (const d of days) expect(d.startsWith('2026-05-')).toBe(true);
  });
});

// ── year grid helper ────────────────────────────────────────────────────

describe('getYearGridCells', () => {
  it('returns 7 rows × 53 columns', () => {
    const g = getYearGridCells(new Date('2026-05-13T10:00:00'));
    expect(g).toHaveLength(7);
    for (const row of g) expect(row).toHaveLength(53);
  });

  it('today appears at the rightmost column (col 52)', () => {
    const today = new Date('2026-05-13T10:00:00');
    const g = getYearGridCells(today);
    let found = false;
    for (let r = 0; r < 7; r++) {
      if (g[r]![52] === '2026-05-13') {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('cells past today are null', () => {
    const today = new Date('2026-05-13T10:00:00'); // a Wednesday
    const g = getYearGridCells(today);
    // Wed is dow index (3+6)%7 = 2 → row 2 holds today. Rows 3..6 in col 52
    // would be Thu/Fri/Sat/Sun (future) and should be null.
    for (let r = 3; r < 7; r++) {
      expect(g[r]![52]).toBeNull();
    }
  });

  it('cells before today are valid YMDs', () => {
    const g = getYearGridCells(new Date('2026-05-13T10:00:00'));
    // Top-left cell should be a real date earlier than today
    const topLeft = g[0]![0];
    expect(typeof topLeft === 'string').toBe(true);
    if (topLeft) {
      expect(topLeft < '2026-05-13').toBe(true);
    }
  });
});

// ── remove ──────────────────────────────────────────────────────────────

describe('F13 — habit remove', () => {
  it('habitRemove hard-deletes the habit', () => {
    let s = habitAdd(defaultHabitState(), { name: 'a' }, env(WED, 'h1'));
    s = habitAdd(s, { name: 'b' }, env(WED, 'h2'));
    const out = habitRemove(s, { id: 'h1' });
    expect(out.habits).toHaveLength(1);
    expect(out.habits[0]?.id).toBe('h2');
  });

  it('habitRemove on unknown id is no-op', () => {
    const s = habitAdd(defaultHabitState(), { name: 'a' }, env(WED, 'h1'));
    expect(habitRemove(s, { id: 'unknown' })).toEqual(s);
  });
});
