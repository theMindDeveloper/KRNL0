// Decision 63 — what a person does to ONE task happens to that task only, and
// connections between cards are only drawn: they are never changed here.
// Shared by the Calendar, the right-click menus and `krnl task unschedule`.
//
// Pure: takes a board, returns the schedule writes to apply.

import type { Board } from '../../shared/types';
import type { TaskState } from '../components/nodes/TaskNode/types';

export interface ScheduleWrite {
  taskId: string;
  /** Local "YYYY-MM-DDTHH:MM", or null to take it off the calendar. */
  scheduledFor: string | null;
}

/** Take `taskId` (and only it) off the calendar. Null when it is not on it. */
export function unscheduleOne(board: Board, taskId: string): ScheduleWrite[] | null {
  const node = board.nodes.find((n) => n.id === taskId);
  if (!node || node.kind !== 'todo.task') return null;
  const own = (node.state as TaskState).scheduledFor;
  if (typeof own !== 'string' || !own) return null;
  return [{ taskId, scheduledFor: null }];
}
