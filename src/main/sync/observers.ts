// Write observers (Decision 51). Every board, board-list, time-log and asset
// write in main goes through one of a few functions; each calls these so the
// sync service learns about the change without the callers knowing sync exists.
// Pure: no Electron, safe for the sys CLI (which never registers anything).

import type { TimeLogEntry } from '../../shared/timelog';

type FileListener = (path: string) => void;
type TimelogListener = (boardDir: string, entries: readonly TimeLogEntry[]) => void;
type AssetListener = (assetId: string) => void;

const fileListeners = new Set<FileListener>();
const timelogListeners = new Set<TimelogListener>();
const assetListeners = new Set<AssetListener>();
let quiet = 0;

export function onFileWritten(fn: FileListener): () => void { fileListeners.add(fn); return () => fileListeners.delete(fn); }
export function onTimelogAppended(fn: TimelogListener): () => void { timelogListeners.add(fn); return () => timelogListeners.delete(fn); }
export function onAssetStored(fn: AssetListener): () => void { assetListeners.add(fn); return () => assetListeners.delete(fn); }

/** Runs `fn` without telling anyone: the sync host's own writes of what came from the server. */
export function quietly<T>(fn: () => T): T {
  quiet++;
  try { return fn(); } finally { quiet--; }
}

export function fileWritten(path: string): void {
  if (quiet > 0) return;
  for (const fn of fileListeners) { try { fn(path); } catch { /* a listener never breaks a save */ } }
}

export function timelogAppended(boardDir: string, entries: readonly TimeLogEntry[]): void {
  if (quiet > 0 || entries.length === 0) return;
  for (const fn of timelogListeners) { try { fn(boardDir, entries); } catch { /* never breaks a log write */ } }
}

export function assetStored(assetId: string): void {
  if (quiet > 0) return;
  for (const fn of assetListeners) { try { fn(assetId); } catch { /* never breaks an upload */ } }
}
