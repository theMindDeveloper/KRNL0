import type { ClockState } from './types';
import { todayLocalYMD } from './types';

export const clockLinkTodo = (
  s: ClockState,
  args: { todoNodeId: string | null },
): ClockState => ({ ...s, linkedTodoId: args.todoNodeId });

// Decision 24.2 — replaces clockSetWindowStart (Decision 23.1).
// Pure FSM: any non-1 input collapses to 0 (defensive).
export const clockSetViewWindow = (
  s: ClockState,
  args: { window: 0 | 1 },
): ClockState => ({
  ...s,
  viewWindow: args.window === 1 ? 1 : 0,
});

// ── ADR 0004 §3.2 — day-selector commands ──────────────────────────────────

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Set the clock's selected day. Validates YYYY-MM-DD; otherwise no-op. */
export const clockSetSelectedDate = (
  s: ClockState,
  args: { date: string },
): ClockState => {
  if (typeof args.date !== 'string' || !YMD_RE.test(args.date)) return s;
  return { ...s, selectedDate: args.date };
};

/** Advance the selected day by ±1. Uses local Date arithmetic. */
export const clockAdvanceDay = (
  s: ClockState,
  args: { delta: -1 | 1 },
): ClockState => {
  const delta = args.delta === -1 ? -1 : args.delta === 1 ? 1 : 0;
  if (delta === 0) return s;
  // Parse the current YYYY-MM-DD as local-midnight (avoid UTC TZ shift).
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.selectedDate);
  if (!match) return { ...s, selectedDate: todayLocalYMD() };
  const y = Number.parseInt(match[1]!, 10);
  const mo = Number.parseInt(match[2]!, 10) - 1;
  const da = Number.parseInt(match[3]!, 10);
  const d = new Date(y, mo, da);
  d.setDate(d.getDate() + delta);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return { ...s, selectedDate: `${yy}-${mm}-${dd}` };
};

/** Reset the clock's selected day to today (local). */
export const clockGoToday = (s: ClockState): ClockState => ({
  ...s,
  selectedDate: todayLocalYMD(),
});
