// "Line them up" (calendar-clock-visuals.md F28): plans that clash are put one
// after another, in their start order, from the earliest of them. Pure — the
// Calendar's shelf button and `krnl cal lineup` both use it.

export interface LineUpItem {
  taskId: string;
  /** Where the plan starts now (epoch ms). */
  startMs: number;
  /** Length of its calendar block in minutes (work plus planned breaks). */
  lengthMin: number;
}

export interface LineUpMove {
  taskId: string;
  /** Local "YYYY-MM-DDTHH:MM", the format task.setSchedule takes. */
  scheduledFor: string;
}

const pad = (n: number): string => String(n).padStart(2, '0');

export function toLocalMinuteISO(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * One move per plan whose start changes. Order: start time, then the shorter
 * plan first, then id (stable). The first plan keeps its start unless it lies
 * before `notBeforeMs`, in which case the run starts there (rounded up to the
 * next 5 minutes) — a line-up never puts a plan in the past.
 */
export function lineUp(items: readonly LineUpItem[], notBeforeMs?: number): LineUpMove[] {
  if (items.length < 2) return [];
  const sorted = [...items].sort((a, b) => a.startMs - b.startMs || a.lengthMin - b.lengthMin || a.taskId.localeCompare(b.taskId));
  const minute = 60_000;
  let cursor = Math.floor(sorted[0]!.startMs / minute) * minute;
  if (notBeforeMs !== undefined && cursor < notBeforeMs) {
    const step = 5 * minute;
    cursor = Math.ceil(notBeforeMs / step) * step;
  }
  const moves: LineUpMove[] = [];
  for (const it of sorted) {
    if (Math.floor(it.startMs / minute) * minute !== cursor) {
      moves.push({ taskId: it.taskId, scheduledFor: toLocalMinuteISO(cursor) });
    }
    cursor += Math.max(1, Math.round(it.lengthMin)) * minute;
  }
  return moves;
}
