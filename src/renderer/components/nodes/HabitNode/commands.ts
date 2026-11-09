// Decision #11 + Decision #14 — HabitNode pure command functions.
// Each handler is pure: (state | config, args, env?) => state | config.
// Time and id sources are injected so tests can pin them.

import type { Habit, HabitColor, HabitConfig, HabitSchedule, HabitState, HabitView, IsoDow } from './types';
import { countOn, isHabitColor, isHabitView, isValidTimeOfDay, isDayScheduled, todayLocal } from './types';

export interface HabitEnv {
  uuid: () => string;
  now: () => string;   // ISO timestamp
  today: () => string; // YYYY-MM-DD in local time
}

const defaultEnv: HabitEnv = {
  uuid: () => crypto.randomUUID(),
  now: () => new Date().toISOString(),
  today: todayLocal,
};

// Keeps log sorted descending and deduplicated.
function sortedLog(log: string[]): string[] {
  return [...new Set(log)].sort((a, b) => b.localeCompare(a));
}

export function habitAdd(
  state: HabitState,
  args: { name: string; color?: HabitColor; schedule?: unknown; kind?: unknown; perWeek?: unknown },
  env: HabitEnv = defaultEnv,
): HabitState {
  const trimmed = args.name.trim();
  const schedule = parseAddSchedule(args.schedule);
  if (!trimmed) return state;
  // Decision 39 — a routine needs days and a time; without them it is a habit.
  const routine = args.kind === 'routine' && schedule !== undefined && schedule.timeOfDay !== undefined;
  const color: HabitColor = args.color && isHabitColor(args.color) ? args.color : 'acid';
  const habit: Habit = {
    id: env.uuid(),
    name: trimmed,
    createdAt: env.now(),
    log: [],
    archived: false,
    color,
    ...(schedule ? { schedule } : {}),
    ...(routine ? { kind: 'routine' as const } : {}),
    ...(!routine && validPerWeek(args.perWeek) ? { perWeek: args.perWeek } : {}),
  };
  return { ...state, habits: [...state.habits, habit] };
}

function validPerWeek(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 6;
}

/** Set or clear a habit's weekly target (1–6 times a week; null clears). Routines: no-op. */
/** Mark or clear a rest day (sick, away, a planned break): it never breaks the streak. Routines: no-op. */
export function habitSetRest(state: HabitState, args: { id: string; date: string; rest: boolean }): HabitState {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) return state;
  return {
    ...state,
    habits: state.habits.map((h) => {
      if (h.id !== args.id || h.kind === 'routine') return h;
      const set = new Set(h.rest ?? []);
      if (args.rest) set.add(args.date); else set.delete(args.date);
      const rest = [...set].sort();
      if (rest.length === 0) { const { rest: _drop, ...without } = h; return without; }
      return { ...h, rest };
    }),
  };
}

/** Routine only: minutes before each occurrence (0–240), or null for none. */
export function habitSetRemind(state: HabitState, args: { id: string; min: number | null }): HabitState {
  return {
    ...state,
    habits: state.habits.map((h) => {
      if (h.id !== args.id || h.kind !== 'routine') return h;
      if (args.min === null) { const { remindMin: _r, ...rest } = h; return rest; }
      if (!Number.isFinite(args.min)) return h;
      return { ...h, remindMin: Math.max(0, Math.min(240, Math.round(args.min))) };
    }),
  };
}

export function habitSetTarget(state: HabitState, args: { id: string; perWeek: number | null }): HabitState {
  return {
    ...state,
    habits: state.habits.map((h) => {
      if (h.id !== args.id || h.kind === 'routine') return h;
      if (args.perWeek === null) { const { perWeek: _drop, ...rest } = h; return rest; }
      return validPerWeek(args.perWeek) ? { ...h, perWeek: args.perWeek } : h;
    }),
  };
}

// ── Amounts ("8 glasses a day", review 3.2) ───────────────────────────────────

