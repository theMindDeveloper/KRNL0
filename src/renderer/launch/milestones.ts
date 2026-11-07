// Milestone cards (launch-experience.md F20–F23).
//
// Pure: which milestone was just reached. A habit streak of 7, 30, 100 or 365
// days, or the 10th, 100th or 500th focus session. A card shows a habit name
// and a number only — never tasks or times of day. Each milestone is shown
// once (ids kept in app-state.json) and only while Celebrations is on.

import { calcStreak } from '../components/nodes/HabitNode/commands';
import type { HabitSchedule } from '../components/nodes/HabitNode/types';
import { bestStreak } from './catchup';

/** The Habit node's milestones (its seal shows on the same days). */
export { STREAK_MILESTONES } from '../components/nodes/HabitNode/commands';
import { STREAK_MILESTONES } from '../components/nodes/HabitNode/commands';
export const SESSION_MILESTONES = [10, 100, 500] as const;

export type Milestone =
  | {
      id: string; kind: 'streak'; value: number; habit: string; best: boolean;
      /** The habit's done days ("YYYY-MM-DD"), for the card's day grid. */
      log: string[];
      /** Days done in all (the story card's "140 days"). */
      total: number;
    }
  | {
      id: string; kind: 'sessions'; value: number; focusedMs: number;
      /** Focused ms per week, the last 12 weeks, oldest first (the card's bars). */
      weeks: number[];
    };

interface NodeLike { kind: string; isMother?: boolean; state?: unknown }

const rec = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});

/** Every focus session ever finished (work spans that reached the session length). */
export function focusStats(nodes: readonly NodeLike[], sinceMs = 0): { sessions: number; focusedMs: number } {
  const pomo = nodes.find((n) => n.kind === 'pomo' && n.isMother === true);
  const history = rec(pomo?.state)['history'];
  let sessions = 0;
  let focusedMs = 0;
  if (!Array.isArray(history)) return { sessions, focusedMs };
  for (const raw of history) {
    const r = rec(raw);
    if ((r['kind'] ?? 'work') !== 'work') continue;
    if (r['completed'] === true) sessions++;
    const a = Date.parse(String(r['startedAt']));
    const b = Date.parse(String(r['endedAt']));
    if (Number.isFinite(a) && Number.isFinite(b) && b > a && a >= sinceMs) focusedMs += b - a;
  }
  return { sessions, focusedMs };
}

export interface HabitStreak { id: string; name: string; current: number; best: number; log: string[] }

/** Focused ms per week for the last `n` weeks, oldest first. */
export function weeklyFocus(nodes: readonly NodeLike[], nowMs: number, n = 12): number[] {
  const pomo = nodes.find((x) => x.kind === 'pomo' && x.isMother === true);
  const history = rec(pomo?.state)['history'];
  const weeks = new Array<number>(n).fill(0);
  if (!Array.isArray(history)) return weeks;
  const WEEK = 7 * 86_400_000;
  for (const raw of history) {
    const r = rec(raw);
    if ((r['kind'] ?? 'work') !== 'work') continue;
    const a = Date.parse(String(r['startedAt']));
    const b = Date.parse(String(r['endedAt']));
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) continue;
    const ago = Math.floor((nowMs - a) / WEEK);
    if (ago >= 0 && ago < n) weeks[n - 1 - ago]! += b - a;
  }
  return weeks;
}

export function habitStreaks(nodes: readonly NodeLike[], today: string): HabitStreak[] {
  const mother = nodes.find((n) => n.kind === 'habit' && n.isMother === true);
  const list = rec(mother?.state)['habits'];
  if (!Array.isArray(list)) return [];
  const out: HabitStreak[] = [];
  for (const raw of list) {
    const h = rec(raw);
    if (h['archived'] === true || typeof h['id'] !== 'string') continue;
    const log = Array.isArray(h['log']) ? h['log'].filter((d): d is string => typeof d === 'string') : [];
    const schedule = h['schedule'] as HabitSchedule | undefined;
    out.push({ id: h['id'], name: String(h['name'] ?? 'Habit'), current: calcStreak(log, today, schedule), best: bestStreak(log, schedule), log });
  }
  return out;
}

