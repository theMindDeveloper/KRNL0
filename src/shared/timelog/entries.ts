// Time log entries (Decision 35, docs/06-requirements/time-log.md F1/F2).
//
// One JSON object per line in `<boardDir>/timelog/YYYY-MM.jsonl`. Entries are
// events, never rewritten: a correction is a new line. Every entry carries
// `v`, `id`, `at` (when it was logged) and — where a task is involved — a
// snapshot of the task text and tag so history reads correctly after the task
// node is gone.
//
// The discriminator is `type` (a `span.closed` entry has its own `kind`:
// work | break). Pure module: no fs, no React, no Electron.

import { z } from 'zod';

const isoString = z.string().refine((s) => Number.isFinite(Date.parse(s)), { message: 'not an ISO date' });

const spanClosed = z.object({
  type: z.literal('span.closed'),
  spanId: z.string().min(1),
  taskId: z.string().nullable(),
  taskText: z.string(),
  tag: z.string().nullable(),
  kind: z.enum(['work', 'break']),
  startedAt: isoString,
  endedAt: isoString,
  /** Added after the fact (F7b), not recorded live. */
  manual: z.boolean().optional(),
});

const spanEdited = z.object({
  type: z.literal('span.edited'),
  spanId: z.string().min(1),
  startedAt: isoString,
  endedAt: isoString,
});

const spanRetagged = z.object({
  type: z.literal('span.retagged'),
  spanId: z.string().min(1),
  taskId: z.string().nullable(),
  taskText: z.string(),
  tag: z.string().nullable(),
});

const spanDeleted = z.object({
  type: z.literal('span.deleted'),
  spanId: z.string().min(1),
});

const planSet = z.object({
  type: z.literal('plan.set'),
  taskId: z.string().min(1),
  taskText: z.string(),
  /** Local wall-clock start as the task stores it (`scheduledFor`, e.g. "2026-11-05T09:00"). */
  start: z.string().min(1),
  durationMin: z.number().nonnegative(),
});

const planCleared = z.object({
  type: z.literal('plan.cleared'),
  taskId: z.string().min(1),
});

const taskCreated = z.object({
  type: z.literal('task.created'),
  taskId: z.string().min(1),
  taskText: z.string(),
  tag: z.string().nullable(),
});

const taskRenamed = z.object({
  type: z.literal('task.renamed'),
  taskId: z.string().min(1),
  taskText: z.string(),
});

const taskCompleted = z.object({
  type: z.literal('task.completed'),
  taskId: z.string().min(1),
  taskText: z.string(),
  tag: z.string().nullable(),
  plannedMin: z.number().nonnegative(),
});

const taskReopened = z.object({
  type: z.literal('task.reopened'),
  taskId: z.string().min(1),
});

// "Clear focus history" (Analytics settings / `analytics clear-history`): every
// recorded span and completion logged before this line no longer counts.
const historyCleared = z.object({
  type: z.literal('history.cleared'),
});

// App sessions (#207 follow-up): when KRNL0 was opened and closed, drawn as
// thin markers on the Clock and the Calendar.
const appOpened = z.object({ type: z.literal('app.opened') });
const appClosed = z.object({ type: z.literal('app.closed') });

const base = {
  v: z.literal(1),
  id: z.string().min(1),
  at: isoString,
};

const optionalBase = {
  v: z.literal(1).optional(),
  id: z.string().min(1).optional(),
  at: isoString.optional(),
};

/** What a writer hands to `logTime` / `appendTimeLog`: the event without `v`, `id`, `at`. */
export const TimeLogPayloadSchema = z.discriminatedUnion('type', [
  spanClosed, spanEdited, spanRetagged, spanDeleted,
  planSet, planCleared,
  taskCreated, taskRenamed, taskCompleted, taskReopened, historyCleared, appOpened, appClosed,
]);

/** A stored line. */
export const TimeLogEntrySchema = z.discriminatedUnion('type', [
  spanClosed.extend(base), spanEdited.extend(base), spanRetagged.extend(base), spanDeleted.extend(base),
  planSet.extend(base), planCleared.extend(base),
  taskCreated.extend(base), taskRenamed.extend(base), taskCompleted.extend(base), taskReopened.extend(base), historyCleared.extend(base), appOpened.extend(base), appClosed.extend(base),
]);

/** What the `timelog:append` IPC accepts: a payload, optionally already stamped. */
export const TimeLogInputSchema = z.discriminatedUnion('type', [
  spanClosed.extend(optionalBase), spanEdited.extend(optionalBase), spanRetagged.extend(optionalBase), spanDeleted.extend(optionalBase),
  planSet.extend(optionalBase), planCleared.extend(optionalBase),
  taskCreated.extend(optionalBase), taskRenamed.extend(optionalBase), taskCompleted.extend(optionalBase), taskReopened.extend(optionalBase), historyCleared.extend(optionalBase), appOpened.extend(optionalBase), appClosed.extend(optionalBase),
]);

export type TimeLogPayload = z.infer<typeof TimeLogPayloadSchema>;
export type TimeLogEntry = z.infer<typeof TimeLogEntrySchema>;
export type TimeLogInput = z.infer<typeof TimeLogInputSchema>;
export type TimeLogEntryType = TimeLogEntry['type'];

export const TIME_LOG_VERSION = 1 as const;

/** Give a payload its `v`, `id` and `at`. Fields already present on `input` win. */
export function stampEntry(
  input: TimeLogInput,
  now: number = Date.now(),
  uuid: () => string = () => globalThis.crypto.randomUUID(),
): TimeLogEntry {
  const stamped = {
    ...input,
    v: TIME_LOG_VERSION,
    id: input.id ?? uuid(),
    at: input.at ?? new Date(now).toISOString(),
  };
  // Re-validate so a bad `at` or shape never reaches the file.
  return TimeLogEntrySchema.parse(stamped);
}

/** One entry as a JSON line (no trailing newline). */
export function serializeEntry(entry: TimeLogEntry): string {
  return JSON.stringify(entry);
}

/**
 * Parse a `.jsonl` file's text. Blank, unparseable or invalid lines (a torn
 * last line after a crash, a hand edit) are skipped, never fatal (NF2).
 */
export function parseTimeLogText(text: string): TimeLogEntry[] {
  const out: TimeLogEntry[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const parsed = TimeLogEntrySchema.safeParse(raw);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** Local `YYYY-MM` of an ISO instant — the month file an entry belongs to. */
export function monthKeyOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Entries in log order: by `at`, ties keep their original order. */
export function sortEntries(entries: readonly TimeLogEntry[]): TimeLogEntry[] {
  return entries
    .map((e, i) => ({ e, i, t: Date.parse(e.at) }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map((x) => x.e);
}
