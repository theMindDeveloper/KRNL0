// Decision #11 + Decision #14 — HabitNode state contract (v2).
// Persistence rule: store a sparse log of YYYY-MM-DD strings (local time).
// Week grid, month grid, year grid, and streak are always derived at render
// time — never stored. View selection lives in config.view; per-habit color
// lives on each Habit. Past-day backfill is bounded by [habit.createdAt,
// today]; future dates remain non-interactive.

export type HabitColor =
  | 'acid' | 'rust' | 'cyan' | 'plum' | 'spine' | 'ink'
  | 'amber' | 'rose' | 'teal' | 'lilac' | 'sand' | 'moss';

export const HABIT_COLORS: readonly HabitColor[] = [
  'acid',
  'rust',
  'cyan',
  'plum',
  'spine',
  'ink',
  'amber',
  'rose',
  'teal',
  'lilac',
  'sand',
  'moss',
] as const;

export function isHabitColor(value: unknown): value is HabitColor {
  return typeof value === 'string' && (HABIT_COLORS as readonly string[]).includes(value);
}

export type HabitView = 'week' | 'month' | 'year';

export const HABIT_VIEWS: readonly HabitView[] = ['week', 'month', 'year'] as const;

export function isHabitView(value: unknown): value is HabitView {
  return typeof value === 'string' && (HABIT_VIEWS as readonly string[]).includes(value);
}

// ADR 0002 — HabitSchedule discriminated union.
// ISO day-of-week, 1 = Monday … 7 = Sunday. Matches ISO-8601.
export type IsoDow = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type HabitSchedule =
  | { kind: 'daily'; timeOfDay: string; durationMin?: number }
  | { kind: 'weekly'; timeOfDay: string; days: IsoDow[]; durationMin?: number }
  | { kind: 'weekdays'; timeOfDay: string; durationMin?: number };

export const TIME_OF_DAY_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function isValidTimeOfDay(t: string): boolean {
  return TIME_OF_DAY_RE.test(t);
}

// ISO day-of-week (1=Mon..7=Sun) for a YYYY-MM-DD local-date string.
export function isoDowOf(dateStr: string): IsoDow {
  const d = new Date(dateStr + 'T00:00:00');
  const js = d.getDay(); // 0=Sun..6=Sat
  return (js === 0 ? 7 : js) as IsoDow;
}

// Whether a given local date is a scheduled occurrence under `schedule`.
// Absent schedule → every day is scheduled (legacy / unscheduled habits).
export function isDayScheduled(
  schedule: HabitSchedule | undefined,
  dateStr: string,
): boolean {
  if (!schedule) return true;
  if (schedule.kind === 'daily') return true;
  const dow = isoDowOf(dateStr);
  if (schedule.kind === 'weekdays') return dow >= 1 && dow <= 5;
  // weekly
  return schedule.days.includes(dow);
}

export interface Habit {
  id: string;           // crypto.randomUUID()
  name: string;
  createdAt: string;    // ISO 8601
  log: string[];        // ['2026-05-10', ...] — sorted desc, unique, local YYYY-MM-DD
  archived: boolean;    // default false; archived habits hidden from grid
  color: HabitColor;    // v2 — default 'acid'
  icon?: string;        // v2.1 — optional glyph/emoji; falls back to round-robin glyph
  schedule?: HabitSchedule; // ADR 0002 — absence = unscheduled
  note?: string;        // free-form text shown under the habit row
}

// Built-in icon palette presented in the context menu. Mix of mono glyphs
// and emoji so users can pick something representational. Single grapheme.
export const HABIT_ICONS: readonly string[] = [
  '✎', '↗', '◍', '⌬', '◆', '▷', '○', '✦',
  '🧘', '🏃', '📖', '💧', '🛌', '🥗', '🧠', '💪',
  '☕', '🎯', '🌱', '🎵', '🧹', '✍️', '☀️', '🌙',
];

export interface HabitState {
  habits: Habit[];
}

export interface HabitConfig {
  weekStartsOn: 'monday';   // locked for v1
  view: HabitView;          // v2 — default 'week'
  maxHabits?: number;       // tolerated legacy seed field; no enforcement
}

export const defaultHabitState = (): HabitState => ({ habits: [] });

export const defaultHabitConfig = (): HabitConfig => ({
  weekStartsOn: 'monday',
  view: 'week',
});

// Returns YYYY-MM-DD in local time for the given Date.
export function toYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Returns today's date as YYYY-MM-DD in local time.
export function todayLocal(): string {
  return toYMD(new Date());
}

// Returns a new Date set to the Monday of the week containing `date` (local time).
export function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Returns YYYY-MM-DD for each of Mon–Sun of the week that contains `date`.
export function getWeekDays(date: Date): string[] {
  const monday = getMondayOf(date);
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    days.push(toYMD(d));
  }
  return days;
}

// Returns the YYYY-MM-DD for the day before `dateStr`.
export function prevDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return toYMD(d);
}

// Returns the YMD anchor of an ISO timestamp interpreted in local time.
// Used to derive a habit's "earliest interactive day" from createdAt.
export function isoToLocalYMD(iso: string): string {
  return toYMD(new Date(iso));
}

// Returns the YYYY-MM-DD list of every day in the calendar month containing
// `date`, from day 1 to last day, in ascending order.
export function getMonthDays(date: Date): string[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const last = new Date(year, month + 1, 0).getDate();
  const out: string[] = [];
  for (let day = 1; day <= last; day++) {
    out.push(toYMD(new Date(year, month, day)));
  }
  return out;
}

// Builds a 53-column × 7-row grid (GitHub contribution style) of YMDs anchored
// so that `today` lands on the last column's row matching today's weekday
// (Mon=0..Sun=6). Cells before the rolling 1-year window are returned as null.
// Result layout: 7 rows × 53 cols => cells[row][col].
export function getYearGridCells(today: Date): (string | null)[][] {
  const grid: (string | null)[][] = [];
  for (let r = 0; r < 7; r++) grid.push(new Array(53).fill(null));

  // Today's column = 52 (rightmost). Today's row = weekday with Mon=0.
  const todayDow = (today.getDay() + 6) % 7; // shift Sun=0 to Sun=6
  const startDate = new Date(today);
  startDate.setHours(0, 0, 0, 0);
  startDate.setDate(startDate.getDate() - (52 * 7 + todayDow));

  for (let col = 0; col < 53; col++) {
    for (let row = 0; row < 7; row++) {
      const dayOffset = col * 7 + row;
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + dayOffset);
      // Stop after today's cell — anything past is null (future suppressed).
      if (d > today) {
        grid[row]![col] = null;
      } else {
        grid[row]![col] = toYMD(d);
      }
    }
  }
  return grid;
}