/** Set a day's count; the day is in the log exactly when the count reaches the target. */
function withCount(h: Habit, date: string, count: number): Habit {
  if (!h.amount) return h;
  const n = Math.max(0, Math.min(999, Math.round(count)));
  const counts = { ...(h.counts ?? {}) };
  if (n === 0) delete counts[date]; else counts[date] = n;
  const done = n >= h.amount.target;
  const log = done ? (h.log.includes(date) ? h.log : sortedLog([...h.log, date])) : h.log.filter((d) => d !== date);
  const { counts: _old, ...rest } = h;
  return Object.keys(counts).length ? { ...rest, log, counts } : { ...rest, log };
}

/** `habit.setCount` — a day's count toward the amount (future days refused). */
export function habitSetCount(state: HabitState, args: { id: string; date?: string; count: number }, env: HabitEnv = defaultEnv): HabitState {
  const date = args.date ?? env.today();
  if (date > env.today() || !Number.isFinite(args.count)) return state;
  return { ...state, habits: state.habits.map((h) => (h.id === args.id && h.amount && h.kind !== 'routine' ? withCount(h, date, args.count) : h)) };
}

/** `habit.setAmount` — "8 glasses a day" (target 2–999, a short unit), or null for a plain tick. */
export function habitSetAmount(state: HabitState, args: { id: string; target: number | null; unit?: string }): HabitState {
  return {
    ...state,
    habits: state.habits.map((h) => {
      if (h.id !== args.id || h.kind === 'routine') return h;
      if (args.target === null) { const { amount: _a, counts: _c, ...rest } = h; return rest; }
      const target = Math.round(args.target);
      if (!(target >= 2 && target <= 999)) return h;
      const unit = (args.unit ?? h.amount?.unit ?? '').trim().slice(0, 24);
      // Days already ticked stay done (they count as full).
      return { ...h, amount: { target, unit } };
    }),
  };
}

// Optional repeat set while adding (Habit window's repeat picker). Anything
// malformed is dropped: the habit is still added, just unscheduled.
function parseAddSchedule(raw: unknown): HabitSchedule | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as { kind?: unknown; timeOfDay?: unknown; days?: unknown; durationMin?: unknown };
  // No time = "Any time" (Decision 39); a time, when given, must be HH:MM.
  if (r.timeOfDay !== undefined && r.timeOfDay !== null && (typeof r.timeOfDay !== 'string' || !isValidTimeOfDay(r.timeOfDay))) return undefined;
  const tod = typeof r.timeOfDay === 'string' ? { timeOfDay: r.timeOfDay } : {};
  const dur = tod.timeOfDay && typeof r.durationMin === 'number' && r.durationMin >= 5 && r.durationMin <= 480 ? { durationMin: r.durationMin } : {};
  if (r.kind === 'daily') return { kind: 'daily', ...tod, ...dur };
  if (r.kind === 'weekdays') return { kind: 'weekdays', ...tod, ...dur };
  if (r.kind === 'weekly' && Array.isArray(r.days)) {
    const days = [...new Set(r.days.filter((d): d is IsoDow => Number.isInteger(d) && d >= 1 && d <= 7))].sort((a, b) => a - b);
    if (days.length) return { kind: 'weekly', ...tod, days, ...dur };
  }
  return undefined;
}

// Toggles a date in the habit's log.
// Guard (Decision #14): any past or today date toggles; future dates are
// no-ops. Past dates earlier than the habit's createdAt are accepted because
// users want to back-fill habits they began tracking late (the user's
// "regardless if it's in the past" rule). UI visually de-emphasizes pre-
// creation cells but does not block clicks.
export function habitToggleDay(
  state: HabitState,
  args: { id: string; date?: string },
  env: HabitEnv = defaultEnv,
): HabitState {
  const today = env.today();
  const dateStr = args.date ?? today;
  if (dateStr > today) return state;        // future — hard block
  return {
    ...state,
    habits: state.habits.map((h) => {
      if (h.id !== args.id || h.kind === 'routine') return h; // Decision 39: never ticked
      // An amount ("8 glasses"): each click adds one; past the target it
      // starts again from 0. The day is done once the target is reached.
      if (h.amount) {
        const now = countOn(h, dateStr);
        return withCount(h, dateStr, now >= h.amount.target ? 0 : now + 1);
      }
      const has = h.log.includes(dateStr);
      const newLog = has
        ? h.log.filter((d) => d !== dateStr)
        : sortedLog([...h.log, dateStr]);
      return { ...h, log: newLog };
    }),
  };
}

