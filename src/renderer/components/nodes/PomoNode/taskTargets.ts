// Which tasks a recorded span can count toward, and the name of the task a
// span is tagged with (#204). Shared by the Pomo picker / span labeler and the
// Calendar retag list so every surface offers the same tasks.

import type { TaskState } from '../TaskNode/types';

export interface TaskTarget {
  id: string;
  text: string;
  done: boolean;
}

interface NodeLike {
  id: string;
  kind: string;
  state: unknown;
}

/** Local midnight of the day containing `nowMs`. */
export function startOfLocalDayMs(nowMs: number): number {
  const d = new Date(nowMs);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Root tasks a span can be tagged with: open tasks first (board order), then
 * done tasks, most recently completed first. A finished task stays taggable,
 * so ticking a task done never strands the time spent on it. `doneSinceMs`
 * keeps only done tasks completed at or after that moment (the Pomo shows
 * "Done today").
 */
export function spanTaskTargets(
  nodes: readonly NodeLike[] | undefined,
  opts: { doneSinceMs?: number } = {},
): TaskTarget[] {
  const open: TaskTarget[] = [];
  const done: Array<TaskTarget & { at: number }> = [];
  for (const n of nodes ?? []) {
    if (n.kind !== 'todo.task') continue;
    const s = n.state as TaskState;
    if (s.parentTaskId !== null) continue;
    if (!s.done) {
      open.push({ id: n.id, text: s.text, done: false });
      continue;
    }
    const at = s.completedAt ? Date.parse(s.completedAt) : NaN;
    if (opts.doneSinceMs !== undefined && !(Number.isFinite(at) && at >= opts.doneSinceMs)) continue;
    done.push({ id: n.id, text: s.text, done: true, at: Number.isFinite(at) ? at : 0 });
  }
  done.sort((a, b) => b.at - a.at);
  return [...open, ...done.map(({ id, text, done: d }) => ({ id, text, done: d }))];
}

/** Encode targets as strings so a zustand `useShallow` selector stays stable. */
export function encodeTargets(targets: readonly TaskTarget[]): string[] {
  return targets.map((t) => `${t.id}\u0000${t.done ? '1' : '0'}\u0000${t.text}`);
}

export function decodeTargets(keys: readonly string[]): TaskTarget[] {
  return keys.map((k) => {
    const [id = '', done = '0', ...rest] = k.split('\u0000');
    return { id, done: done === '1', text: rest.join('\u0000') };
  });
}

/**
 * Name of the task a span counts toward: the task's current text, else the
 * span's own label (the task text when it was tagged — survives the task
 * being deleted), else null when the span has no task.
 */
export function spanTaskName(
  nodes: readonly NodeLike[] | undefined,
  seg: { taskId: string | null | undefined; label?: string | null },
): string | null {
  if (!seg.taskId) return null;
  const n = (nodes ?? []).find((x) => x.id === seg.taskId);
  const text = n && n.kind === 'todo.task' ? (n.state as TaskState).text : '';
  return text.trim() || seg.label?.trim() || 'task';
}
