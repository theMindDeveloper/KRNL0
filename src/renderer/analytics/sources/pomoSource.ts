// Pomo data source — emits one 'pomo.session' per completed PomoSessionRecord
// on the pomo mother node's history. Cancelled records (completed=false) are
// excluded so partial sessions don't inflate focus minutes.

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
        if (!rec.completed) continue;
        if (!rec.endedAt) continue;
        out.push({
          source: 'pomo',
          type: 'pomo.session',
          date: isoToYMD(rec.endedAt),
          isoTimestamp: rec.endedAt,
          durationMin: rec.durationMin ?? 0,
          metadata: { taskId: rec.taskId ?? null, label: rec.label ?? '' },
        });
      }
    }
    return out;
  },
};
