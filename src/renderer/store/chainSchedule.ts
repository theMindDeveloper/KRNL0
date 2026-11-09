// What a person does to ONE task in a chain happens to that task (ADR 0005
// follow-up, 2026-11-07). Shared by the Calendar, the right-click menus, the
// unschedule strip and `krnl task schedule|unschedule`, so all behave alike.
//
// Before: unscheduling a chained task cleared the chain's anchor (everything
// left), unscheduling a task with its own time made it fall back behind its
// predecessor (it stayed), and moving a chained task earlier than its
// predecessor's end was pushed straight back (#168) — "placed at 12:50".
//
// Pure: takes a board, returns the edges and schedule writes to apply.

import type { Board, Edge } from '../../shared/types';
import type { TaskState } from '../components/nodes/TaskNode/types';
import { selectSchedule } from './scheduleSelector';

export interface ScheduleWrite {
  taskId: string;
  /** Local "YYYY-MM-DDTHH:MM", or null to take it off the calendar. */
  scheduledFor: string | null;
}

export interface ChainPlan {
  /** The board's edges after the change (same array when unchanged). */
  edges: Edge[];
  writes: ScheduleWrite[];
}

const isNextInto = (e: Edge, taskId: string): boolean => e.from.event === 'task.next' && e.to.nodeId === taskId;

/** Edges without the chain links that lead INTO `taskId` (it stops following anything). */
function withoutIncoming(edges: Edge[], taskId: string): Edge[] {
  return edges.some((e) => isNextInto(e, taskId)) ? edges.filter((e) => !isNextInto(e, taskId)) : edges;
}

/**
 * Take `taskId` — and only it — off the calendar. Every other task whose time
 * came from the chain keeps the time it has now (it is pinned there), and
 * `taskId` stops following its predecessor, so the chain cannot pull it back.
 * Null when the task is not on the calendar.
 */
export function unscheduleOne(board: Board, taskId: string): ChainPlan | null {
  const placements = selectSchedule(board).placements;
  const own = placements.get(taskId);
  const node = board.nodes.find((n) => n.id === taskId);
  if (!node || node.kind !== 'todo.task') return null;
  const hasOwnTime = typeof (node.state as TaskState).scheduledFor === 'string' && !!(node.state as TaskState).scheduledFor;
  if (!own && !hasOwnTime) return null;
  const chainAnchors = new Set<string>([taskId]);
  if (own) chainAnchors.add(own.anchorTaskId);
  const writes: ScheduleWrite[] = [];
  for (const p of placements.values()) {
    if (p.taskId === taskId || p.isAnchor || !chainAnchors.has(p.anchorTaskId)) continue;
    writes.push({ taskId: p.taskId, scheduledFor: p.startISO.slice(0, 16) });
  }
  writes.push({ taskId, scheduledFor: null });
  return { edges: withoutIncoming(board.edges, taskId), writes };
}

/**
 * The user put `taskId` at `scheduledFor`. If its chain would push it to a
 * later time (it starts before the task before it ends), it leaves the chain
 * so it lands where it was put; the tasks after it still follow it.
 * Returns the edges to use (same array when nothing had to change).
 */
export function detachIfPushed(board: Board, taskId: string, scheduledFor: string): Edge[] {
  const nodes = board.nodes.map((n) => (n.id === taskId && n.kind === 'todo.task'
    ? { ...n, state: { ...(n.state as TaskState), scheduledFor } }
    : n));
  const placed = selectSchedule({ ...board, nodes } as Board).placements.get(taskId);
  if (!placed || placed.startISO.slice(0, 16) === scheduledFor.slice(0, 16)) return board.edges;
  return withoutIncoming(board.edges, taskId);
}
