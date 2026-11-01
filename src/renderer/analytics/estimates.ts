// Plan vs actual — how long things were estimated to take vs how long they
// took. Pure: board JSON + range + clock in, numbers out (renderer and sys CLI
// share it).
//
// Estimate  = a task's plannedMin (or the completion ledger's copy for tasks
//             that were deleted after being finished, #169).
// Actual    = pomo WORK spans tagged with that task (see store/trackedTime.ts).
// Plan/day  = minutes of planned calendar blocks on that day (schedule selector).
// Worked/day= minutes of pomo work on that day, tagged or not.

import type { Board } from '../../shared/types';
import type { TaskState } from '../components/nodes/TaskNode/types';
import type { CompletionRecord } from '../../shared/types/board';
import { selectPomoReality } from '../store/pomoReality';
import { selectSchedule } from '../store/scheduleSelector';
import type { RangeArg } from './types';

export interface TaskEstimate {
  taskId: string;
  text: string;
  plannedMin: number;
  trackedMin: number;
  /** trackedMin / plannedMin (0 when nothing planned). */
  ratio: number;
  done: boolean;
  /** True when the task node no longer exists (kept via the ledger). */
  deleted: boolean;
}

export interface DayPlanActual {
  date: string;
  plannedMin: number;
  workedMin: number;
}

