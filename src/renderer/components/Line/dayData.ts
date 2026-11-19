// One day as marks on a line (docs/06-requirements/line-layout.md).
// Pure: a board and a day in, marks out. The Line layout draws only this, so
// the line, the clock, the week and the list always agree.

import type { Board } from '../../../shared/types';
import { droppedTaskIds } from '../../../shared/droppedPlans';
import { addDaysYMD, localYMD } from '../../../shared/ymd';
import { selectSchedule } from '../../store/scheduleSelector';
import type { PomoState } from '../nodes/PomoNode/types';
import type { TaskState } from '../nodes/TaskNode/types';
import type { TodoItem, TodoState } from '../nodes/TodoNode/types';
import { countOn, isDayScheduled, routineSpansOn, weeklyTarget, type Habit, type HabitState } from '../nodes/HabitNode/types';
import { habitStreak, ticksThisWeek } from '../nodes/HabitNode/commands';

export type PlanStateName = 'done' | 'covered' | 'missed' | 'open';

export interface PlanMark {
  id: string;
  /** Null for a repeating event (never ticked). */
  taskId: string | null;
  text: string;
  startMs: number;
  endMs: number;
  /** done = ticked; covered = recorded through most of it; missed = its time passed. */
  state: PlanStateName;
  kind: 'plan' | 'event';
  /** Work recorded during its slot. */
  recordedMs: number;
}

export interface RealMark {
  id: string;
  startMs: number;
  endMs: number;
  label: string;
  kind: 'work' | 'break';
  live: boolean;
  color: string;
}

export interface GapMark { startMs: number; endMs: number }

export interface AnyTimeRow { itemId: string; taskId: string | null; text: string; done: boolean }

export interface DayData {
  day: string;
  /** Local midnight and the next one, epoch ms. */
  d0: number;
  d1: number;
  plans: PlanMark[];
  real: RealMark[];
  gaps: GapMark[];
  /** Plans on this day with no time. */
  anyTime: AnyTimeRow[];
  totals: Array<{ label: string; color: string; ms: number }>;
  /** Time inside the gaps: nothing was recorded and nobody named it. */
  unnamedMs: number;
}

/** A stretch with nothing recorded is only marked from this length. */
export const MIN_GAP_MS = 30 * 60_000;
/** A plan counts as covered once this share of it was recorded. */
export const COVERED_SHARE = 0.5;
/** What a recorded span is called when nobody named it. */
export const UNNAMED = 'Recorded';

const PALETTE = ['var(--cyan)', 'var(--lilac)', 'var(--amber)', 'var(--teal)', 'var(--rose)', 'var(--plum)'] as const;

