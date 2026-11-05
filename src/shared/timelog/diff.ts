// The one writer choke point for the time log (Decision 35, time-log F3).
//
// Instead of a logging call beside every mutation site (task toggle and its
// todo mirror, the calendar's direct reducers, pomo verbs, CLI and renderer
// twins…), both process sides diff the board before and after a change and
// append what changed:
//
//   renderer — a Zustand subscription on boardStore (store/timeLog.ts)
//   CLI      — SysFacade.run snapshots board.json around pomo/task/todo verbs
//
// Pure: no fs, no React, no IPC.

import type { TimeLogPayload } from './entries';
import { completionTagFor } from '../dispatch/task';
import type { TaskState } from '../../renderer/components/nodes/TaskNode/types';

export interface TimeLogBoardNode {
  id: string;
  kind: string;
  state?: unknown;
}

export interface TimeLogBoardLike {
  nodes: ReadonlyArray<TimeLogBoardNode>;
}

interface SpanLike {
  id: string;
  startedAt: string;
  endedAt: string;
  label: string;
  taskId: string | null;
  tag: string | null;
  kind: 'work' | 'break';
  manual: boolean;
}

interface PlanLike {
  start: string;
  durationMin: number;
}

interface TaskLike {
  text: string;
  done: boolean;
  completedAt: string | null;
  plan: PlanLike | null;
  plannedMin: number;
  state: Partial<TaskState>;
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

function readSpan(raw: unknown): SpanLike | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = str(r['id']);
  const endedAt = str(r['endedAt']);
  // A record without a real end time can't be logged (or folded): skip it
  // rather than let one bad legacy / hand-edited record fail a whole batch.
  if (!id || !Number.isFinite(Date.parse(endedAt))) return null;
  const startedAt = str(r['startedAt']);
  return {
    id,
    // Legacy records may lack a start: treat as a zero-length span at the end.
    startedAt: Number.isFinite(Date.parse(startedAt)) ? startedAt : endedAt,
    endedAt,
    label: str(r['label']),
    taskId: typeof r['taskId'] === 'string' && r['taskId'] ? (r['taskId'] as string) : null,
    tag: typeof r['tag'] === 'string' && r['tag'] ? (r['tag'] as string) : null,
    kind: r['kind'] === 'break' ? 'break' : 'work',
    manual: r['manual'] === true,
  };
}

/** Recorded spans of every pomo node, by span id. */
function spansOf(board: TimeLogBoardLike): Map<string, SpanLike> {
  const out = new Map<string, SpanLike>();
  for (const n of board.nodes) {
    if (n.kind !== 'pomo') continue;
    const history = (n.state as { history?: unknown } | undefined)?.history;
    if (!Array.isArray(history)) continue;
    for (const raw of history) {
      const s = readSpan(raw);
      if (s) out.set(s.id, s);
    }
  }
  return out;
}

/** The plan a task's calendar block shows: start + block length. */
export function planOf(state: Partial<TaskState> | undefined): PlanLike | null {
  const start = state?.scheduledFor;
  if (typeof start !== 'string' || !start) return null;
  const durationMin = num(state?.scheduledDurationMin) ?? num(state?.plannedMin) ?? num(state?.durationMin) ?? 0;
  return { start, durationMin };
}

function readTask(n: TimeLogBoardNode): TaskLike {
  const state = (n.state ?? {}) as Partial<TaskState>;
  return {
    text: str(state.text),
    done: state.done === true,
    completedAt: typeof state.completedAt === 'string' ? state.completedAt : null,
    plan: planOf(state),
    plannedMin: num(state.plannedMin) ?? num(state.durationMin) ?? 0,
    state,
  };
}

function tasksOf(board: TimeLogBoardLike): Map<string, { node: TimeLogBoardNode; task: TaskLike }> {
  const out = new Map<string, { node: TimeLogBoardNode; task: TaskLike }>();
  for (const n of board.nodes) {
    if (n.kind === 'todo.task') out.set(n.id, { node: n, task: readTask(n) });
  }
  return out;
}

/** The tag a task files under (todo item tag, task tag, else the classifier) — null when none. */
function taskTag(board: TimeLogBoardLike, state: Partial<TaskState>): string | null {
  try {
    const nodes = board.nodes.map((n) => ({ id: n.id, kind: n.kind, state: n.state }));
    return completionTagFor({ nodes }, {
      text: str(state.text),
      parentTodoId: str(state.parentTodoId),
      todoItemId: typeof state.todoItemId === 'string' ? state.todoItemId : null,
      ...(typeof state.tag === 'string' ? { tag: state.tag } : {}),
    }) ?? null;
  } catch {
    return null;
  }
}

/** Snapshot of what a span counts toward: the task's text (or the span label) and tag. */
function spanSnapshot(board: TimeLogBoardLike, tasks: Map<string, { task: TaskLike }>, s: SpanLike): { taskText: string; tag: string | null } {
  const t = s.taskId ? tasks.get(s.taskId) : undefined;
  if (t) return { taskText: t.task.text || s.label, tag: s.tag ?? taskTag(board, t.task.state) };
  return { taskText: s.label, tag: s.tag };
}