export interface EstimatesResult {
  tasks: TaskEstimate[];
  days: DayPlanActual[];
  kpis: {
    plannedMin: number;
    trackedMin: number;
    /** Median tracked/planned over finished tasks with tracked time (null if none). */
    medianRatio: number | null;
    /** How many tasks the median is based on. */
    ratioBasis: number;
    overCount: number;
    underCount: number;
    /** Share of work minutes that were tagged to a task, 0..1 (null when no work). */
    taggedShare: number | null;
  };
  mix: { taggedWorkMin: number; untaggedWorkMin: number; breakMin: number };
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymdOf = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const dayStartMs = (ymd: string) => new Date(`${ymd}T00:00:00`).getTime();

function datesIn(range: RangeArg): string[] {
  const out: string[] = [];
  let ms = dayStartMs(range.start);
  const end = dayStartMs(range.end);
  for (let guard = 0; guard < 4000 && ms <= end; guard++) {
    out.push(ymdOf(ms));
    const d = new Date(ms);
    ms = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  }
  return out;
}

/** Minutes of [startMs, endMs) falling on each local day, keyed by YYYY-MM-DD. */
function minutesPerDay(startMs: number, endMs: number, into: Map<string, number>): void {
  let cursor = startMs;
  for (let guard = 0; guard < 400 && cursor < endMs; guard++) {
    const d = new Date(cursor);
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    const pieceEnd = Math.min(endMs, next);
    const key = ymdOf(cursor);
    into.set(key, (into.get(key) ?? 0) + (pieceEnd - cursor) / 60_000);
    cursor = pieceEnd;
  }
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function computeEstimates(board: Board, range: RangeArg, nowMs: number): EstimatesResult {
  const rangeStart = dayStartMs(range.start);
  const rangeEnd = new Date(dayStartMs(range.end)).setDate(new Date(dayStartMs(range.end)).getDate() + 1);

  const reality = selectPomoReality(board, nowMs);

  // Actual minutes per task (all-time: an estimate is judged on the whole task)
  // and which tasks had activity inside the range.
  const trackedByTask = new Map<string, number>();
  const labelByTask = new Map<string, string>();
  const activeInRange = new Set<string>();
  const workedByDay = new Map<string, number>();
  let taggedWorkMin = 0;
  let untaggedWorkMin = 0;
  let breakMin = 0;

  for (const seg of reality) {
    const inRange = seg.endMs > rangeStart && seg.startMs < rangeEnd;
    const clippedMin = inRange
      ? (Math.min(seg.endMs, rangeEnd) - Math.max(seg.startMs, rangeStart)) / 60_000
      : 0;
    if (seg.kind === 'break') {
      breakMin += clippedMin;
      continue;
    }
    if (inRange) {
      minutesPerDay(Math.max(seg.startMs, rangeStart), Math.min(seg.endMs, rangeEnd), workedByDay);
      if (seg.taskId) taggedWorkMin += clippedMin;
      else untaggedWorkMin += clippedMin;
    }
    if (!seg.taskId) continue;
    trackedByTask.set(seg.taskId, (trackedByTask.get(seg.taskId) ?? 0) + (seg.endMs - seg.startMs) / 60_000);
    if (seg.label) labelByTask.set(seg.taskId, seg.label);
    if (inRange) activeInRange.add(seg.taskId);
  }

  // Tasks completed in range also count, even with no tracked time.
  const ledger = ((board as unknown as { completions?: CompletionRecord[] }).completions ?? []);
  const ledgerById = new Map(ledger.map((c) => [c.taskId, c]));
  for (const c of ledger) {
    const t = Date.parse(c.completedAt);
    if (Number.isFinite(t) && t >= rangeStart && t < rangeEnd) activeInRange.add(c.taskId);
  }

  const nodeById = new Map(board.nodes.map((n) => [n.id, n]));
  const tasks: TaskEstimate[] = [];
  for (const id of activeInRange) {
    const node = nodeById.get(id);
    const ts = node && node.kind === 'todo.task' ? (node.state as TaskState) : null;
    const led = ledgerById.get(id);
    const plannedMin = ts?.plannedMin ?? ts?.durationMin ?? led?.plannedMin ?? 0;
    const trackedMin = trackedByTask.get(id) ?? 0;
    tasks.push({
      taskId: id,
      text: ts?.text ?? led?.text ?? labelByTask.get(id) ?? 'deleted task',
      plannedMin,
      trackedMin: Math.round(trackedMin * 10) / 10,
      ratio: plannedMin > 0 ? trackedMin / plannedMin : 0,
      done: ts ? ts.done : led !== undefined,
      deleted: !ts,
    });
  }
  tasks.sort((a, b) => Math.max(b.plannedMin, b.trackedMin) - Math.max(a.plannedMin, a.trackedMin));

  // Planned minutes per day from the calendar placements.
  const plannedByDay = new Map<string, number>();
  for (const p of selectSchedule(board).placements.values()) {
    const s = new Date(p.startISO).getTime();
    const e = new Date(p.endISO).getTime();
    if (!(e > s) || e <= rangeStart || s >= rangeEnd) continue;
    minutesPerDay(Math.max(s, rangeStart), Math.min(e, rangeEnd), plannedByDay);
  }
  const days = datesIn(range).map((date) => ({
    date,
    plannedMin: Math.round(plannedByDay.get(date) ?? 0),
    workedMin: Math.round(workedByDay.get(date) ?? 0),
  }));

  const measured = tasks.filter((t) => t.plannedMin > 0 && t.trackedMin > 0);
  const finished = measured.filter((t) => t.done);
  const basis = finished.length > 0 ? finished : measured;
  const totalWork = taggedWorkMin + untaggedWorkMin;

  return {
    tasks,
    days,
    kpis: {
      plannedMin: Math.round(measured.reduce((a, t) => a + t.plannedMin, 0)),
      trackedMin: Math.round(measured.reduce((a, t) => a + t.trackedMin, 0)),
      medianRatio: median(basis.map((t) => t.ratio)),
      ratioBasis: basis.length,
      overCount: measured.filter((t) => t.trackedMin > t.plannedMin).length,
      underCount: measured.filter((t) => t.trackedMin <= t.plannedMin).length,
      taggedShare: totalWork > 0 ? taggedWorkMin / totalWork : null,
    },
    mix: {
      taggedWorkMin: Math.round(taggedWorkMin),
      untaggedWorkMin: Math.round(untaggedWorkMin),
      breakMin: Math.round(breakMin),
    },
  };
}

/** One-line reading of the median ratio, e.g. "tasks take ×1.4 your estimate". */
export function describeAccuracy(ratio: number | null): string {
  if (ratio === null) return 'not enough tracked tasks yet';
  if (ratio >= 0.9 && ratio <= 1.1) return 'your estimates are on target';
  return ratio > 1
    ? `tasks take ×${ratio.toFixed(1)} your estimate`
    : `tasks take ${Math.round(ratio * 100)}% of your estimate`;
}
