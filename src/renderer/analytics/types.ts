// Issue #134 — Analytics module public types.
//
// The engine is pluggable: each "data source" maps a Board snapshot to a list
// of AnalyticsEvent records. Selectors operate on the merged event stream — no
// selector imports a concrete node type. To add a new metric source (say, a
// future KRNL "journal" node), implement AnalyticsDataSource, register it via
// `registerDataSource`, and every existing chart picks it up automatically.

export type AnalyticsEventType =
  | 'task.completed'
  | 'habit.checkin'
  | 'pomo.session'
  | string;

export interface AnalyticsEvent {
  /** Source id (e.g. 'task', 'habit', 'pomo'). */
  source: string;
  /** Event type within the source. Sources may emit more than one. */
  type: AnalyticsEventType;
  /** Local YYYY-MM-DD this event belongs to. Used for date-bucketing. */
  date: string;
  /** ISO 8601 timestamp when the event happened. Optional — sources that only
   *  know a date (e.g. habit check-ins) can omit it. Hour-of-day buckets skip
   *  events without an ISO timestamp. */
  isoTimestamp?: string;
  /** Optional minutes of focus / work associated with this event. */
  durationMin?: number;
  /** Free-form payload — kept for future selectors (correlation, tagging). */
  metadata?: Record<string, unknown>;
}

export interface DayBucket {
  date: string;          // YYYY-MM-DD, local
  taskCount: number;     // tasks completed on this date
  habitCount: number;    // habit check-ins on this date
  focusMin: number;      // sum of completed pomo durationMin on this date
  sessions: number;      // completed pomo session count on this date
}

export interface RangeArg {
  start: string; // inclusive YYYY-MM-DD
  end: string;   // inclusive YYYY-MM-DD
}

export interface DowBucket {
  dow: 0 | 1 | 2 | 3 | 4 | 5 | 6; // Mon=0 … Sun=6 (ISO-style, shifted)
  tasks: number;
  habits: number;
  focusMin: number;
}

export interface HourBucket {
  hour: number; // 0..23
  tasks: number;
  focusMin: number;
}

export interface MonthBucket {
  month: number; // 1..12
  tasks: number;
  habits: number;
  focusMin: number;
}

export interface Totals {
  tasksDone: number;
  habitCheckins: number;
  focusMin: number;
  sessions: number;
}

export interface StreakResult {
  longestHabitStreak: number;
  perHabit: Array<{ habitId: string; label: string; streak: number }>;
}

export interface OpenCounters {
  tasksOpen: number;
  tasksTotal: number;
  sessionsToday: number;
  focusMinToday: number;
}

export interface AnalyticsResult {
  byDay(range: RangeArg): DayBucket[];
  totals(range: RangeArg): Totals;
  streaks(): StreakResult;
  open(): OpenCounters;
  byDayOfWeek(range: RangeArg): DowBucket[];
  byHourOfDay(range: RangeArg): HourBucket[];
  byMonth(year: number): MonthBucket[];
  /** Escape hatch — exposes the merged, filtered event stream for custom
   *  consumers (used by the AnalyticsNode "Raw events" panel and tests). */
  events(): readonly AnalyticsEvent[];
}

// ── Loose coupling: every data source is a pure (board) -> events function ──

export interface AnalyticsDataSource {
  /** Stable identifier — must be unique across registered sources. */
  id: string;
  /** Human-readable label shown in the AnalyticsNode header. */
  label: string;
  /** Pure: map the current Board snapshot to AnalyticsEvent records. */
  collect(board: BoardLike): AnalyticsEvent[];
}

/** Minimal board shape the engine reads. Decoupled from boardStore so sources
 *  can be unit-tested without spinning up Zustand. */
export interface BoardLike {
  nodes: ReadonlyArray<{
    id: string;
    kind: string;
    state: unknown;
    isMother?: boolean;
  }>;
}
