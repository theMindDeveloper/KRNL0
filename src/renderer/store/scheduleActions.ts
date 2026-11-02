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
import { taskSetSchedule } from '../components/nodes/TaskNode/commands';
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

export function unscheduleTask(taskId: string): void {
  const st = useBoardStore.getState();
  const node = st.board?.nodes.find((n) => n.id === taskId);
  if (!node || node.kind !== 'todo.task') return;
  st.updateNode(taskId, { state: taskSetSchedule(node.state as TaskState, { scheduledFor: null }) });
  persist();
}

async function dispatchToTask(taskId: string, command: string): Promise<void> {
  const { makeCommandHandler } = await import('../components/Canvas/commandDispatch');
  makeCommandHandler(taskId)(command, {});
}

export function toggleTaskDone(taskId: string): Promise<void> {
  return dispatchToTask(taskId, 'task.toggle');
}

export function startFocusOnTask(taskId: string): Promise<void> {
  return dispatchToTask(taskId, 'task.startPomo');
}

/** Window event the canvas listens for to centre a node (works from any surface). */
export const FOCUS_NODE_EVENT = 'krnl:focus-node';

export function focusNode(nodeId: string): void {
  window.dispatchEvent(new CustomEvent(FOCUS_NODE_EVENT, { detail: { nodeId } }));
}
