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

import { useBoardStore, pushHistory } from './boardStore';
import { unscheduleOne } from './chainSchedule';
import type { Board } from '../../shared/types';
import { saveBoard } from './eventLog';
import { pomoDeleteSegment, pomoRetagSegment, pomoStopAt } from '../components/nodes/PomoNode/commands';
import { pomoEditSegment, pomoAddSegment, spanProblem } from '../components/nodes/PomoNode/spanEdit';
import { spanTagFor } from './spanTags';
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
 * Take this task — and only it — off the calendar (CLI: task unschedule).
 * Tasks timed by the chain keep their current times; this task stops
 * following its predecessor so the chain cannot pull it back
 * (chainSchedule.ts). Goes through the dispatcher so linked Todo rows' times
 * follow.
 */
export async function unscheduleTask(taskId: string): Promise<void> {
  const board = useBoardStore.getState().board;
  if (!board) return;
  const plan = unscheduleOne(board as Board, taskId);
  if (!plan) return;
  if (plan.edges !== board.edges) {
    useBoardStore.setState((s) => (s.board ? { ...pushHistory(s), board: { ...s.board, edges: plan.edges } } : s));
  }
  for (const w of plan.writes) await dispatchToTask(w.taskId, 'task.setSchedule', { scheduledFor: w.scheduledFor });
}

async function dispatchToTask(taskId: string, command: string, args: Record<string, unknown> = {}): Promise<void> {
  const { makeCommandHandler } = await import('../components/Canvas/commandDispatch');
  makeCommandHandler(taskId)(command, args);
}

export function toggleTaskDone(taskId: string): Promise<void> {
  return dispatchToTask(taskId, 'task.toggle');
}

/** Put a task on the Calendar at a local "YYYY-MM-DDTHH:MM" (quick add). */
export async function scheduleTaskAt(taskId: string, scheduledFor: string): Promise<void> {
  const cal = useBoardStore.getState().board?.nodes.find((n) => n.kind === 'calendar' && n.isMother);
  if (!cal) return;
  const { makeCommandHandler } = await import('../components/Canvas/commandDispatch');
  makeCommandHandler(cal.id)('calendar.schedule', { taskId, scheduledFor });
}

