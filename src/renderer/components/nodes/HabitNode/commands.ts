// Decision #11 + Decision #14 — HabitNode pure command functions.
// Each handler is pure: (state | config, args, env?) => state | config.
// Time and id sources are injected so tests can pin them.

import type { Habit, HabitColor, HabitConfig, HabitSchedule, HabitState, HabitView, IsoDow } from './types';
import { isHabitColor, isHabitView, isValidTimeOfDay, isDayScheduled, todayLocal } from './types';

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
  args: { name: string; color?: HabitColor },
  env: HabitEnv = defaultEnv,
): HabitState {
  const trimmed = args.name.trim();
  if (!trimmed) return state;
  const color: HabitColor = args.color && isHabitColor(args.color) ? args.color : 'acid';
  const habit: Habit = {
    id: env.uuid(),
    name: trimmed,
    createdAt: env.now(),
    log: [],
    archived: false,
    color,
  };
  return { ...state, habits: [...state.habits, habit] };
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
      if (h.id !== args.id) return h;
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
      if (h.id !== args.id) return h;
      if (h.log.includes(dateStr)) return h; // idempotent
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

  // Validate timeOfDay.
  if (!isValidTimeOfDay(schedule.timeOfDay)) return state;

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
      timeOfDay: schedule.timeOfDay,
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
): number {
  const logSet = new Set(log);

  let cursor = today;
  let safety = 366;
  while (!isDayScheduled(schedule, cursor) && safety-- > 0) {
    cursor = prevDayStr(cursor);
  }

  if (cursor === today && !logSet.has(cursor)) {
    cursor = prevDayStr(cursor);
    safety = 366;
    while (!isDayScheduled(schedule, cursor) && safety-- > 0) {
      cursor = prevDayStr(cursor);
    }
  }

  let count = 0;
  while (logSet.has(cursor)) {
    count++;
    cursor = prevDayStr(cursor);
    safety = 366;
    while (!isDayScheduled(schedule, cursor) && safety-- > 0) {
      cursor = prevDayStr(cursor);
    }
  }
  return count;
}

function prevDayStr(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