// Ensures today is in the log (idempotent). Used by edges (e.g., pomo→habit).
export function habitMarkDone(
  state: HabitState,
  args: { id: string },
  env: HabitEnv = defaultEnv,
): HabitState {
  const dateStr = env.today();
  return {
    ...state,
    habits: state.habits.map((h) => {
      if (h.id !== args.id || h.kind === 'routine') return h; // Decision 39: never ticked
      if (h.log.includes(dateStr)) return h; // idempotent
      if (h.amount) return withCount(h, dateStr, h.amount.target);
      return { ...h, log: sortedLog([...h.log, dateStr]) };
    }),
  };
}

export function habitRename(
  state: HabitState,
  args: { id: string; name: string },
): HabitState {
  const trimmed = args.name.trim();
  if (!trimmed) return state;
  return {
    ...state,
    habits: state.habits.map((h) =>
      h.id === args.id ? { ...h, name: trimmed } : h,
    ),
  };
}

export function habitArchive(
  state: HabitState,
  args: { id: string },
): HabitState {
  return {
    ...state,
    habits: state.habits.map((h) =>
      h.id === args.id ? { ...h, archived: true } : h,
    ),
  };
}

/** Bring an archived habit or routine back, history and all. */
export function habitUnarchive(
  state: HabitState,
  args: { id: string },
): HabitState {
  return {
    ...state,
    habits: state.habits.map((h) =>
      h.id === args.id ? { ...h, archived: false } : h,
    ),
  };
}

export function habitRemove(
  state: HabitState,
  args: { id: string },
): HabitState {
  return { ...state, habits: state.habits.filter((h) => h.id !== args.id) };
}

// v2 — assign a color from the fixed palette. Unknown color → no-op.
export function habitSetColor(
  state: HabitState,
  args: { id: string; color: HabitColor },
): HabitState {
  if (!isHabitColor(args.color)) return state;
  return {
    ...state,
    habits: state.habits.map((h) =>
      h.id === args.id ? { ...h, color: args.color } : h,
    ),
  };
}

// v2 — switch view in config. Unknown view → no-op. Operates on config, not state.
export function habitSetView(
  config: HabitConfig,
  args: { view: HabitView },
): HabitConfig {
  if (!isHabitView(args.view)) return config;
  return { ...config, view: args.view };
}

// v2.1 — set per-habit icon (glyph or emoji). Empty/whitespace clears it
// (falls back to the round-robin glyph at render time).
export function habitSetIcon(
  state: HabitState,
  args: { id: string; icon: string },
): HabitState {
  const trimmed = args.icon.trim();
  return {
    ...state,
    habits: state.habits.map((h) => {
      if (h.id !== args.id) return h;
      if (trimmed === '') {
        const { icon: _ignored, ...rest } = h;
        return rest as typeof h;
      }
      return { ...h, icon: trimmed };
    }),
  };
}

// Set or clear a per-habit note. Empty/whitespace trimmed → field dropped.
export function habitSetNote(
  state: HabitState,
  args: { id: string; note: string },
): HabitState {
  const trimmed = (args.note ?? '').trim();
  return {
    ...state,
    habits: state.habits.map((h) => {
      if (h.id !== args.id) return h;
      if (trimmed === '') {
        const { note: _ignored, ...rest } = h;
        return rest as typeof h;
      }
      return { ...h, note: trimmed };
    }),
  };
}