/** Review 4.1 — remind N minutes before a plan starts (null = no reminder). */
export function setTaskReminder(taskId: string, min: number | null): Promise<void> {
  return dispatchToTask(taskId, 'task.setRemind', { min });
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

/** Decision 39 — a command on the habit mother (routines: skip / move / end …). */
export async function habitMotherCommand(command: string, args: Record<string, unknown>): Promise<void> {
  const habitNode = useBoardStore.getState().board?.nodes.find((n) => n.kind === 'habit' && n.isMother);
  if (!habitNode) return;
  const { makeCommandHandler } = await import('../components/Canvas/commandDispatch');
  makeCommandHandler(habitNode.id)(command, args);
}

/**
 * Delete from the Calendar means gone everywhere: the plan leaves the Todo,
 * the Calendar and the canvas (todo.remove cascades to its task), with UNDO.
 * Returns false when the task has no Todo item to delete.
 */
export async function deletePlanOfTask(taskId: string): Promise<boolean> {
  const board = useBoardStore.getState().board;
  const todo = board?.nodes.find((n) => n.kind === 'todo' && n.isMother);
  const item = (todo?.state as { items?: Array<{ id: string; text: string; taskNodeId: string | null }> } | undefined)?.items?.find((i) => i.taskNodeId === taskId);
  if (!todo || !item) return false;
  const [{ makeCommandHandler }, { undoable }] = await Promise.all([import('../components/Canvas/commandDispatch'), import('./undoNotice')]);
  undoable(`Deleted "${item.text}"`, () => makeCommandHandler(todo.id)('todo.remove', { id: item.id }));
  return true;
}

/**
 * Decision 40 — put a plan on a day at any time (the Calendar's ANY TIME
 * strip): off the grid if it had a time, then `onDay`. UNDO puts it back.
 * `ref` is what a drag carries: the task id, or a Todo item id.
 */
export async function putPlanOnDay(ref: { taskId?: string; itemId?: string }, day: string): Promise<void> {
  const board = useBoardStore.getState().board;
  const todo = board?.nodes.find((n) => n.kind === 'todo' && n.isMother);
  const items = (todo?.state as { items?: Array<{ id: string; text: string; taskNodeId: string | null; onDay?: string }> } | undefined)?.items ?? [];
  const item = ref.itemId ? items.find((i) => i.id === ref.itemId) : items.find((i) => i.taskNodeId === ref.taskId);
  if (!todo || !item) return;
  const taskId = item.taskNodeId;
  const wasAt = taskId ? placementOf(taskId)?.startISO ?? null : null;
  const wasDay = item.onDay ?? null;
  if (!wasAt && wasDay === day) return;
  const [{ makeCommandHandler }, { revertible }] = await Promise.all([import('../components/Canvas/commandDispatch'), import('./undoNotice')]);
  if (taskId && wasAt) await unscheduleTask(taskId);
  makeCommandHandler(todo.id)('todo.setOnDay', { id: item.id, onDay: day });
  const label = new Date(`${day}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  revertible(`"${item.text}" → ${label}, any time`, () => {
    makeCommandHandler(todo.id)('todo.setOnDay', { id: item.id, onDay: wasDay });
    if (taskId && wasAt) void scheduleTaskAt(taskId, wasAt.slice(0, 16));
  });
}

/**
 * Decision 40 — one plan card everywhere (Todo row and Calendar block): what a
 * plan's When and Deadline are now, read from the board. Null when the task
 * has no Todo item (a canvas-only task).
 */
export interface PlanWhen {
  itemId: string;
  taskId: string | null;
  text: string;
  value: { day: string | null; time: string | null; lengthMin: number | null; remindMin: number | null; deadline: string | null };
}
export function planWhenOf(ref: { taskId?: string; itemId?: string }): PlanWhen | null {
  const board = useBoardStore.getState().board;
  const todo = board?.nodes.find((n) => n.kind === 'todo' && n.isMother);
  const items = (todo?.state as { items?: Array<{ id: string; text: string; taskNodeId: string | null; onDay?: string; dueOn?: string }> } | undefined)?.items ?? [];
  const it = ref.itemId ? items.find((i) => i.id === ref.itemId) : items.find((i) => i.taskNodeId === ref.taskId);
  if (!board || !it) return null;
  const task = it.taskNodeId ? board.nodes.find((n) => n.id === it.taskNodeId) : undefined;
  const ts = task?.state as { plannedMin?: number; timeOpen?: boolean; remindMin?: number } | undefined;
  const at = it.taskNodeId ? placementOf(it.taskNodeId)?.startISO ?? null : null;
  return {
    itemId: it.id,
    taskId: it.taskNodeId,
    text: it.text,
    value: {
      day: at ? at.slice(0, 10) : it.onDay ?? null,
      time: at ? at.slice(11, 16) : null,
      lengthMin: ts?.timeOpen || !ts?.plannedMin ? null : ts.plannedMin,
      remindMin: typeof ts?.remindMin === 'number' ? ts.remindMin : null,
      deadline: it.dueOn ?? null,
    },
  };
}
/** Apply what the plan card changed (only what changed). */
export async function applyPlanWhen(p: PlanWhen, next: PlanWhen['value']): Promise<void> {
  const prev = p.value;
  const todo = useBoardStore.getState().board?.nodes.find((n) => n.kind === 'todo' && n.isMother);
  if (!todo) return;
  const { makeCommandHandler } = await import('../components/Canvas/commandDispatch');
  const run = makeCommandHandler(todo.id);
  if (next.deadline !== prev.deadline) run('todo.setDue', { id: p.itemId, dueOn: next.deadline });
  if (next.lengthMin !== prev.lengthMin && p.taskId) run('todo.setItemPlannedMin', { itemId: p.itemId, minutes: next.lengthMin ?? 0 });
  if (next.day !== prev.day || next.time !== prev.time) {
    if (next.day && next.time && p.taskId) await scheduleTaskAt(p.taskId, `${next.day}T${next.time}`);
    else {
      if (prev.time && p.taskId) await unscheduleTask(p.taskId);
      run('todo.setOnDay', { id: p.itemId, onDay: next.day });
    }
  }
  if (p.taskId && next.remindMin !== prev.remindMin) await setTaskReminder(p.taskId, next.time ? next.remindMin : null);
}

/** Decision 40 — "New here… · Once": a plan at that day and time, with a length. */
export async function addPlanAt(text: string, day: string, time: string, lengthMin: number): Promise<void> {
  const todo = useBoardStore.getState().board?.nodes.find((n) => n.kind === 'todo' && n.isMother);
  if (!todo) return;
  const { makeCommandHandler } = await import('../components/Canvas/commandDispatch');
  makeCommandHandler(todo.id)('todo.add', { text, durationMin: lengthMin });
  const items = (useBoardStore.getState().board?.nodes.find((n) => n.id === todo.id)?.state as { items?: Array<{ id: string; text: string; done: boolean; createdAt: string; taskNodeId: string | null }> } | undefined)?.items ?? [];
  const added = [...items].filter((i) => i.text === text && !i.done).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (added?.taskNodeId) await scheduleTaskAt(added.taskNodeId, `${day}T${time}`);
}

/** A routine deleted from its Calendar band: gone from every day and from Habits & Routines, with UNDO. */
export async function deleteRoutine(habitId: string): Promise<void> {
  const habitNode = useBoardStore.getState().board?.nodes.find((n) => n.kind === 'habit' && n.isMother);
  const h = (habitNode?.state as { habits?: Array<{ id: string; name: string }> } | undefined)?.habits?.find((x) => x.id === habitId);
  if (!habitNode || !h) return;
  const [{ makeCommandHandler }, { undoable }] = await Promise.all([import('../components/Canvas/commandDispatch'), import('./undoNotice')]);
  undoable(`Deleted routine "${h.name}"`, () => makeCommandHandler(habitNode.id)('habit.remove', { id: habitId }));
}

/** Window event the canvas listens for to centre a node (works from any surface). */
export const FOCUS_NODE_EVENT = 'krnl:focus-node';
/** Window event the canvas listens for to fit several nodes on screen (`detail.nodeIds`). */
export const FIT_NODES_EVENT = 'krnl:fit-nodes';

export function focusNode(nodeId: string): void {
  window.dispatchEvent(new CustomEvent(FOCUS_NODE_EVENT, { detail: { nodeId } }));
}

/** "Show on canvas": centre the plan's card on the canvas and make it blink. */
export function showTaskOnCanvas(taskId: string): void {
  focusNode(taskId);
  window.setTimeout(() => {
    const el = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(taskId)}"]`);
    el?.animate(
      [{ boxShadow: '0 0 0 0 var(--acid)' }, { boxShadow: '0 0 0 5px var(--acid)' }, { boxShadow: '0 0 0 0 var(--acid)' }],
      { duration: 700, iterations: 3, easing: 'ease-in-out' },
    );
  }, 450);
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
  const placed = placementOf(taskId)?.startISO;
  // Decision 40 — a plan on a day at any time sits in the ANY TIME strip.
  const todo = board?.nodes.find((n) => n.kind === 'todo' && n.isMother);
  const item = (todo?.state as { items?: Array<{ id: string; taskNodeId: string | null; onDay?: string }> } | undefined)?.items?.find((i) => i.taskNodeId === taskId);
  const when = placed ?? (item?.onDay ? `${item.onDay}T00:00` : undefined);
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
    window.dispatchEvent(new CustomEvent(CALENDAR_REVEAL_EVENT, { detail: placed ? { taskId, startISO: when } : { taskId, itemId: item?.id } }));
  }, 120);
}

