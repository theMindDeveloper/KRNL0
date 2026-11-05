// Per-day clock model: which planned blocks and recorded spans fall on a given
// local day and 12-hour half. Shared by the main Clock face and the Week view
// (#207), so both draw a day the same way. Pure — no React, no clock reads.

import type { Board } from '../../../../shared/types';
import type { ScheduledTaskPlacement } from '../../../store/scheduleSelector';
import type { RealitySegment } from '../../../store/pomoReality';
import type { PomoBreakdown } from '../../../store/pomoSchedule';
import type { TaskState, TaskKind } from '../TaskNode/types';
import type { Habit, HabitSchedule, IsoDow } from '../HabitNode/types';
import type { TagDef } from '../../../../shared/tags/classify';
import { toneVarForTask } from '../../../utils/taskColor';
import { spanTone } from '../../../store/spanTags';
import { wallHoursFromDayStart } from './wallHours';

export type ClockHalf = 0 | 1;

// ── Flattened task type for display ───────────────────────────────────────────
// Entries can come from two sources: scheduled tasks (from the schedule
// selector) and habits dropped on the calendar (from habit mothers). Both
// render as arcs in the clock; habits behave like events (no breakdown).
export interface TaskEntry {
  id: string;
  start: number;   // hour-float, e.g. 9.5 = 9:30 AM — clipped to the 12-hour window (drawing)
  end: number;
  /** The real start / end (hours from the day start), unclipped — for the
   *  times the list, menus and popups show and for "ended" (F5). */
  realStart: number;
  realEnd: number;
  name: string;
  /** Resolved CSS color (a `var(--token)` string). Tasks use their tone,
   *  habits use their habit color. Single source of truth — render code
   *  reads `colorVar` directly and never re-maps from a tone token. */
  colorVar: string;
  plannedMin: number;
  /** Decision 28: null for event tasks AND habits, non-null for focus tasks. */
  breakdown: PomoBreakdown | null;
  /** Parallel group id; null if this task is sequential or a habit. */
  parallelGroupId: string | null;
  /** 0-based branch index within the parallel group; null if sequential. */
  parallelBranchIndex: number | null;
  /** 'task' or 'habit' — for future styling differentiation. */
  source: 'task' | 'habit';
  /** No duration set — the arc fades out toward its end. */
  timeOpen?: boolean;
}

export interface TaskInfo {
  done: boolean;
  plannedMin: number;
  parentTodoId: string;
  text: string;
  kind: TaskKind;
  timeOpen: boolean;
}

export interface ScheduledHabit {
  id: string;
  name: string;
  color: string;
  schedule: HabitSchedule;
}

export type DaySegment = RealitySegment & { startH: number; endH: number };

/**
 * Return hours elapsed since midnight of referenceDate (YYYY-MM-DD).
 * Cross-midnight tasks get negative startH (started yesterday) or endH > 24 (ends tomorrow).
 */
export function isoHoursFromDayStart(iso: string, referenceDate: string): number | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return null;
  const isoDate = m[1]!;
  const hh = Number.parseInt(m[2]!, 10);
  const mm = Number.parseInt(m[3]!, 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  const dayOffsetMs = new Date(isoDate).getTime() - new Date(referenceDate).getTime();
  const dayOffset = Math.round(dayOffsetMs / 86400000);
  return dayOffset * 24 + hh + mm / 60;
}

/** Check if a habit schedule fires on a given ISO day-of-week. */
export function habitOnDow(schedule: HabitSchedule, isoDow: IsoDow): boolean {
  switch (schedule.kind) {
    case 'daily': return true;
    case 'weekly': return schedule.days.includes(isoDow);
    case 'weekdays': return isoDow >= 1 && isoDow <= 5;
  }
}

/** Local Date at midnight of a YYYY-MM-DD (falls back to today). */
export function ymdToDate(ymd: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return new Date();
  return new Date(Number.parseInt(m[1]!, 10), Number.parseInt(m[2]!, 10) - 1, Number.parseInt(m[3]!, 10));
}

/** ISO day-of-week (1=Mon..7=Sun) of a YYYY-MM-DD. */
export function isoDowOf(ymd: string): IsoDow {
  const js = ymdToDate(ymd).getDay();
  return (js === 0 ? 7 : js) as IsoDow;
}

/** `n` local days ending with `today`, newest first ("YYYY-MM-DD"). */
export function lastNDays(today: string, n: number): string[] {
  const base = ymdToDate(today);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return out;
}

/** Task facts the dial needs, by task id. */
export function collectTaskInfo(board: Pick<Board, 'nodes'> | null): Map<string, TaskInfo> {
  const m = new Map<string, TaskInfo>();
  if (!board) return m;
  for (const n of board.nodes) {
    if (n.kind !== 'todo.task') continue;
    const ts = n.state as TaskState;
    m.set(n.id, {
      done: ts.done,
      plannedMin: ts.plannedMin ?? ts.durationMin,
      parentTodoId: ts.parentTodoId,
      text: ts.text,
      kind: ts.kind ?? 'focus',
      timeOpen: ts.timeOpen === true,
    });
  }
  return m;
}

/** Scheduled habits — same source the Calendar WeekView consumes (ADR 0002 §6). */
export function collectScheduledHabits(board: Pick<Board, 'nodes'> | null): ScheduledHabit[] {
  const out: ScheduledHabit[] = [];
  if (!board) return out;
  for (const n of board.nodes) {
    if (n.kind !== 'habit') continue;
    const hs = n.state as { habits?: Habit[] } | null;
    if (!hs?.habits) continue;
    for (const h of hs.habits) {
      if (h.archived || !h.schedule) continue;
      out.push({ id: h.id, name: h.name, color: h.color ?? 'acid', schedule: h.schedule });
    }
  }
  return out;
}

