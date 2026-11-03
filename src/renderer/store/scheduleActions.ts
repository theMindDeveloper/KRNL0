// Actions behind the Calendar / Clock right-click menus (scheduled tasks and
// tracked pomo segments). One implementation so both surfaces behave the same.
//
// Segment edits and unschedule apply the pure reducers straight to the store
// (history-pushed → undoable) — the same path the popups always used. Toggle
// done and start-focus need commandDispatch's cross-node side effects (Todo
// mirror, completion ledger, pomo start); that module is imported lazily so it
// stays out of the calendar/clock render graph (a static import blew
// render-only tests past their timeout).
//
// CLI twins (rule 8): pomo retag <seg> <task|none> · pomo delete-segment <seg>
// · task toggle <ref> · task pomo <ref> · task unschedule <ref>.

import { useBoardStore } from './boardStore';
import { saveBoard } from './eventLog';
import { pomoDeleteSegment, pomoRetagSegment } from '../components/nodes/PomoNode/commands';
import type { PomoState } from '../components/nodes/PomoNode/types';
import { selectSchedule } from './scheduleSelector';
import type { TaskState } from '../components/nodes/TaskNode/types';

function persist(): void {
  const b = useBoardStore.getState().board;
  if (b) void saveBoard(b);
}

export function deleteSegment(segId: string): void {
  const st = useBoardStore.getState();
  const pomo = st.board?.nodes.find((n) => n.kind === 'pomo');
  if (!pomo) return;
  st.updateNode(pomo.id, { state: pomoDeleteSegment(pomo.state as PomoState, { id: segId }) });
  persist();
}

export function retagSegment(segId: string, taskId: string | null): void {
  const st = useBoardStore.getState();
  const pomo = st.board?.nodes.find((n) => n.kind === 'pomo');
  if (!pomo) return;
  const task = taskId ? st.board?.nodes.find((n) => n.id === taskId) : undefined;
  st.updateNode(pomo.id, {
    state: pomoRetagSegment(pomo.state as PomoState, {
      id: segId,
      taskId,
      ...(task ? { label: (task.state as TaskState).text } : {}),
    }),
  });
  persist();
}

/**
 * The task whose `scheduledFor` puts `taskId` on the calendar: the task itself
 * when it is an anchor, else the anchor of its chain (successors are placed
 * at read time and store no time of their own). Null when not on the calendar.
 */
export function scheduleAnchorOf(taskId: string): string | null {
  const board = useBoardStore.getState().board;
  const node = board?.nodes.find((n) => n.id === taskId);
  if (!board || !node || node.kind !== 'todo.task') return null;
  if ((node.state as TaskState).scheduledFor) return taskId;
  return selectSchedule(board).placements.get(taskId)?.anchorTaskId ?? null;
}

/** Where `taskId` sits on the calendar right now (anchors and chain successors). */
export function placementOf(taskId: string): { startISO: string; endISO: string } | null {
  const p = selectSchedule(useBoardStore.getState().board).placements.get(taskId);
  return p ? { startISO: p.startISO, endISO: p.endISO } : null;
}

/**
 * Take a task off the calendar. A chain successor has no time of its own, so
 * this unschedules the chain's anchor (the whole chain leaves the calendar);
 * the menu says "Unschedule chain" in that case. Goes through the dispatcher
 * so the linked Todo row's time is cleared too (CLI: task unschedule).
 */
export async function unscheduleTask(taskId: string): Promise<void> {
  const anchor = scheduleAnchorOf(taskId);
  if (!anchor) return;
  await dispatchToTask(anchor, 'task.setSchedule', { scheduledFor: null });
}

async function dispatchToTask(taskId: string, command: string, args: Record<string, unknown> = {}): Promise<void> {
  const { makeCommandHandler } = await import('../components/Canvas/commandDispatch');
  makeCommandHandler(taskId)(command, args);
}

export function toggleTaskDone(taskId: string): Promise<void> {
  return dispatchToTask(taskId, 'task.toggle');
}

export function startFocusOnTask(taskId: string): Promise<void> {
  return dispatchToTask(taskId, 'task.startPomo');
}

/** Tick / untick a habit for today (CLI: habit done|undo <id>). */
export async function toggleHabitToday(habitId: string): Promise<void> {
  const habitNode = useBoardStore.getState().board?.nodes.find((n) => n.kind === 'habit' && n.isMother);
  if (!habitNode) return;
  const { makeCommandHandler } = await import('../components/Canvas/commandDispatch');
  makeCommandHandler(habitNode.id)('habit.toggleDay', { id: habitId });
}

/** Window event the canvas listens for to centre a node (works from any surface). */
export const FOCUS_NODE_EVENT = 'krnl:focus-node';

export function focusNode(nodeId: string): void {
  window.dispatchEvent(new CustomEvent(FOCUS_NODE_EVENT, { detail: { nodeId } }));
}

/** Window event the Calendar listens for to bring a task block into view and pulse it. */
export const CALENDAR_REVEAL_EVENT = 'krnl:calendar-reveal';

/**
 * "Show on calendar" from a task's right-click menu: open the Calendar on the
 * task's day (week view unless it is already on a day/week view), bring the
 * Calendar into view, then let the week view scroll to and pulse the block.
 */
export async function showTaskOnCalendar(taskId: string): Promise<void> {
  const board = useBoardStore.getState().board;
  // The block's real start: a chain successor has no scheduledFor, and a
  // pushed anchor (Decision 30) can land on a later day than it stores.
  const when = placementOf(taskId)?.startISO;
  const cal = board?.nodes.find((n) => n.kind === 'calendar' && n.isMother);
  if (!when || !cal) return;
  const d = new Date(when);
  if (Number.isNaN(d.getTime())) return;
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const { makeCommandHandler } = await import('../components/Canvas/commandDispatch');
  const send = makeCommandHandler(cal.id);
  const view = (cal.config as { view?: string }).view;
  if (view !== 'week' && view !== 'day') send('calendar.setView', { view: 'week' });
  send('calendar.setAnchor', { date: ymd });
  // Station mode shows the Calendar as a fixed panel: don't move the camera.
  if (board?.layoutMode !== 'station') focusNode(cal.id);
  // After the calendar re-renders on the new week.
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent(CALENDAR_REVEAL_EVENT, { detail: { taskId, startISO: when } }));
  }, 120);
}