// ── #207 corrections — move / add recorded time, stop at an earlier time ──
// Same reducers and the same refusal messages as `krnl pomo segment|add|stop --at`.

/** Move a recorded span. Returns why it can't, or null when done. */
export function editSegmentTimes(segId: string, startMs: number, endMs: number): string | null {
  const st = useBoardStore.getState();
  const pomo = st.board?.nodes.find((n) => n.kind === 'pomo');
  if (!pomo) return 'No Pomodoro on the board';
  const state = pomo.state as PomoState;
  const rec = state.history.find((r) => r.id === segId);
  if (!rec) return 'That session no longer exists';
  const problem = spanProblem(state, { startMs, endMs }, Date.now(), { exceptId: segId, kind: rec.kind });
  if (problem) return problem;
  st.updateNode(pomo.id, { state: pomoEditSegment(state, { id: segId, startMs, endMs }) });
  persist();
  return null;
}

/** Record time that wasn't recorded. Returns why it can't, or null when done. */
export function addPastSegment(startMs: number, endMs: number, taskId: string | null, label = ''): string | null {
  const st = useBoardStore.getState();
  const pomo = st.board?.nodes.find((n) => n.kind === 'pomo');
  if (!pomo) return 'No Pomodoro on the board';
  const state = pomo.state as PomoState;
  const problem = spanProblem(state, { startMs, endMs }, Date.now());
  if (problem) return problem;
  const task = taskId ? st.board?.nodes.find((n) => n.id === taskId) : undefined;
  const text = task ? (task.state as TaskState).text : label.trim();
  const tag = !taskId && text ? spanTagFor(st.board ?? null, text, null) : null;
  st.updateNode(pomo.id, {
    state: pomoAddSegment(state, { id: crypto.randomUUID(), startMs, endMs, taskId, label: text, tag }),
  });
  persist();
  return null;
}

/** Stop the running session as of `atMs` (time after it is not counted). */
export function stopSessionAt(atMs: number): string | null {
  const st = useBoardStore.getState();
  const pomo = st.board?.nodes.find((n) => n.kind === 'pomo');
  if (!pomo) return 'No Pomodoro on the board';
  const state = pomo.state as PomoState;
  if ((state.status !== 'running' && state.status !== 'break') || !state.startedAt) return 'Nothing is running';
  if (atMs > Date.now()) return 'That time is in the future';
  if (atMs <= Date.parse(state.startedAt)) return 'That is before the session started';
  st.updateNode(pomo.id, { state: pomoStopAt(state, { atMs }) });
  persist();
  return null;
}