function samePlan(a: PlanLike | null, b: PlanLike | null): boolean {
  if (a === null || b === null) return a === b;
  return a.start === b.start && a.durationMin === b.durationMin;
}

/**
 * Fast paths: the same task node objects / the same pomo `history` arrays
 * (by reference — the renderer store keeps untouched nodes) mean that side
 * has nothing to log, so a task edit never walks the whole span history.
 */
function sameRefs(prev: TimeLogBoardLike, next: TimeLogBoardLike, pick: (n: TimeLogBoardNode) => unknown | undefined): boolean {
  if (prev.nodes === next.nodes) return true;
  const collect = (b: TimeLogBoardLike): unknown[] => {
    const out: unknown[] = [];
    for (const n of b.nodes) {
      const v = pick(n);
      if (v !== undefined) out.push(v);
    }
    return out;
  };
  const a = collect(prev);
  const b = collect(next);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
const taskRef = (n: TimeLogBoardNode): unknown | undefined => (n.kind === 'todo.task' ? n : undefined);
const historyRef = (n: TimeLogBoardNode): unknown | undefined =>
  (n.kind === 'pomo' ? (n.state as { history?: unknown } | undefined)?.history ?? null : undefined);

/**
 * Time-log entries for the change from `prev` to `next`.
 *
 *  spans (pomo `history`, by record id): new → span.closed, gone → span.deleted,
 *    start/end moved → span.edited, task/label/tag changed → span.retagged
 *  tasks (`todo.task` nodes): new → task.created (+ plan.set when it comes
 *    scheduled), text → task.renamed, done false→true or a new completedAt →
 *    task.completed, true→false → task.reopened, plan start/length changed →
 *    plan.set, unscheduled → plan.cleared. A deleted task logs nothing: its
 *    history stays in the log (that is the point).
 */
export function timeLogEntriesFromBoards(
  prev: TimeLogBoardLike | null | undefined,
  next: TimeLogBoardLike | null | undefined,
): TimeLogPayload[] {
  if (!prev || !next || !Array.isArray(prev.nodes) || !Array.isArray(next.nodes)) return [];
  const tasksSame = sameRefs(prev, next, taskRef);
  const spansSame = sameRefs(prev, next, historyRef);
  if (tasksSame && spansSame) return [];
  const out: TimeLogPayload[] = [];

  const prevTasks = tasksSame ? new Map<string, { node: TimeLogBoardNode; task: TaskLike }>() : tasksOf(prev);
  const nextTasks = tasksOf(next);

  // ── tasks ────────────────────────────────────────────────────────────────
  for (const [id, { node, task }] of tasksSame ? [] : nextTasks) {
    const before = prevTasks.get(id);
    if (before && before.node === node) continue;
    if (!before) {
      out.push({ type: 'task.created', taskId: id, taskText: task.text, tag: taskTag(next, task.state) });
      if (task.plan) out.push({ type: 'plan.set', taskId: id, taskText: task.text, start: task.plan.start, durationMin: task.plan.durationMin });
      continue;
    }
    const was = before.task;
    if (was.text !== task.text) out.push({ type: 'task.renamed', taskId: id, taskText: task.text });
    if (task.done && (!was.done || (task.completedAt !== null && task.completedAt !== was.completedAt))) {
      out.push({ type: 'task.completed', taskId: id, taskText: task.text, tag: taskTag(next, task.state), plannedMin: task.plannedMin });
    } else if (!task.done && was.done) {
      out.push({ type: 'task.reopened', taskId: id });
    }
    if (!samePlan(was.plan, task.plan)) {
      out.push(task.plan
        ? { type: 'plan.set', taskId: id, taskText: task.text, start: task.plan.start, durationMin: task.plan.durationMin }
        : { type: 'plan.cleared', taskId: id });
    }
  }

  // ── spans ────────────────────────────────────────────────────────────────
  if (spansSame) return out;
  const prevSpans = spansOf(prev);
  const nextSpans = spansOf(next);
  for (const [id, s] of nextSpans) {
    const before = prevSpans.get(id);
    if (!before) {
      const snap = spanSnapshot(next, nextTasks, s);
      out.push({
        type: 'span.closed',
        spanId: id,
        taskId: s.taskId,
        taskText: snap.taskText,
        tag: snap.tag,
        kind: s.kind,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        ...(s.manual ? { manual: true } : {}),
      });
      continue;
    }
    if (before.startedAt !== s.startedAt || before.endedAt !== s.endedAt) {
      out.push({ type: 'span.edited', spanId: id, startedAt: s.startedAt, endedAt: s.endedAt });
    }
    if (before.taskId !== s.taskId || before.label !== s.label || before.tag !== s.tag) {
      const snap = spanSnapshot(next, nextTasks, s);
      out.push({ type: 'span.retagged', spanId: id, taskId: s.taskId, taskText: snap.taskText, tag: snap.tag });
    }
  }
  for (const id of prevSpans.keys()) {
    if (!nextSpans.has(id)) out.push({ type: 'span.deleted', spanId: id });
  }
  return out;
}
