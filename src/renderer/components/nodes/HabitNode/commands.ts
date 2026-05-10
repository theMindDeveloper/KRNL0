// Decision #11 — HabitNode pure command functions.
// Each handler is pure: (state, args, env?) => state.
// Time and id sources are injected so tests can pin them.

import type { Habit, HabitState } from './types';
import { todayLocal } from './types';

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
  args: { name: string },
  env: HabitEnv = defaultEnv,
): HabitState {
  const trimmed = args.name.trim();
  if (!trimmed) return state;
  const habit: Habit = {
    id: env.uuid(),
    name: trimmed,
    createdAt: env.now(),
    log: [],
    archived: false,
  };
  return { ...state, habits: [...state.habits, habit] };
}

export function habitToggleDay(
  state: HabitState,
  args: { id: string; date?: string },
  env: HabitEnv = defaultEnv,
): HabitState {
  const dateStr = args.date ?? env.today();
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

// Streak = consecutive days in log ending at today (if present) or yesterday.
// If today is not yet marked, start from yesterday so user doesn't see 0 prematurely.
// Decision #11: "if today is not yet marked, the streak ends at yesterday so the
// user does not see '0' before completing today's check."
export function calcStreak(log: string[], today: string): number {
  const logSet = new Set(log);
  let count = 0;
  // Start cursor at today if logged; otherwise start at yesterday.
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
