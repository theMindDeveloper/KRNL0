// One-time backfill from the board (time-log F4). Pure: the main store does
// the I/O and writes the marker file.
//
// Backfilled entries keep their real dates: a span's `at` is its `endedAt`
// and a completion's `at` is the ledger's `completedAt`, so they land in the
// month files (and on the days) they happened. Current plans are logged now.

import type { TimeLogEntry, TimeLogPayload } from './entries';
import { stampEntry } from './entries';
import { planOf, timeLogEntriesFromBoards, type TimeLogBoardLike } from './diff';
import type { TaskState } from '../../renderer/components/nodes/TaskNode/types';

interface LedgerLike {
  taskId?: unknown;
  text?: unknown;
  plannedMin?: unknown;
  completedAt?: unknown;
  tag?: unknown;
}

export interface BackfillBoardLike extends TimeLogBoardLike {
  completions?: ReadonlyArray<LedgerLike>;
}

const validIso = (s: unknown): s is string => typeof s === 'string' && Number.isFinite(Date.parse(s));

/**
 * Entries that bring a log up to the board: every recorded span not already
 * logged, every current plan not already logged with the same start, and
 * every ledger completion not already logged at that time. Idempotent when
 * `existing` holds what a previous run wrote.
 */
export function backfillEntries(
  board: BackfillBoardLike,
  existing: readonly TimeLogEntry[],
  now: number = Date.now(),
  uuid?: () => string,
): TimeLogEntry[] {
  const loggedSpans = new Set<string>();
  const loggedPlans = new Set<string>();
  const loggedCompletions = new Set<string>();
  for (const e of existing) {
    if (e.type === 'span.closed') loggedSpans.add(e.spanId);
    else if (e.type === 'plan.set') loggedPlans.add(`${e.taskId}|${e.start}`);
    else if (e.type === 'task.completed') loggedCompletions.add(`${e.taskId}|${Date.parse(e.at)}`);
  }
  const out: TimeLogEntry[] = [];
  // One bad record (a hand-edited time) is skipped, never fatal: a throw here
  // would leave no marker and retry — and fail — on every start.
  const stamp = (p: TimeLogPayload, at: string | undefined): void => {
    try {
      out.push(stampEntry(at ? { ...p, at } : p, now, uuid));
    } catch { /* invalid entry — skipped */ }
  };

  // Spans: the same snapshot the live writer takes (diff of an empty pomo).
  const empty: TimeLogBoardLike = {
    nodes: board.nodes.map((n) => (n.kind === 'pomo' ? { ...n, state: { ...(n.state as object | undefined), history: [] } } : n)),
  };
  for (const p of timeLogEntriesFromBoards(empty, board)) {
    if (p.type !== 'span.closed' || loggedSpans.has(p.spanId)) continue;
    stamp(p, validIso(p.endedAt) ? p.endedAt : undefined);
  }

  // Plans as they stand now.
  for (const n of board.nodes) {
    if (n.kind !== 'todo.task') continue;
    const state = (n.state ?? {}) as Partial<TaskState>;
    const plan = planOf(state);
    if (!plan || loggedPlans.has(`${n.id}|${plan.start}`)) continue;
    stamp({ type: 'plan.set', taskId: n.id, taskText: typeof state.text === 'string' ? state.text : '', start: plan.start, durationMin: plan.durationMin }, undefined);
  }

  // The completion ledger (one record per task on the board).
  for (const c of board.completions ?? []) {
    if (typeof c.taskId !== 'string' || !c.taskId || !validIso(c.completedAt)) continue;
    if (loggedCompletions.has(`${c.taskId}|${Date.parse(c.completedAt)}`)) continue;
    stamp({
      type: 'task.completed',
      taskId: c.taskId,
      taskText: typeof c.text === 'string' ? c.text : '',
      tag: typeof c.tag === 'string' && c.tag ? c.tag : null,
      plannedMin: typeof c.plannedMin === 'number' && Number.isFinite(c.plannedMin) && c.plannedMin >= 0 ? c.plannedMin : 0,
    }, c.completedAt);
  }
  return out;
}
