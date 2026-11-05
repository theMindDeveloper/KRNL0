// time-model F5 (revised #207): the open task whose planned calendar block
// contains "now". The Pomo SUGGESTS it ("Planned now: X — Start on it /
// Track as X"); nothing is ever tagged silently.

import type { Board } from '../../shared/types';
import type { TaskState } from '../components/nodes/TaskNode/types';
import { selectSchedule } from './scheduleSelector';

export function plannedTaskAt(board: Board | null | undefined, nowMs: number): { id: string; text: string } | null {
  if (!board) return null;
  const { placements } = selectSchedule(board);
  for (const p of placements.values()) {
    const start = new Date(p.startISO).getTime();
    const end = new Date(p.endISO).getTime();
    if (start <= nowMs && nowMs < end) {
      const t = board.nodes.find((n) => n.id === p.taskId);
      if (t && t.kind === 'todo.task' && !(t.state as TaskState).done) {
        return { id: p.taskId, text: (t.state as TaskState).text };
      }
    }
  }
  return null;
}
