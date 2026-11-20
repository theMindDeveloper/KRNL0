// Board persistence — pure load/save with migrations.
// Both the Electron main process (handlers.ts) and the sys CLI
// (sys/commands/*.ts) read/write through this module.

import { copyFileSync, existsSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileWritten } from '../sync/observers';
import { migrateBoard, seedBoard } from '../../shared/boardMigrate';

// The migrations live in shared/ so the web app runs the very same code.
export { migrateBoard, migrateCanvases, migrateWhenModel, seedBoard } from '../../shared/boardMigrate';
export type { PartialBoard } from '../../shared/boardMigrate';

export class BoardUnreadableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'BoardUnreadableError';
  }
}

/**
 * board.json exists but is not a board (bad JSON). It has been copied aside
 * (`.corrupt-<time>`). Writers that hold no good copy of their own must not
 * write a fresh board over it; the open window, which does, rewrites it.
 */
export class BoardCorruptError extends BoardUnreadableError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'BoardCorruptError';
  }
}

/** True when board.json exists and reads, but is not valid JSON. */
export function boardFileIsCorrupt(boardPath: string): boolean {
  let raw: string | null;
  try { raw = existsSync(boardPath) ? readFileSync(boardPath, 'utf8') : null; } catch { return false; }
  if (raw === null) return false;
  try { JSON.parse(raw); return false; } catch { return true; }
}

const TRANSIENT_READ_CODES = new Set(['EBUSY', 'EPERM', 'EACCES', 'EMFILE', 'ENFILE', 'EAGAIN']);

/**
 * Read board.json as text. Returns null when the file does not exist. A read
 * blocked by antivirus / OneDrive is retried briefly; if it still fails this
 * throws BoardUnreadableError instead of pretending the board is empty.
 */
export function readBoardText(boardPath: string): string | null {
  for (let attempt = 0; ; attempt++) {
    try {
      return readFileSync(boardPath, 'utf-8');
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? '';
      if (code === 'ENOENT') return null;
      if (TRANSIENT_READ_CODES.has(code) && attempt < 5) {
        sleepSync(40 * (attempt + 1));
        continue;
      }
      throw new BoardUnreadableError(`board.json could not be read (${code || 'error'}) — is another program holding it?`, err);
    }
  }
}

/**
 * Every load-time migration and invariant fix, in order, on an already
 * parsed board. Idempotent: a settled board comes back unchanged in content.
 * Also used to put boards from different sources into one shape before
 * comparing them (the stale-save merge).
 */
export function loadBoardFrom(boardPath: string, opts: { seedIfCorrupt?: boolean } = {}): unknown {
  try {
    const raw = existsSync(boardPath) ? readBoardText(boardPath) : null;
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      return migrateBoard(parsed);
    }
  } catch (err) {
    if (err instanceof BoardUnreadableError) throw err;
    // The file exists but cannot be parsed/migrated. Keep a copy before we
    // hand back the seed — the next save would otherwise overwrite the user's
    // only copy of their board. No copy, no seed.
    if (!backupCorruptBoard(boardPath, err)) {
      throw new BoardUnreadableError('board.json is unreadable and could not be backed up; it was left untouched', err);
    }
    // Callers that would merge with or write over this file get an error, not
    // an empty board: merging against the seed reads as "everything deleted".
    if (opts.seedIfCorrupt === false) throw new BoardCorruptError('board.json is damaged (a copy was kept as board.json.corrupt-…)', err);
  }
  return seedBoard();
}

/**
 * Copy an unreadable board.json aside as `board.json.corrupt-<timestamp>`.
 * True when the data is safe to replace (copied, or there was no file).
 */
const backedUp = new Map<string, string>();

export function backupCorruptBoard(boardPath: string, err: unknown): boolean {
  try {
    if (!existsSync(boardPath)) return true;
    // One copy per version of the broken file: readers that retry (the
    // reminder check every 30 s) must not fill the disk with copies.
    const st = statSync(boardPath);
    const version = `${st.size}:${st.mtimeMs}`;
    if (backedUp.get(boardPath) === version) return true;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    copyFileSync(boardPath, `${boardPath}.corrupt-${stamp}`);
    backedUp.set(boardPath, version);
    console.error(`[board] could not read ${boardPath}; backed up as .corrupt-${stamp}`, err);
    return true;
  } catch (backupErr) {
    console.error('[board] failed to back up corrupt board', backupErr);
    return false;
  }
}

export function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Write `text` to `path` atomically: write a sibling temp file, then rename it
 * over the target. A crash mid-write leaves the old file intact instead of a
 * truncated one. On Windows, rename can fail transiently (EPERM/EBUSY) while
 * antivirus or another reader holds the file, so it is retried briefly.
 */
export function writeFileAtomic(path: string, text: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  // Unique per writer: two processes (a second app instance, a CLI) must
  // never truncate each other's half-written temp file.
  const tmp = `${path}.${process.pid}-${Math.random().toString(36).slice(2, 8)}.tmp`;
  try {
    writeFileSync(tmp, text, 'utf-8');
  } catch (err) {
    try { unlinkSync(tmp); } catch { /* never created */ }
    throw err;
  }
  for (let attempt = 0; ; attempt++) {
    try {
      renameSync(tmp, path);
      fileWritten(path); // Decision 51: the sync service learns about every board / board-list write
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if ((code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') && attempt < 5) {
        sleepSync(20 * (attempt + 1));
        continue;
      }
      try { unlinkSync(tmp); } catch { /* ignore */ }
      throw err;
    }
  }
}

/** Revision of board.json on disk (mtime in ms), or null when it doesn't exist. */
export function boardFileRev(boardPath: string): number | null {
  try {
    return statSync(boardPath).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Tracks the board.json revision the renderer last loaded or wrote, so a
 * renderer save that would overwrite a newer write (sys CLI, Codex) is
 * refused instead of silently reverting it.
 */
export class RendererRevGuard {
  private rev: number | null = null;

  constructor(private readonly boardPath: string) {}

  /** Call after the renderer loaded the board or after it saved successfully. */
  sync(): void {
    this.rev = boardFileRev(this.boardPath);
  }

  /** True iff someone else wrote board.json since the renderer last synced. */
  isStale(): boolean {
    const current = boardFileRev(this.boardPath);
    return this.rev !== null && current !== null && current !== this.rev;
  }
}

/** Throws when the write fails, so callers never report a save that didn't happen. */
export function saveBoardTo(boardPath: string, data: unknown): void {
  try {
    writeFileAtomic(boardPath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`[board] failed to save ${boardPath}`, err);
    const code = (err as NodeJS.ErrnoException).code;
    throw new Error(`board.json could not be saved${code ? ` (${code})` : ''}`);
  }
}