// ADR 0002 — set or clear the schedule for a habit.
// Pure handler: returns state unchanged on invalid args (no throw).
export function habitSetSchedule(
  state: HabitState,
  args: { habitId: string; schedule: HabitSchedule | null },
): HabitState {
  const { habitId, schedule } = args;
  const habitIdx = state.habits.findIndex((h) => h.id === habitId);
  if (habitIdx === -1) return state; // no-op if habit not found

  const habit = state.habits[habitIdx]!;

  if (schedule === null) {
    // Remove the schedule field entirely — keeps board.json clean.
    const { schedule: _removed, ...rest } = habit;
    void _removed;
    const updated: Habit = rest as Habit;
    const habits = state.habits.slice();
    habits[habitIdx] = updated;
    return { ...state, habits };
  }

  // Validate timeOfDay: optional for a habit ("Any time", Decision 39),
  // required for a routine; when given it must be HH:MM.
  if (schedule.timeOfDay !== undefined && !isValidTimeOfDay(schedule.timeOfDay)) return state;
  if (habit.kind === 'routine' && schedule.timeOfDay === undefined) return state;

  let normalised: HabitSchedule;
  if (schedule.kind === 'weekly') {
    const deduped = [...new Set(schedule.days)].sort((a, b) => a - b) as IsoDow[];
    if (deduped.length === 0) {
      // Empty days = unschedule.
      const { schedule: _removed, ...rest } = habit;
      void _removed;
      const updated: Habit = rest as Habit;
      const habits = state.habits.slice();
      habits[habitIdx] = updated;
      return { ...state, habits };
    }
    normalised = {
      kind: 'weekly',
      ...(schedule.timeOfDay !== undefined ? { timeOfDay: schedule.timeOfDay } : {}),
      days: deduped,
      ...(schedule.durationMin !== undefined ? { durationMin: schedule.durationMin } : {}),
    };
  } else {
    normalised = schedule;
  }

  const updated: Habit = { ...habit, schedule: normalised };
  const habits = state.habits.slice();
  habits[habitIdx] = updated;
  return { ...state, habits };
}

// Streak = consecutive scheduled days in log walking backwards from today.
// • No schedule → every day counts (legacy behaviour).
// • Scheduled habit → only scheduled days are inspected. Non-scheduled days
//   are skipped entirely — they neither extend nor break the streak.
// • Grace (Decision #11): if the most-recent scheduled day is today and is
//   not yet logged, start counting from the previous scheduled day so the
//   user doesn't see 0 prematurely.
export function calcStreak(
  log: string[],
  today: string,
  schedule?: HabitSchedule,
  rest: readonly string[] = [],
): number {
  const logSet = new Set(log);
  const restSet = new Set(rest);
  const on = (d: string) => isDayScheduled(schedule, d) && !restSet.has(d);

  let cursor = today;
  let safety = 366;
  while (!on(cursor) && safety-- > 0) {
    cursor = prevDayStr(cursor);
  }

  if (cursor === today && !logSet.has(cursor)) {
    cursor = prevDayStr(cursor);
    safety = 366;
    while (!on(cursor) && safety-- > 0) {
      cursor = prevDayStr(cursor);
    }
  }

  let count = 0;
  while (logSet.has(cursor)) {
    count++;
    cursor = prevDayStr(cursor);
    safety = 366;
    while (!on(cursor) && safety-- > 0) {
      cursor = prevDayStr(cursor);
    }
  }
  return count;
}

// ── Weekly targets ("3 times a week") ─────────────────────────────────────────
// A week is Monday–Sunday. A week counts when it has at least `perWeek` ticks.

function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function weekCounts(log: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const day of new Set(log)) {
    const m = mondayOf(day);
    out.set(m, (out.get(m) ?? 0) + 1);
  }
  return out;
}

