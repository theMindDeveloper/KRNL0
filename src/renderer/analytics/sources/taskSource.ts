// Task data source — emits one 'task.completed' event per todo.task whose
// `state.done` is true AND has a `completedAt`. Legacy `done:true` rows
// without `completedAt` are silently excluded (we don't know when they were
// completed, so they would corrupt every dated bucket).

import type { AnalyticsDataSource, AnalyticsEvent, BoardLike } from '../types';
import { isoToYMD } from '../dateRange';

interface TaskLike {
  done?: boolean;
  completedAt?: string;
  text?: string;
}

export const taskSource: AnalyticsDataSource = {
  id: 'task',
  label: 'Tasks',
  collect(board: BoardLike): AnalyticsEvent[] {
    const out: AnalyticsEvent[] = [];
    for (const n of board.nodes) {
      if (n.kind !== 'todo.task') continue;
      const s = n.state as TaskLike;
      if (!s.done) continue;
      if (!s.completedAt) continue;
      out.push({
        source: 'task',
        type: 'task.completed',
        date: isoToYMD(s.completedAt),
        isoTimestamp: s.completedAt,
        metadata: { taskId: n.id, text: s.text },
      });
    }
    return out;
  },
};
