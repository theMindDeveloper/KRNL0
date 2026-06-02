// Task data source — #169 completion ledger.
//
// Emits one 'task.completed' event per entry in the board's completion ledger
// (Board.completions). The ledger is written when a task is marked done and is
// independent of the task node, so:
//   - created + done + deleted   → entry survives → still counted
//   - created + undone + deleted → no entry was written → not counted
//   - created by mistake, deleted → never completed → not counted
//
// This replaces the previous "read live done nodes" approach, which lost the
// stat whenever the task node was removed.

import type { AnalyticsDataSource, AnalyticsEvent, BoardLike } from '../types';
import { isoToYMD } from '../dateRange';

export const taskSource: AnalyticsDataSource = {
  id: 'task',
  label: 'Tasks',
  collect(board: BoardLike): AnalyticsEvent[] {
    const out: AnalyticsEvent[] = [];
    const ledger = board.completions ?? [];
    for (const c of ledger) {
      if (!c.completedAt) continue;
      out.push({
        source: 'task',
        type: 'task.completed',
        date: isoToYMD(c.completedAt),
        isoTimestamp: c.completedAt,
        metadata: { taskId: c.taskId, text: c.text, plannedMin: c.plannedMin },
      });
    }
    return out;
  },
};
