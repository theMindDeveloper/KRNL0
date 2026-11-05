// Time log store (Decision 35, time-log F1/F4, NF1/NF2/NF4). Main process only.
//
// `<boardDir>/timelog/YYYY-MM.jsonl` — one JSON entry per line, append-only.
// `boardDir` is the folder that holds board.json, so each worktree's
// KRNL0_BOARD_DIR (scripts/dev.mjs) gets its own log. Pure fs: no Electron,
// safe to import from the sys CLI and from tests.

import { appendFileSync, closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  backfillEntries,
  monthKeyOf,
  parseTimeLogText,
  serializeEntry,
  sortEntries,
  stampEntry,
  timeLogEntriesFromBoards,
  type BackfillBoardLike,
  type TimeLogEntry,
  type TimeLogInput,
} from '../../shared/timelog';
import { isValidYMD } from '../../shared/ymd';

export const TIMELOG_DIRNAME = 'timelog';
export const BACKFILL_MARKER = '.backfilled';
/**
 * Months read before `from` by `queryTimeLog`: plans are often set ahead of
 * the day they plan, and a fold needs them for plan-vs-actual.
 */
export const QUERY_LOOKBACK_MONTHS = 2;

const MONTH_FILE = /^(\d{4}-\d{2})\.jsonl$/;

export function timeLogDir(boardDir: string): string {
  return join(boardDir, TIMELOG_DIRNAME);
}

export function monthFilePath(boardDir: string, monthKey: string): string {
  return join(timeLogDir(boardDir), `${monthKey}.jsonl`);
}

