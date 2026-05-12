// Decision #11 + Decision #14 — HabitNode pure command functions.
// Each handler is pure: (state | config, args, env?) => state | config.
// Time and id sources are injected so tests can pin them.

import type { Habit, HabitColor, HabitConfig, HabitState, HabitView } from './types';
import { isHabitColor, isHabitView, todayLocal } from './types';

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

// Streak = consecutive days in log ending at today (if present) or yesterday.
// If today is not yet marked, start from yesterday so the user doesn't see 0
// prematurely (Decision #11).
export function calcStreak(log: string[], today: string): number {
  const logSet = new Set(log);
  let count = 0;
  let cursor = logSet.has(today) ? today : prevDayStr(today);
  while (logSet.has(cursor)) {
    count++;
    cursor = prevDayStr(cursor);
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