/**
 * The milestone reached right now that hasn't been shown yet, or null. A
 * streak counts on the day it hits the number exactly, so a long streak that
 * existed before this feature doesn't pop a card for an old number.
 */
/** How far past a milestone it still counts as just reached: a repaired day
 *  can lift a streak from 1 to 8, logged past time can add two sessions. */
const STREAK_GRACE = 3;
const SESSION_GRACE = 5;

/** The highest milestone in `list` that `n` reached recently (n ≥ m, within grace). */
function reached(list: readonly number[], n: number, grace: number, isSeen: (m: number) => boolean): number | null {
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i]!;
    if (n >= m && n < m + grace) return isSeen(m) ? null : m;
  }
  return null;
}

export function findNewMilestone(nodes: readonly NodeLike[], today: string, seen: readonly string[], nowMs = Date.now()): Milestone | null {
  const done = new Set(seen);
  for (const h of habitStreaks(nodes, today)) {
    const m = reached(STREAK_MILESTONES, h.current, STREAK_GRACE, (v) => done.has(`streak:${h.id}:${v}`));
    if (m !== null) {
      return { id: `streak:${h.id}:${m}`, kind: 'streak', value: m, habit: h.name, best: h.best <= h.current, log: h.log, total: new Set(h.log).size };
    }
  }
  const twelveWeeks = nowMs - 84 * 86_400_000;
  const { sessions } = focusStats(nodes);
  const m = reached(SESSION_MILESTONES, sessions, SESSION_GRACE, (v) => done.has(`sessions:${v}`));
  if (m !== null) {
    return { id: `sessions:${m}`, kind: 'sessions', value: m, focusedMs: focusStats(nodes, twelveWeeks).focusedMs, weeks: weeklyFocus(nodes, nowMs) };
  }
  return null;
}

/** "83h 20m". */
export function formatFocused(ms: number): string {
  const min = Math.round(ms / 60_000);
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;
}

/** The headline under the number on the in-app notice. */
export function milestoneLine(m: Milestone): { title: string; sub: string } {
  if (m.kind === 'streak') {
    return { title: `${m.value} days of ${m.habit}.`, sub: m.best ? 'Your longest streak yet.' : 'Keep it going.' };
  }
  return { title: `${m.value} focus sessions.`, sub: `${formatFocused(m.focusedMs)} focused in the last 12 weeks.` };
}

/** Preview / `krnl share`: a card for what the board shows now, milestone or not. */
export function shareCardFor(nodes: readonly NodeLike[], today: string, what: { kind: 'streak'; habit?: string } | { kind: 'sessions' }, nowMs = Date.now()): Milestone | null {
  if (what.kind === 'sessions') {
    const { sessions } = focusStats(nodes);
    return { id: 'share:sessions', kind: 'sessions', value: sessions, focusedMs: focusStats(nodes, nowMs - 84 * 86_400_000).focusedMs, weeks: weeklyFocus(nodes, nowMs) };
  }
  const streaks = habitStreaks(nodes, today);
  const q = what.habit?.trim().toLowerCase();
  const h = q
    ? streaks.find((s) => s.name.toLowerCase() === q) ?? streaks.find((s) => s.name.toLowerCase().includes(q))
    : [...streaks].sort((a, b) => b.current - a.current)[0];
  if (!h) return null;
  return { id: `share:${h.id}`, kind: 'streak', value: h.current, habit: h.name, best: h.current >= h.best, log: h.log, total: new Set(h.log).size };
}

/** Every card the board can make right now: each habit's streak, then focus sessions (the share window's list). */
export function allShareCards(nodes: readonly NodeLike[], today: string, nowMs = Date.now()): Milestone[] {
  const out: Milestone[] = [];
  for (const h of habitStreaks(nodes, today)) {
    if (h.current < 1) continue; // nothing to share yet
    out.push({ id: `share:${h.id}`, kind: 'streak', value: h.current, habit: h.name, best: h.current >= h.best, log: h.log, total: new Set(h.log).size });
  }
  // No card for zero sessions: a brand-new board has nothing to share yet.
  const s = shareCardFor(nodes, today, { kind: 'sessions' }, nowMs);
  if (s && s.value > 0) out.push(s);
  return out;
}