/** Months (`YYYY-MM`) that have a file, oldest first. */
export function listTimeLogMonths(boardDir: string): string[] {
  const dir = timeLogDir(boardDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((f) => MONTH_FILE.exec(f)?.[1])
    .filter((m): m is string => m !== undefined)
    .sort();
}

/** True when the file exists, is non-empty and its last byte isn't a newline (a torn write). */
function endsTorn(path: string): boolean {
  if (!existsSync(path)) return false;
  const fd = openSync(path, 'r');
  try {
    const size = fstatSync(fd).size;
    if (size === 0) return false;
    const buf = Buffer.alloc(1);
    readSync(fd, buf, 0, 1, size - 1);
    return buf[0] !== 0x0a;
  } finally {
    closeSync(fd);
  }
}

/**
 * Append already-stamped entries. One `appendFileSync` per month file with
 * every line complete (NF2). A file whose last line was torn by a crash gets
 * a newline first, so the torn fragment stays a lone (skipped) line instead
 * of swallowing the next entry.
 */
export function appendTimeLogEntries(boardDir: string, entries: readonly TimeLogEntry[]): void {
  if (entries.length === 0) return;
  const byMonth = new Map<string, TimeLogEntry[]>();
  for (const e of entries) {
    const key = monthKeyOf(e.at);
    const list = byMonth.get(key) ?? [];
    list.push(e);
    byMonth.set(key, list);
  }
  mkdirSync(timeLogDir(boardDir), { recursive: true });
  for (const [key, list] of byMonth) {
    const path = monthFilePath(boardDir, key);
    const lead = endsTorn(path) ? '\n' : '';
    appendFileSync(path, lead + list.map(serializeEntry).join('\n') + '\n', 'utf-8');
  }
}

/**
 * Stamp (`v`, `id`, `at` when missing) and append. An input that fails
 * validation is dropped, the rest are stored. Returns the stored entries.
 */
export function appendTimeLog(boardDir: string, inputs: readonly TimeLogInput[], now: number = Date.now()): TimeLogEntry[] {
  const entries: TimeLogEntry[] = [];
  for (const i of inputs) {
    try {
      entries.push(stampEntry(i, now));
    } catch { /* invalid entry — dropped */ }
  }
  appendTimeLogEntries(boardDir, entries);
  return entries;
}

/** Every entry of one month file (invalid / torn lines skipped). */
export function readTimeLogMonth(boardDir: string, monthKey: string): TimeLogEntry[] {
  const path = monthFilePath(boardDir, monthKey);
  if (!existsSync(path)) return [];
  return parseTimeLogText(readFileSync(path, 'utf-8'));
}

/** Entries of the month files from `fromMonth` to `toMonth` (inclusive, either open), in log order. */
export function readTimeLog(boardDir: string, opts: { fromMonth?: string; toMonth?: string } = {}): TimeLogEntry[] {
  const months = listTimeLogMonths(boardDir).filter((m) =>
    (opts.fromMonth === undefined || m >= opts.fromMonth) && (opts.toMonth === undefined || m <= opts.toMonth));
  return sortEntries(months.flatMap((m) => readTimeLogMonth(boardDir, m)));
}

/** `YYYY-MM` `n` months before the month of `ymd`. */
export function monthsBefore(ymd: string, n: number): string {
  const [y, m] = ymd.split('-').map(Number) as [number, number];
  const d = new Date(y, m - 1 - n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Entries needed to fold the local days `fromYMD`..`toYMD`: every file from a
 * little before `from` (plans set ahead) through the newest one — a span is
 * often corrected, retagged or added (F7b) in a later month than it happened.
 * The result may include entries outside the range; `foldTimeLog` clips.
 */
export function queryTimeLog(boardDir: string, fromYMD: string, toYMD: string): TimeLogEntry[] {
  if (!isValidYMD(fromYMD) || !isValidYMD(toYMD)) throw new Error('timelog query needs YYYY-MM-DD dates');
  return readTimeLog(boardDir, { fromMonth: monthsBefore(fromYMD, QUERY_LOOKBACK_MONTHS) });
}

// ── backfill (F4) ──────────────────────────────────────────────────────────

const backfilledDirs = new Set<string>();

export function isTimeLogBackfilled(boardDir: string): boolean {
  if (backfilledDirs.has(boardDir)) return true;
  if (existsSync(join(timeLogDir(boardDir), BACKFILL_MARKER))) {
    backfilledDirs.add(boardDir);
    return true;
  }
  return false;
}

/** Forget the in-process memo (tests). */
export function resetTimeLogBackfillMemo(): void {
  backfilledDirs.clear();
}

/**
 * One-time backfill from the board: pomo history → span.closed, current
 * plans → plan.set, the completion ledger → task.completed. Skips what the
 * log already holds, then writes the marker — only after the append
 * succeeded. A no-op once the marker exists. `board` may be a thunk so the
 * board is only read when a backfill is actually due; a thunk that throws
 * (unreadable board.json) leaves no marker, so the next start retries.
 * Returns how many entries were written.
 */
export function ensureTimeLogBackfilled(
  boardDir: string,
  board: BackfillBoardLike | null | (() => BackfillBoardLike | null),
  now: number = Date.now(),
): number {
  if (isTimeLogBackfilled(boardDir)) return 0;
  const b = typeof board === 'function' ? board() : board;
  if (!b || !Array.isArray(b.nodes)) return 0;
  const entries = backfillEntries(b, readTimeLog(boardDir), now);
  appendTimeLogEntries(boardDir, entries);
  mkdirSync(timeLogDir(boardDir), { recursive: true });
  writeFileSync(join(timeLogDir(boardDir), BACKFILL_MARKER), `${new Date(now).toISOString()} ${entries.length}\n`, 'utf-8');
  backfilledDirs.add(boardDir);
  return entries.length;
}

/**
 * CLI writer (F3): log what changed between two board snapshots taken around
 * one command. Backfills from `prev` first, so the backfill never repeats a
 * change this call is about to log. Never throws — logging must not block
 * the action. Returns the entries written.
 */
export function logBoardChange(boardDir: string, prev: unknown, next: unknown, now: number = Date.now()): TimeLogEntry[] {
  try {
    const before = asBackfillBoard(prev);
    const after = asBackfillBoard(next);
    if (!before || !after) return [];
    const payloads = timeLogEntriesFromBoards(before, after);
    if (payloads.length === 0) return [];
    try {
      ensureTimeLogBackfilled(boardDir, before, now);
    } catch (err) {
      // The change itself is still logged; the backfill retries next time.
      console.warn('[timelog] backfill failed:', err instanceof Error ? err.message : err);
    }
    return appendTimeLog(boardDir, payloads, now);
  } catch (err) {
    console.warn('[timelog] could not log a change:', err instanceof Error ? err.message : err);
    return [];
  }
}

/** Read board.json loosely for the backfill; null when it can't be used. */
export function asBackfillBoard(raw: unknown): BackfillBoardLike | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const nodes = (raw as { nodes?: unknown }).nodes;
  if (!Array.isArray(nodes)) return null;
  return raw as BackfillBoardLike;
}
