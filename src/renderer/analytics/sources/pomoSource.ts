// Pomo data source — Issue #166 observer model.
//
// Emits three event types per history record:
//   pomo.session — work span that reached the threshold (completed=true, kind='work').
//                  Used by focusMin / session-count aggregators.
//   pomo.work    — every work span (including partial). Represents actual focus time.
//   pomo.break   — every break span. Represents rest taken.
// work / break spans over midnight are split by the minutes on each day.
//
// Legacy records without a 'kind' field are treated as 'work'.

import type { AnalyticsDataSource, AnalyticsEvent, BoardLike } from '../types';
import { isoToYMD, splitMinutesByLocalDay } from '../dateRange';

interface PomoSessionLike {
  id?: string;
  startedAt?: string;
  endedAt: string;
  durationMin: number;
  completed: boolean;
  taskId?: string | null;
  label?: string;
  kind?: string;
}

interface PomoStateLike {
  history?: PomoSessionLike[];
}

const isoAt = (ms: number, fallback: string): string => (Number.isFinite(ms) ? new Date(ms).toISOString() : fallback);

export const pomoSource: AnalyticsDataSource = {
  id: 'pomo',
  label: 'Pomo',
  collect(board: BoardLike): AnalyticsEvent[] {
    const out: AnalyticsEvent[] = [];
    for (const n of board.nodes) {
      if (n.kind !== 'pomo') continue;
      const s = n.state as PomoStateLike;
      const history = s.history ?? [];
      for (const rec of history) {
        if (!rec.endedAt) continue;
        const recKind = rec.kind === 'break' ? 'break' : 'work';
        const meta = { taskId: rec.taskId ?? null, label: rec.label ?? '', kind: recKind };
        const endMs = Date.parse(rec.endedAt);
        const startMs = rec.startedAt ? Date.parse(rec.startedAt) : endMs;
        // A span over midnight counts its minutes on each day it covers.
        const parts = Number.isFinite(startMs) && startMs < endMs
          ? splitMinutesByLocalDay(startMs, endMs, rec.durationMin ?? 0)
          : [{ date: isoToYMD(rec.endedAt), min: rec.durationMin ?? 0, endMs }];
        parts.forEach((part, i) => {
          out.push({
            source: 'pomo',
            type: recKind === 'work' ? 'pomo.work' : 'pomo.break',
            date: part.date,
            // Inside the part's own day, so hour / weekday charts agree with `date`.
            isoTimestamp: isoAt(part.endMs, rec.endedAt),
            durationMin: part.min,
            // `part` > 0 marks the continuation of a span split at midnight.
            metadata: parts.length === 1 ? meta : { ...meta, spanId: rec.id ?? null, part: i },
          });
        });
        // pomo.session — one per threshold-reached span, on the day it ended
        // (its last part: a span ending at 00:00 ended the day before).
        if (recKind === 'work' && rec.completed) {
          const last = parts[parts.length - 1]!;
          out.push({
            source: 'pomo',
            type: 'pomo.session',
            date: last.date,
            isoTimestamp: isoAt(last.endMs, rec.endedAt),
            durationMin: rec.durationMin ?? 0,
            metadata: meta,
          });
        }
      }
    }
    return out;
  },
};
