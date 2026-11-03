// Per-day planned tasks and focus minutes for the Calendar year view. Kept
// out of YearView.tsx so React Fast Refresh can hot-swap the component.

import { selectSchedule } from '../../../store/scheduleSelector';
import { selectPomoReality } from '../../../store/pomoReality';
import { splitByLocalDay } from '../../../analytics/dateRange';

/** Per-day planned task count and focus minutes for one year. Exported for tests. */
export function yearActivity(board: Parameters<typeof selectSchedule>[0] | null, year: number, nowMs: number) {
  const tasks = new Map<string, number>();
  const focus = new Map<string, number>();
  if (!board) return { tasks, focus };
  for (const p of selectSchedule(board).placements.values()) {
    const day = p.startISO.slice(0, 10);
    if (day.startsWith(`${year}-`)) tasks.set(day, (tasks.get(day) ?? 0) + 1);
  }
  for (const seg of selectPomoReality(board, nowMs)) {
    if (seg.kind !== 'work') continue;
    // Over midnight: each day gets its own minutes (same as the week view and analytics).
    for (const part of splitByLocalDay(seg.startMs, seg.endMs)) {
      if (!part.date.startsWith(`${year}-`)) continue;
      focus.set(part.date, (focus.get(part.date) ?? 0) + part.ms / 60_000);
    }
  }
  return { tasks, focus };
}