/** One colour per activity name, the same on every screen. */
export function colorFor(label: string): string {
  const key = label.trim().toLowerCase();
  if (!key || key === UNNAMED.toLowerCase()) return PALETTE[0];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

const localMs = (iso: string): number => new Date(iso.length >= 16 ? iso.slice(0, 16) : iso).getTime();
const mother = (b: Board, kind: string) => b.nodes.find((n) => n.kind === kind && n.isMother) ?? b.nodes.find((n) => n.kind === kind);
export const pomoOf = (b: Board | null): PomoState | null => (b ? (mother(b, 'pomo')?.state as PomoState | undefined) ?? null : null);
export const todoOf = (b: Board | null): TodoState | null => (b ? (mother(b, 'todo')?.state as TodoState | undefined) ?? null : null);
export const habitsOf = (b: Board | null): Habit[] => (b ? ((mother(b, 'habit')?.state as HabitState | undefined)?.habits ?? []) : []);

export function dayBounds(day: string): { d0: number; d1: number } {
  return { d0: new Date(`${day}T00:00:00`).getTime(), d1: new Date(`${addDaysYMD(day, 1)}T00:00:00`).getTime() };
}

/** What was recorded on a day (work and breaks), with the live span up to now. */
export function realMarks(board: Board | null, day: string, nowMs: number): RealMark[] {
  const ps = pomoOf(board);
  if (!board || !ps) return [];
  const { d0, d1 } = dayBounds(day);
  const taskText = (id: string | null | undefined): string => {
    if (!id) return '';
    const n = board.nodes.find((x) => x.id === id);
    return n ? String((n.state as TaskState).text ?? '') : '';
  };
  const out: RealMark[] = [];
  const push = (id: string, a: number, b: number, kind: 'work' | 'break', rawLabel: string, live: boolean): void => {
    const startMs = Math.max(d0, a);
    const endMs = Math.min(d1, b);
    if (!(endMs > startMs)) return;
    const label = kind === 'break' ? 'Break' : rawLabel.trim() || UNNAMED;
    out.push({ id, startMs, endMs, label, kind, live, color: kind === 'break' ? 'var(--ink-4)' : colorFor(label) });
  };
  for (const r of ps.history ?? []) {
    push(r.id, Date.parse(r.startedAt), Date.parse(r.endedAt), r.kind === 'break' ? 'break' : 'work', r.label || taskText(r.taskId), false);
  }
  if ((ps.status === 'running' || ps.status === 'break') && ps.startedAt) {
    push('live', Date.parse(ps.startedAt), nowMs, ps.status === 'break' ? 'break' : 'work', ps.label || taskText(ps.activeTaskId), true);
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

/** Long stretches between recorded spans (and up to now, today) that nobody named. */
export function gapMarks(real: readonly RealMark[], day: string, nowMs: number): GapMark[] {
  if (real.length === 0) return [];
  const { d0, d1 } = dayBounds(day);
  const out: GapMark[] = [];
  for (let i = 1; i < real.length; i++) {
    const a = real[i - 1]!.endMs;
    const b = real[i]!.startMs;
    if (b - a >= MIN_GAP_MS) out.push({ startMs: a, endMs: b });
  }
  const last = real[real.length - 1]!;
  const isToday = nowMs >= d0 && nowMs < d1;
  if (isToday && !last.live && nowMs - last.endMs >= MIN_GAP_MS) out.push({ startMs: last.endMs, endMs: nowMs });
  return out;
}

const overlap = (a0: number, a1: number, b0: number, b1: number): number => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

/** The plans on a day: timed plans from the schedule, and repeating events. */
export function planMarks(board: Board | null, day: string, nowMs: number, real: readonly RealMark[]): PlanMark[] {
  if (!board) return [];
  const { d0, d1 } = dayBounds(day);
  const dropped = droppedTaskIds(board.nodes);
  const out: PlanMark[] = [];
  for (const p of selectSchedule(board).placements.values()) {
    if (dropped.has(p.taskId)) continue;
    const node = board.nodes.find((n) => n.id === p.taskId);
    if (!node) continue;
    const ts = node.state as TaskState;
    const startMs = Math.max(d0, localMs(p.startISO));
    const endMs = Math.min(d1, localMs(p.endISO));
    if (!(endMs > startMs)) continue;
    let recordedMs = 0;
    for (const r of real) if (r.kind === 'work') recordedMs += overlap(startMs, endMs, r.startMs, r.endMs);
    const state: PlanStateName = ts.done ? 'done'
      // Covered only once it has started: time recorded ahead of now is not real.
      : startMs <= nowMs && recordedMs >= (endMs - startMs) * COVERED_SHARE ? 'covered'
        : endMs <= nowMs ? 'missed' : 'open';
    out.push({ id: p.taskId, taskId: p.taskId, text: ts.text || 'Plan', startMs, endMs, state, kind: 'plan', recordedMs });
  }
  for (const h of habitsOf(board)) {
    if (h.kind !== 'routine' || h.archived) continue;
    for (const s of routineSpansOn(h, day)) {
      if (s.skipped) continue;
      const startMs = d0 + s.startMin * 60_000;
      const endMs = Math.min(d1, d0 + s.endMin * 60_000);
      if (endMs > startMs) out.push({ id: `ev-${h.id}-${s.date}-${s.spill ? 's' : 'o'}`, taskId: null, text: h.name, startMs, endMs, state: 'open', kind: 'event', recordedMs: 0 });
    }
  }
  return out.sort((x, y) => x.startMs - y.startMs || x.endMs - y.endMs);
}

const openItem = (i: TodoItem): boolean => i.droppedAt === undefined && i.archivedAt === undefined;

export function dayData(board: Board | null, day: string, nowMs: number): DayData {
  const { d0, d1 } = dayBounds(day);
  const real = realMarks(board, day, nowMs);
  const gaps = gapMarks(real, day, nowMs);
  const plans = planMarks(board, day, nowMs, real);
  const anyTime: AnyTimeRow[] = (todoOf(board)?.items ?? [])
    .filter((i) => openItem(i) && i.onDay === day)
    .map((i) => ({ itemId: i.id, taskId: i.taskNodeId, text: i.text, done: i.done }));
  const byLabel = new Map<string, { label: string; color: string; ms: number }>();
  for (const r of real) {
    if (r.kind !== 'work') continue;
    const t = byLabel.get(r.label) ?? { label: r.label, color: r.color, ms: 0 };
    t.ms += r.endMs - r.startMs;
    byLabel.set(r.label, t);
  }
  return {
    day, d0, d1, plans, real, gaps, anyTime,
    totals: [...byLabel.values()].sort((a, b) => b.ms - a.ms),
    unnamedMs: gaps.reduce((n, g) => n + (g.endMs - g.startMs), 0),
  };
}

/** Plans with no day and no time: the list beside today's. */
export function noTimeYet(board: Board | null): AnyTimeRow[] {
  if (!board) return [];
  const placed = selectSchedule(board).placements;
  return (todoOf(board)?.items ?? [])
    .filter((i) => openItem(i) && !i.done && !i.onDay && !i.scheduledFor && !(i.taskNodeId && placed.has(i.taskNodeId)))
    .map((i) => ({ itemId: i.id, taskId: i.taskNodeId, text: i.text, done: false }));
}

/** The plan running now, else the next one to start today. */
export function nextPlan(d: DayData, nowMs: number): PlanMark | null {
  const open = d.plans.filter((p) => p.kind === 'plan' && p.state !== 'done' && p.endMs > nowMs);
  return open.find((p) => p.startMs <= nowMs) ?? open[0] ?? null;
}

export interface HabitRow {
  id: string;
  name: string;
  color: string;
  /** Mon..Sun of the week `day` is in. */
  week: boolean[];
  weekDays: string[];
  done: boolean;
  scheduled: boolean;
  /** "12 days", "2 of 3 this week", "5 of 8 today". */
  status: string;
  amount: { count: number; target: number; unit: string } | null;
}

export function mondayOf(day: string): string {
  const js = new Date(`${day}T00:00:00`).getDay();
  return addDaysYMD(day, -(js === 0 ? 6 : js - 1));
}

export function habitRows(board: Board | null, day: string): HabitRow[] {
  const mon = mondayOf(day);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDaysYMD(mon, i));
  return habitsOf(board).filter((h) => !h.archived && h.kind !== 'routine').map((h) => {
    const done = h.log.includes(day);
    const target = weeklyTarget(h);
    const amount = h.amount ? { count: countOn(h, day), target: h.amount.target, unit: h.amount.unit } : null;
    const streak = habitStreak(h, day);
    const status = amount && !done ? `${amount.count} of ${amount.target} today`
      : target ? `${ticksThisWeek(h.log, day)} of ${target} this week`
        : `${streak.current} ${streak.unit}${streak.current === 1 ? '' : 's'}`;
    return {
      id: h.id, name: h.name, color: `var(--${h.color})`, week: weekDays.map((d) => h.log.includes(d)), weekDays,
      done, scheduled: isDayScheduled(h.schedule, day), status, amount,
    };
  });
}

/** "2h 15" / "42m". */
export function fmtDur(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  return min < 60 ? `${min}m` : `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}`;
}

export function fmtClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const todayOf = (nowMs: number): string => localYMD(new Date(nowMs));