function shiftWeek(monday: string, weeks: number): string {
  const d = new Date(monday + 'T00:00:00');
  d.setDate(d.getDate() + weeks * 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Ticks in the week that holds `today`. */
export function ticksThisWeek(log: string[], today: string): number {
  return weekCounts(log).get(mondayOf(today)) ?? 0;
}

/** Weeks in a row that reached the target. This week counts once reached;
 *  until then it is still open and does not break the run. */
export function calcWeekStreak(log: string[], today: string, perWeek: number, rest: readonly string[] = []): number {
  const counts = weekCounts(log);
  const rested = weekCounts([...rest]);
  let week = mondayOf(today);
  if ((counts.get(week) ?? 0) < perWeek) week = shiftWeek(week, -1);
  let n = 0;
  for (let guard = 0; guard < 1000; guard++) {
    if ((counts.get(week) ?? 0) >= perWeek) n++;
    else if (!rested.has(week)) break; // a short week with rest days is skipped, not broken
    week = shiftWeek(week, -1);
    if (week < '2000-01-01') break;
  }
  return n;
}

/** Longest run of weeks that reached the target. */
export function bestWeekStreak(log: string[], perWeek: number, rest: readonly string[] = []): number {
  const counts = weekCounts(log);
  const rested = weekCounts([...rest]);
  const met = [...counts.entries()].filter(([, c]) => c >= perWeek).map(([w]) => w).sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const w of met) {
    // Same rule as the current streak: a short week with rest days between
    // two met weeks is stepped over, not a break.
    let gap = prev === null ? null : shiftWeek(prev, 1);
    while (gap !== null && gap < w && rested.has(gap) && (counts.get(gap) ?? 0) < perWeek) gap = shiftWeek(gap, 1);
    run = gap === w ? run + 1 : 1;
    best = Math.max(best, run);
    prev = w;
  }
  return best;
}

/**
 * The one streak every screen shows (node rows in every view, the lane, the
 * plan popup, the Calendar drop dialog, the CLI): a weekly target counts
 * weeks, everything else counts scheduled days; rest days never break it.
 */
export function habitStreak(
  h: { log: string[]; schedule?: HabitSchedule | null; perWeek?: number; kind?: 'routine'; rest?: string[] },
  today: string,
): { current: number; best: number; unit: 'day' | 'week' } {
  const target = h.kind !== 'routine' && typeof h.perWeek === 'number' && h.perWeek >= 1 && h.perWeek <= 6 ? h.perWeek : null;
  if (target) {
    const current = calcWeekStreak(h.log, today, target, h.rest);
    return { current, best: Math.max(current, bestWeekStreak(h.log, target, h.rest)), unit: 'week' };
  }
  const schedule = h.schedule ?? undefined;
  const current = calcStreak(h.log, today, schedule, h.rest);
  // "Best" is never below the streak shown next to it.
  return { current, best: Math.max(current, bestStreak(h.log, schedule, h.rest)), unit: 'day' };
}

function prevDayStr(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── engagement.md F16–F17 — streaks that forgive ─────────────────────────────

export const STREAK_MILESTONES = [7, 30, 100, 365] as const;

/** The next milestone above `streak` (null past the last one). */
export function nextMilestone(streak: number): number | null {
  return STREAK_MILESTONES.find((m) => m > streak) ?? null;
}

/** The milestone reached exactly today's streak, if any (shows the seal). */
export function milestoneReached(streak: number): number | null {
  return (STREAK_MILESTONES as readonly number[]).includes(streak) ? streak : null;
}

/** Longest run of consecutive scheduled days ever logged. Kept forever: it only grows. */
export function bestStreak(log: string[], schedule?: HabitSchedule, rest: readonly string[] = []): number {
  if (log.length === 0) return 0;
  const restSet = new Set(rest);
  const on = (d: string) => isDayScheduled(schedule, d) && !restSet.has(d);
  const sorted = [...new Set(log)].sort();
  const logSet = new Set(sorted);
  let best = 0;
  for (const day of sorted) {
    // A tick on an off day (a weekdays habit on Saturday) counts toward no run,
    // as for the current streak.
    if (!on(day)) continue;
    // Only start counting at the first day of a run.
    let prev = prevDayStr(day);
    let safety = 366;
    while (!on(prev) && safety-- > 0) prev = prevDayStr(prev);
    if (logSet.has(prev)) continue;
    let run = 0;
    let cursor = day;
    while (logSet.has(cursor)) {
      run++;
      let next = nextDayStr(cursor);
      safety = 366;
      while (!on(next) && safety-- > 0) next = nextDayStr(next);
      cursor = next;
    }
    best = Math.max(best, run);
  }
  return best;
}

/**
 * The scheduled day before today that broke a streak and can still be ticked
 * ("Missed yesterday? Tick it if you did it"): the last scheduled day before
 * today is not logged, but the scheduled day before that is. Null otherwise.
 */
export function repairableDay(log: string[], today: string, schedule?: HabitSchedule, rest: readonly string[] = []): string | null {
  const logSet = new Set(log);
  const restSet = new Set(rest);
  const on = (d: string) => isDayScheduled(schedule, d) && !restSet.has(d);
  let missed = prevDayStr(today);
  let safety = 366;
  while (!on(missed) && safety-- > 0) missed = prevDayStr(missed);
  if (logSet.has(missed)) return null;
  let before = prevDayStr(missed);
  safety = 366;
  while (!on(before) && safety-- > 0) before = prevDayStr(before);
  return logSet.has(before) ? missed : null;
}

function nextDayStr(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── Decision 39 — routines ───────────────────────────────────────────────────

function mapHabit(state: HabitState, id: string, fn: (h: Habit) => Habit): HabitState {
  let changed = false;
  const habits = state.habits.map((h) => {
    if (h.id !== id) return h;
    const n = fn(h);
    if (n !== h) changed = true;
    return n;
  });
  return changed ? { ...state, habits } : state;
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Turn a habit into a routine or back. A routine needs a time: refused without one. Log kept. */
export function habitSetKind(state: HabitState, args: { id: string; kind: 'routine' | 'habit' }): HabitState {
  return mapHabit(state, args.id, (h) => {
    if (args.kind === 'routine') {
      if (h.kind === 'routine' || !h.schedule || h.schedule.timeOfDay === undefined) return h;
      return { ...h, kind: 'routine' };
    }
    if (h.kind !== 'routine') return h;
    const { kind: _k, endsOn: _e, exceptions: _x, ...rest } = h;
    void _k; void _e; void _x;
    return rest as Habit;
  });
}

/** Skip (or move) one occurrence of a routine; `at` moves, `skip` skips. */
function setException(h: Habit, date: string, ex: { skip?: true; at?: string } | null): Habit {
  const rest = (h.exceptions ?? []).filter((e) => e.date !== date);
  const next = ex ? [...rest, { date, ...ex }].sort((a, b) => a.date.localeCompare(b.date)) : rest;
  const { exceptions: _x, ...base } = h;
  void _x;
  return next.length ? { ...base, exceptions: next } : (base as Habit);
}

export function routineSkip(state: HabitState, args: { id: string; date: string }): HabitState {
  if (!YMD_RE.test(args.date)) return state;
  return mapHabit(state, args.id, (h) => (h.kind === 'routine' ? setException(h, args.date, { skip: true }) : h));
}

export function routineUnskip(state: HabitState, args: { id: string; date: string }): HabitState {
  if (!YMD_RE.test(args.date)) return state;
  return mapHabit(state, args.id, (h) => (h.kind === 'routine' && h.exceptions?.some((e) => e.date === args.date) ? setException(h, args.date, null) : h));
}

export function routineMove(state: HabitState, args: { id: string; date: string; at: string }): HabitState {
  if (!YMD_RE.test(args.date) || !isValidTimeOfDay(args.at)) return state;
  return mapHabit(state, args.id, (h) => {
    if (h.kind !== 'routine') return h;
    // Moving back to its usual time just clears the exception.
    return args.at === h.schedule?.timeOfDay ? setException(h, args.date, null) : setException(h, args.date, { at: args.at });
  });
}

/** End a routine after `date` (inclusive last day). Nothing is deleted. */
export function routineEnd(state: HabitState, args: { id: string; date: string }): HabitState {
  if (!YMD_RE.test(args.date)) return state;
  return mapHabit(state, args.id, (h) => (h.kind === 'routine' ? { ...h, endsOn: args.date } : h));
}

export function routineRestart(state: HabitState, args: { id: string; today?: string }): HabitState {
  const today = args.today ?? todayLocal();
  return mapHabit(state, args.id, (h) => {
    if (h.kind !== 'routine' || h.endsOn === undefined) return h;
    const { endsOn, ...rest } = h;
    // It starts again today; the days it was ended stay empty (a class that
    // never happened is not drawn back on the Calendar).
    const from = addDayYMD(endsOn, 1);
    const to = addDayYMD(today, -1);
    if (from > to) return rest as Habit;
    return { ...rest, pauses: [...(h.pauses ?? []), { from, to }] } as Habit;
  });
}

function addDayYMD(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const t = new Date(y, m - 1, d + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
