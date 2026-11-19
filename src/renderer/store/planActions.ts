// What really happened to a plan — one implementation for every place that
// asks (Welcome back, the task card menu, the calendar popup, the Todo row).
//
// - markDoneAsPlanned: "I did it then" — ticked, counted at the end of its
//   calendar block (never later than now). task-node F21, launch F14c.
// - setPlanDone: a checkbox that may be unticked again (Welcome back list).
// - wontDoItem / wontDoTask: skipped on purpose — the Todo row is dropped, the
//   plan leaves the Calendar, one Ctrl+Z / UNDO puts it and its links back.
// - archiveDoneTask: a done card leaves the board now (task-node F22).
//
// All writes go through the node commands or the board store (rule 5).

import type { Edge } from '@shared/types/edge';
import { archiveTask } from '../../shared/dispatch/task';
import type { BoardShape } from '../../shared/dispatch/types';
import { historyGroup, pushHistory, useBoardStore } from './boardStore';
import { saveBoard } from './eventLog';
import { placementOf, scheduleTaskAt, unscheduleTask } from './scheduleActions';
import { revertible, undoable } from './undoNotice';
import type { TaskState } from '../components/nodes/TaskNode/types';
import type { TodoState } from '../components/nodes/TodoNode/types';

type Loose = Record<string, unknown>;

function taskState(taskId: string): TaskState | null {
  const n = useBoardStore.getState().board?.nodes.find((x) => x.id === taskId && x.kind === 'todo.task');
  return n ? (n.state as TaskState) : null;
}

async function command(nodeId: string, cmd: string, args: Loose = {}): Promise<void> {
  const { makeCommandHandler } = await import('../components/Canvas/commandDispatch');
  makeCommandHandler(nodeId)(cmd, args);
}

/** Local wall-clock "YYYY-MM-DDTHH:MM" → epoch ms. */
const localMs = (iso: string): number => new Date(iso.length >= 16 ? iso.slice(0, 16) : iso).getTime();

/** When the plan's calendar block ended (ms), if it is on the calendar and over. */
export function plannedEndMs(taskId: string, nowMs: number = Date.now()): number | null {
  const p = placementOf(taskId);
  if (!p) return null;
  const end = localMs(p.endISO);
  return Number.isFinite(end) && end <= nowMs ? end : null;
}

/** "Mon 16" — the day a backdated completion counts on. */
export function dayLabel(ms: number): string {
  return new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
}

/**
 * The menu label for ticking a plan: "Done on Mon 16" when its block ended on
 * an earlier day, "Done at 14:00" when it ended earlier today, else "Mark done".
 */
export function doneLabel(endMs: number | null, nowMs: number = Date.now()): string {
  if (endMs === null) return 'Mark done';
  const end = new Date(endMs);
  const now = new Date(nowMs);
  if (end.toDateString() === now.toDateString()) {
    return `Done at ${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
  }
  return `Done on ${dayLabel(endMs)}`;
}

/** Tick a task done, counted when its block ended (now if it has none or is still running). */
export async function markDoneAsPlanned(taskId: string): Promise<void> {
  const ts = taskState(taskId);
  if (!ts || ts.done) return;
  const end = plannedEndMs(taskId);
  await command(taskId, 'task.toggle', end !== null ? { at: new Date(end).toISOString() } : {});
}

/** A checkbox: done as planned, or reopened. No-op when already in that state. */
export async function setPlanDone(taskId: string, done: boolean): Promise<void> {
  const ts = taskState(taskId);
  if (!ts || ts.done === done) return;
  if (done) await markDoneAsPlanned(taskId);
  else await command(taskId, 'task.toggle');
}

/** The Todo row behind a task card, if it has one. */
export function todoRowOf(taskId: string): { todoId: string; itemId: string } | null {
  const ts = taskState(taskId);
  return ts && ts.todoItemId !== null && ts.parentTodoId ? { todoId: ts.parentTodoId, itemId: ts.todoItemId } : null;
}

/**
 * Won't do: drop the Todo row and take its plan off the Calendar, as one undo
 * step. The notice's UNDO puts the row back, the "next" links into the task
 * and its own time (a chained plan has none: it follows the one before).
 */
export function wontDoItem(todoId: string, itemId: string): void {
  const board0 = useBoardStore.getState().board;
  const todo = board0?.nodes.find((n) => n.id === todoId && n.kind === 'todo');
  const item = (todo?.state as TodoState | undefined)?.items.find((i) => i.id === itemId);
  if (!board0 || !todo || !item) return;
  const taskId = item.taskNodeId;
  const node0 = taskId ? board0.nodes.find((n) => n.id === taskId) : undefined;
  const was = (node0?.state as { scheduledFor?: string | null } | undefined)?.scheduledFor ?? null;
  const links: Edge[] = taskId ? board0.edges.filter((e) => e.from.event === 'task.next' && e.to.nodeId === taskId) : [];
  void historyGroup(async () => {
    await command(todoId, 'todo.drop', { id: itemId });
    if (taskId) await unscheduleTask(taskId);
  });
  revertible(`Won't do "${item.text}"`, () => {
    void historyGroup(async () => {
      await command(todoId, 'todo.undrop', { id: itemId });
      if (links.length) {
        useBoardStore.setState((st) => {
          if (!st.board) return st;
          const ids = new Set(st.board.nodes.map((n) => n.id));
          const add = links.filter((l) => ids.has(l.from.nodeId) && !st.board!.edges.some((e) => e.id === l.id));
          return add.length ? { ...pushHistory(st), board: { ...st.board, edges: [...st.board.edges, ...add] } } : st;
        });
        const b = useBoardStore.getState().board;
        if (b) void saveBoard(b);
      }
      if (taskId && was) await scheduleTaskAt(taskId, was);
    });
  });
}

/** Won't do for a task card. False when it has no Todo row to drop. */
export function wontDoTask(taskId: string): boolean {
  const row = todoRowOf(taskId);
  if (!row) return false;
  wontDoItem(row.todoId, row.itemId);
  return true;
}

/** Take a done card off the board and out of Done today now (Analytics keeps it). */
export function archiveDoneTask(taskId: string): void {
  const ts = taskState(taskId);
  if (!ts?.done) return;
  undoable(`Archived "${ts.text || 'task'}"`, () => {
    useBoardStore.setState((st) => {
      if (!st.board) return st;
      const draft = { ...st.board, nodes: [...st.board.nodes] };
      if (!archiveTask(draft as unknown as BoardShape, taskId, new Date().toISOString())) return st;
      return { ...pushHistory(st), board: draft };
    });
    const b = useBoardStore.getState().board;
    if (b) void saveBoard(b);
  });
}
