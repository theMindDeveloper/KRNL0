/**
 * No-scroll windows + analytics text summary (no-scroll-paging F1–F4, analytics-window F8).
 */
import { describe, it, expect } from 'vitest';
import { computePageStarts } from '../../../src/renderer/components/ui/PagedView';
import { hourWindow, stepHourWindow } from '../../../src/renderer/components/nodes/CalendarNode/hourWindow';
import { summarizeAnalytics, fmtMinutes } from '../../../src/renderer/analytics/summary';
import type { AnalyticsResult } from '../../../src/renderer/analytics/types';

describe('computePageStarts — pages of whole items', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ top: i * 30, bottom: i * 30 + 28 }));
  it('one page when everything fits', () => {
    expect(computePageStarts(rows, 400)).toEqual([0]);
  });
  it('starts a new page at the first row that would be cut', () => {
    // 100px fits rows 0..2 (bottom 88); row 3 (bottom 118) starts page 2 at 90.
    expect(computePageStarts(rows, 100)).toEqual([0, 90, 180, 270]);
  });
  it('a single item taller than the box is not split forever', () => {
    expect(computePageStarts([{ top: 0, bottom: 500 }], 100)).toEqual([0]);
  });
  it('items on the same row (grid cards) stay on the same page', () => {
    const cards = [{ top: 0, bottom: 200 }, { top: 0, bottom: 200 }, { top: 210, bottom: 410 }, { top: 210, bottom: 300 }];
    expect(computePageStarts(cards, 250)).toEqual([0, 210]);
  });
});

describe('hourWindow — calendar shows whole hours', () => {
  it('fits as many whole hours as the panel allows', () => {
    expect(hourWindow(0, 300, 56)).toMatchObject({ startHour: 0, endHour: 5, span: 5, pages: 5 });
  });
  it('steps a full window and clamps at the ends', () => {
    expect(stepHourWindow(0, 300, 56, 24, 1)).toBe(5);
    expect(stepHourWindow(18 * 56, 300, 56, 24, 1)).toBe(19);
    expect(stepHourWindow(2 * 56, 300, 56, 24, -1)).toBe(0);
  });
  it('a panel taller than the day is one page', () => {
    expect(hourWindow(0, 24 * 28 + 10, 28).pages).toBe(1);
  });
});

function engine(over: Partial<{ tasks: number; focus: number; prevTasks: number; prevFocus: number }> = {}): AnalyticsResult {
  const o = { tasks: 12, focus: 300, prevTasks: 10, prevFocus: 150, ...over };
  let call = 0;
  return {
    totals: () => (call++ % 2 === 0
      ? { tasksDone: o.tasks, habitCheckins: o.tasks + o.focus === 0 ? 0 : 4, focusMin: o.focus, sessions: 12 }
      : { tasksDone: o.prevTasks, habitCheckins: 0, focusMin: o.prevFocus, sessions: 6 }),
    open: () => ({ tasksOpen: 3, tasksTotal: 15, sessionsToday: 1, focusMinToday: 25 }),
    streaks: () => ({ longestHabitStreak: 5, perHabit: [{ habitId: 'h', label: 'Run', streak: 5 }] }),
    byDay: () => [
      { date: '2026-11-01', taskCount: 2, habitCount: 1, focusMin: 60, sessions: 2 },
      { date: '2026-11-02', taskCount: 0, habitCount: 0, focusMin: 0, sessions: 0 },
    ],
    byDayOfWeek: () => [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dow: d as 0, tasks: d === 1 ? 5 : 0, habits: 0, focusMin: d === 1 ? 120 : 0 })),
    byHourOfDay: () => Array.from({ length: 24 }, (_, h) => ({ hour: h, tasks: h === 10 ? 4 : 0, focusMin: h === 10 ? 90 : 0 })),
    byMonth: () => [],
    events: () => [],
  } as unknown as AnalyticsResult;
}

describe('summarizeAnalytics — the text on top of Overview', () => {
  const r = { start: '2026-10-04', end: '2026-11-02' };
  const p = { start: '2026-09-04', end: '2026-10-03' };
  it('writes a headline, trends and patterns in plain language', () => {
    const s = summarizeAnalytics(engine(), r, p, 30);
    expect(s.headline).toBe('In the last 30 days you finished 12 tasks and focused 5h.');
    expect(s.sentences.join(' ')).toMatch(/up 100% on the period before/);
    expect(s.sentences.join(' ')).toMatch(/Tuesdays, around 10:00/);
    expect(s.sentences.join(' ')).toMatch(/Longest habit streak: 5 days \(Run\)/);
    expect(s.sentences.join(' ')).toMatch(/3 tasks are still open/);
    expect(s.stats.find((x) => x.key === 'focus')).toMatchObject({ value: '5h', deltaPct: 100 });
  });
  it('says so when nothing is tracked', () => {
    const s = summarizeAnalytics(engine({ tasks: 0, focus: 0 }), r, p, 7);
    expect(s.headline).toBe('Nothing tracked in the last 7 days yet.');
  });
  it('formats minutes', () => {
    expect(fmtMinutes(45)).toBe('45m');
    expect(fmtMinutes(125)).toBe('2h 5m');
  });
});
