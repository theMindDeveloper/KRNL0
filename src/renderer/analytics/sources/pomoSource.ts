// Pomo data source — Issue #166 observer model.
//
// Emits three event types per history record:
//   pomo.session — work span that reached the threshold (completed=true, kind='work').
//                  Used by focusMin / session-count aggregators.
//   pomo.work    — every work span (including partial). Represents actual focus time.
//   pomo.break   — every break span. Represents rest taken.
//
// Legacy records without a 'kind' field are treated as 'work'.

import type { AnalyticsDataSource, AnalyticsEvent, BoardLike } from '../types';
import { isoToYMD } from '../dateRange';

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
        const date = isoToYMD(rec.endedAt);
        const meta = { taskId: rec.taskId ?? null, label: rec.label ?? '', kind: recKind };

        if (recKind === 'work') {
          // pomo.work — every work span regardless of completion.
          out.push({
            source: 'pomo',
            type: 'pomo.work',
            date,
            isoTimestamp: rec.endedAt,
            durationMin: rec.durationMin ?? 0,
            metadata: meta,
          });
          // pomo.session — only threshold-reached spans (legacy: completed=true).
          if (rec.completed) {
            out.push({
              source: 'pomo',
              type: 'pomo.session',
              date,
              isoTimestamp: rec.endedAt,
              durationMin: rec.durationMin ?? 0,
              metadata: meta,
            });
          }
        } else {
          // pomo.break — all break spans.
          out.push({
            source: 'pomo',
            type: 'pomo.break',
            date,
            isoTimestamp: rec.endedAt,
            durationMin: rec.durationMin ?? 0,
            metadata: meta,
          });
        }
      }
    }
    return out;
  },
};
