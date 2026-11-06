// Close the day (docs/06-requirements/engagement.md F8–F11): the evening
// recap, the morning line and the Monday look-back. Pure: numbers come from
// the analytics engine; "when to show" is decided from the clock and what was
// already shown (kept per install in localStorage).

import { buildAnalytics } from '../analytics/engine';
import { addDays, dowOf, eachDay, toYMD } from '../analytics/dateRange';
import { fmtMinutes } from '../analytics/summary';
import type { BoardLike } from '../analytics/types';

export const DAY_MOMENTS_KEY = 'krnl0-day-moments';
/** From this hour on, a day with something done gets its recap. */
export const RECAP_HOUR = 21;

export interface DaySummary {
  date: string;
  done: number;
  /** Tasks scheduled on this day (done or not). */
  planned: number;
  plannedDone: number;
  plannedMin: number;
  focusMin: number;
  topStreak: { label: string; streak: number } | null;
}

export interface WeekSummary {
  start: string;
  end: string;
  done: number;
  focusMin: number;
  days: Array<{ date: string; done: number; focusMin: number }>;
  bestDay: string | null;
}

type Loose = Record<string, unknown>;

export function daySummary(board: BoardLike, date: string): DaySummary {
  const engine = buildAnalytics(board);
  const tot = engine.totals({ start: date, end: date });
  let planned = 0;
  let plannedDone = 0;
  let plannedMin = 0;
  for (const n of board.nodes) {
    if (n.kind !== 'todo.task') continue;
    const s = (n.state ?? {}) as Loose;
    const at = typeof s['scheduledFor'] === 'string' ? s['scheduledFor'] : '';
    if (!at.startsWith(date)) continue;
    planned += 1;
    if (s['done'] === true) plannedDone += 1;
    const min = typeof s['scheduledDurationMin'] === 'number' ? s['scheduledDurationMin'] : typeof s['plannedMin'] === 'number' ? s['plannedMin'] : 0;
    plannedMin += min;
  }
  const best = engine.streaks().perHabit.reduce<{ label: string; streak: number } | null>(
    (top, h) => (h.streak > 0 && (!top || h.streak > top.streak) ? { label: h.label, streak: h.streak } : top),
    null,
  );
  return { date, done: tot.tasksDone, planned, plannedDone, plannedMin, focusMin: tot.focusMin, topStreak: best };
}

/** The Monday of the week holding `date`. */
export const mondayOf = (date: string): string => addDays(date, -dowOf(date));

export function weekSummary(board: BoardLike, monday: string): WeekSummary {
  const engine = buildAnalytics(board);
  const range = { start: monday, end: addDays(monday, 6) };
  const buckets = new Map(engine.byDay(range).map((b) => [b.date, b]));
  const days = eachDay(range).map((d) => ({ date: d, done: buckets.get(d)?.taskCount ?? 0, focusMin: buckets.get(d)?.focusMin ?? 0 }));
  const tot = engine.totals(range);
  const best = days.reduce<{ date: string; score: number } | null>((b, d) => {
    const score = d.done * 30 + d.focusMin;
    return score > 0 && (!b || score > b.score) ? { date: d.date, score } : b;
  }, null);
  return { start: range.start, end: range.end, done: tot.tasksDone, focusMin: tot.focusMin, days, bestDay: best?.date ?? null };
}

export interface Seen { recap?: string; morning?: string; week?: string }

export function parseSeen(raw: string | null): Seen {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as Loose;
    const pick = (k: string) => (typeof v[k] === 'string' ? (v[k] as string) : undefined);
    const out: Seen = {};
    const r = pick('recap'); if (r) out.recap = r;
    const m = pick('morning'); if (m) out.morning = m;
    const w = pick('week'); if (w) out.week = w;
    return out;
  } catch {
    return {};
  }
}

/** Evening recap: once a day, when today's planned tasks are all done, or from 21:00 if anything got done. */
export function shouldShowRecap(day: DaySummary, nowMs: number, seen: Seen): boolean {
  if (seen.recap === day.date) return false;
  if (day.done === 0 && day.focusMin === 0) return false;
  const allPlannedDone = day.planned > 0 && day.plannedDone === day.planned;
  return allPlannedDone || new Date(nowMs).getHours() >= RECAP_HOUR;
}

/** Morning line text, once a day. Null when already seen or there is no history at all. */
export function morningLine(yesterday: DaySummary, today: string, seen: Seen, hasHistory: boolean): string | null {
  if (seen.morning === today || !hasHistory) return null;
  if (yesterday.done === 0 && yesterday.focusMin === 0) return "new day, let's go";
  const parts = [`${yesterday.done} done`];
  if (yesterday.focusMin > 0) parts.push(fmtMinutes(yesterday.focusMin));
  return `yesterday: ${parts.join(' · ')}`;
}

/** Monday look-back: the first open on a Monday, for last week, if last week had anything. */
export function shouldShowWeek(today: string, lastWeek: WeekSummary, seen: Seen): boolean {
  if (dowOf(today) !== 0) return false;
  if (seen.week === today) return false;
  return lastWeek.done > 0 || lastWeek.focusMin > 0;
}

export const ymdOf = (ms: number): string => toYMD(new Date(ms));

/** Any recorded past at all (so a brand-new board gets no "yesterday" line). */
export function boardHasHistory(board: BoardLike): boolean {
  return buildAnalytics(board).events().length > 0;
}

/** Plain text for `sys recap` and the cards' headline. */
export function dayHeadline(d: DaySummary): string {
  return `${d.done} done, ${fmtMinutes(d.focusMin)} focused.`;
}

export function weekHeadline(w: WeekSummary): string {
  const best = w.bestDay ? ` Best day: ${new Date(`${w.bestDay}T00:00:00`).toLocaleDateString('en', { weekday: 'long' })}.` : '';
  return `${w.done} done, ${fmtMinutes(w.focusMin)} focused.${best}`;
}
