// #169 — completion ledger operations (pure).
//
// The ledger is a durable, node-independent record of completed tasks. It lives
// on Board.completions and is the analytics source of truth for "tasks done":
// deleting a task node never erases its completion, while an undone or
// never-completed task leaves no trace.
//
// All operations are upsert-by-taskId and idempotent, so the todo↔task mirror
// (which can fire the same completion through two handlers) can call them from
// either site without double-counting.

import type { CompletionRecord } from '../../shared/types/board';

/**
 * Record (or refresh) a completion keyed by taskId. Idempotent upsert: a second
 * call for the same taskId replaces the prior entry rather than appending, so
 * the todo/task mirror cannot create duplicates.
 */
export function recordCompletion(
  ledger: readonly CompletionRecord[] | undefined,
  entry: CompletionRecord,
): CompletionRecord[] {
  const base = ledger ?? [];
  const without = base.filter((c) => c.taskId !== entry.taskId);
  return [...without, entry];
}

/**
 * Remove the completion for a taskId (task reopened: done → undone). Idempotent:
 * no-op when absent. Returns the same array reference when nothing changed so
 * callers can skip a write.
 */
export function clearCompletion(
  ledger: readonly CompletionRecord[] | undefined,
  taskId: string,
): CompletionRecord[] {
  const base = ledger ?? [];
  const next = base.filter((c) => c.taskId !== taskId);
  return next.length === base.length ? [...base] : next;
}
