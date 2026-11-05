// Durable time log — renderer side (Decision 35, time-log F3).
//
//   logTime(entry | entries)      fire-and-forget append via IPC `timelog:append`;
//                                 never throws, never blocks the user action.
//   queryTimeLog(from, to)        entries a fold of local days from..to needs
//                                 (IPC `timelog:query`); [] outside Electron.
//   installTimeLogWriter()        the renderer writer: diffs every boardStore
//                                 change (shared/timelog/diff.ts) and logs it.
//
// Fold the result with `foldTimeLog` from src/shared/timelog.

import { useBoardStore } from './boardStore';
import { isTimeLogPaused } from './timeLogPause';
import {
  stampEntry,
  TimeLogEntrySchema,
  timeLogEntriesFromBoards,
  type TimeLogEntry,
  type TimeLogInput,
} from '../../shared/timelog';
import { isValidYMD } from '../../shared/ymd';

function bridge(): Window['krnl'] | undefined {
  return typeof window !== 'undefined' ? window.krnl : undefined;
}

/**
 * Append one or more entries. `id` / `at` are stamped here (the moment of the
 * action) unless given. Fire-and-forget: errors are swallowed and logged.
 */
export function logTime(input: TimeLogInput | readonly TimeLogInput[]): void {
  try {
    const append = bridge()?.timelogAppend;
    if (!append) return;
    const list = Array.isArray(input) ? (input as readonly TimeLogInput[]) : [input as TimeLogInput];
    if (list.length === 0) return;
    const now = Date.now();
    const entries: TimeLogEntry[] = [];
    for (const i of list) {
      try {
        entries.push(stampEntry(i, now));
      } catch (err) {
        console.warn('[timelog] invalid entry dropped:', err instanceof Error ? err.message : err);
      }
    }
    if (entries.length === 0) return;
    void append(entries).catch((err: unknown) => {
      console.warn('[timelog] append failed:', err instanceof Error ? err.message : err);
    });
  } catch (err) {
    console.warn('[timelog] not logged:', err instanceof Error ? err.message : err);
  }
}

/**
 * Entries needed to fold the local days `fromYMD`..`toYMD` (may include
 * entries outside the range — `foldTimeLog` clips). Never rejects: [] when
 * the bridge is missing or the query fails.
 */
export async function queryTimeLog(fromYMD: string, toYMD: string): Promise<TimeLogEntry[]> {
  const query = bridge()?.timelogQuery;
  if (!query || !isValidYMD(fromYMD) || !isValidYMD(toYMD)) return [];
  try {
    const raw = await query(fromYMD, toYMD);
    const out: TimeLogEntry[] = [];
    for (const r of Array.isArray(raw) ? raw : []) {
      const parsed = TimeLogEntrySchema.safeParse(r);
      if (parsed.success) out.push(parsed.data);
    }
    return out;
  } catch (err) {
    console.warn('[timelog] query failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * The renderer writer: every board change made in this window (UI, command
 * dispatch, cli:dispatch, undo/redo) is diffed and logged. Loads, reloads
 * after a CLI write, factory reset and clear-history are skipped (see
 * timeLogPause.ts). Returns the unsubscribe function. Idempotent per store.
 */
let installed: (() => void) | null = null;

export function installTimeLogWriter(): () => void {
  if (installed) return installed;
  const unsubscribe = useBoardStore.subscribe((state, prev) => {
    // Runs inside the store's set(): must never throw.
    try {
      if (state.board === prev.board || !state.board || !prev.board) return;
      if (isTimeLogPaused() || !bridge()?.timelogAppend) return;
      const entries = timeLogEntriesFromBoards(prev.board, state.board);
      if (entries.length > 0) logTime(entries);
    } catch (err) {
      console.warn('[timelog] diff failed:', err instanceof Error ? err.message : err);
    }
  });
  installed = () => {
    unsubscribe();
    installed = null;
  };
  return installed;
}