/** Planned blocks (event tasks + scheduled habits) on `ymd`, clipped to `half`. */
export function planForDay(
  placements: Iterable<ScheduledTaskPlacement>,
  taskInfo: ReadonlyMap<string, TaskInfo>,
  habits: readonly ScheduledHabit[],
  ymd: string,
  half: ClockHalf,
): TaskEntry[] {
  const winLo = half === 1 ? 12 : 0;
  const winHi = half === 1 ? 24 : 12;
  const out: TaskEntry[] = [];

  // 1) Scheduled tasks from the selector.
  // Use day-relative hours so cross-midnight tasks (startH<0 or endH>24) are handled correctly.
  for (const p of placements) {
    const info = taskInfo.get(p.taskId);
    if (!info || info.kind !== 'event') continue;
    const startH = isoHoursFromDayStart(p.startISO, ymd);
    if (startH === null) continue;
    const endHRaw = isoHoursFromDayStart(p.endISO, ymd);
    const endH = endHRaw !== null ? endHRaw : startH + info.plannedMin / 60;
    if (endH <= startH) continue;
    // Skip if the task doesn't overlap this day at all (0–24).
    if (endH <= 0 || startH >= 24) continue;
    if (endH <= winLo || startH >= winHi) continue;
    out.push({
      id: p.taskId,
      start: Math.max(startH, winLo),
      end: Math.min(endH, winHi),
      realStart: startH,
      realEnd: endH,
      name: info.text,
      colorVar: toneVarForTask(p.taskId),
      plannedMin: info.plannedMin,
      breakdown: p.breakdown,
      parallelGroupId: p.parallelGroupId,
      parallelBranchIndex: p.parallelBranchIndex,
      source: 'task',
      timeOpen: info.timeOpen,
    });
  }

  // 2) Scheduled habits that fire on that day.
  const dow = isoDowOf(ymd);
  for (const h of habits) {
    if (!habitOnDow(h.schedule, dow)) continue;
    const [hhStr, mmStr] = h.schedule.timeOfDay.split(':');
    const hh = Number.parseInt(hhStr ?? '0', 10);
    const mm = Number.parseInt(mmStr ?? '0', 10);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) continue;
    const durMin = h.schedule.durationMin && h.schedule.durationMin > 0 ? h.schedule.durationMin : 30;
    const startH = hh + mm / 60;
    const endH = startH + durMin / 60;
    if (endH <= winLo || startH >= winHi) continue;
    out.push({
      id: `habit-${h.id}`,
      start: Math.max(startH, winLo),
      end: Math.min(endH, winHi),
      realStart: startH,
      realEnd: endH,
      name: h.name,
      colorVar: `var(--${h.color})`,
      plannedMin: durMin,
      breakdown: null, // habits = single block (event-like)
      parallelGroupId: null,
      parallelBranchIndex: null,
      source: 'habit',
    });
  }

  out.sort((a, b) => a.start - b.start);
  return out;
}

/**
 * Issue #166 — recorded spans on `ymd`, clipped to `half`. A span over
 * midnight lands on both days, each part clipped to its own day (F8).
 */
export function realityForDay(segs: readonly RealitySegment[], ymd: string, half: ClockHalf): DaySegment[] {
  const winLo = half === 1 ? 12 : 0;
  const winHi = half === 1 ? 24 : 12;
  const out: DaySegment[] = [];
  for (const seg of segs) {
    const startH = wallHoursFromDayStart(seg.startMs, ymd);
    const endH = wallHoursFromDayStart(seg.endMs, ymd);
    if (!(endH > startH)) continue;
    if (endH <= 0 || startH >= 24) continue;
    if (endH <= winLo || startH >= winHi) continue;
    out.push({ ...seg, startH: Math.max(startH, winLo), endH: Math.min(endH, winHi) });
  }
  return out;
}

export interface DayTopTask {
  name: string;
  min: number;
  tone: string;
}

export interface DaySummary {
  /** Recorded work minutes inside the day (midnight-split). */
  focusMin: number;
  /** The task (or free-text span) with the most work minutes that day. */
  top: DayTopTask | null;
}

/** Focus total and top task for one local day, from the recorded spans. */
export function summarizeDay(
  segs: readonly RealitySegment[],
  ymd: string,
  taskInfo: ReadonlyMap<string, TaskInfo>,
  library: readonly TagDef[],
  plain = false,
): DaySummary {
  const d = ymdToDate(ymd);
  const dayStart = d.getTime();
  const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  const byKey = new Map<string, DayTopTask & { ms: number }>();
  let totalMs = 0;
  for (const seg of segs) {
    if (seg.kind !== 'work') continue;
    const ms = Math.min(seg.endMs, dayEnd) - Math.max(seg.startMs, dayStart);
    if (ms <= 0) continue;
    totalMs += ms;
    const key = seg.taskId ? `task:${seg.taskId}` : `label:${seg.label.trim().toLowerCase()}`;
    const name = (seg.taskId ? taskInfo.get(seg.taskId)?.text : undefined) || seg.label.trim() || 'untagged';
    const prev = byKey.get(key);
    if (prev) prev.ms += ms;
    else byKey.set(key, { name, min: 0, tone: spanTone(library, seg, plain), ms });
  }
  let top: (DayTopTask & { ms: number }) | null = null;
  for (const v of byKey.values()) if (!top || v.ms > top.ms) top = v;
  return {
    focusMin: Math.round(totalMs / 60_000),
    top: top ? { name: top.name, min: Math.round(top.ms / 60_000), tone: top.tone } : null,
  };
}

/** "4h 12m" / "45m" / "0m". */
export function fmtMinutes(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return r ? `${h}h ${r}m` : `${h}h`;
}
