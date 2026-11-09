/**
 * boardIo.ts — shared board.json read/write + change notification.
 *
 * Both the IPC handlers and the sys CLI commands go through this module so
 * there is exactly one persistence path. `notifyBoardChanged` lets sys-driven
 * mutations reach the renderer's Zustand store via the `board:changed` event.
 */

import { app, BrowserWindow } from 'electron';
import { getMainWindow } from './mainWindow';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { backupCorruptBoard, BoardCorruptError, BoardUnreadableError, readBoardText, seedBoard, writeFileAtomic } from './persistence/board';

export const BOARD_DIR =
  process.env.KRNL0_BOARD_DIR ?? join(homedir(), 'Documents', app.getName());
export const BOARD_PATH = join(BOARD_DIR, 'board.json');
export const ASSETS_DIR = join(BOARD_DIR, 'assets');

export interface RawBoard {
  version?: number;
  schemaVersion?: number;
  savedAt?: string;
  viewport?: { x: number; y: number; zoom: number };
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
}

/**
 * Read board.json. Null when it doesn't exist. A locked file throws
 * BoardUnreadableError; a damaged one is backed up and throws
 * BoardCorruptError — callers must not seed over it (the open window holds
 * the good copy and rewrites the file on its next save).
 */
export function readBoardFile(): RawBoard | null {
  const raw = existsSync(BOARD_PATH) ? readBoardText(BOARD_PATH) : null;
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as RawBoard;
    if (!Array.isArray(parsed.nodes)) parsed.nodes = [];
    if (!Array.isArray(parsed.edges)) parsed.edges = [];
    return parsed;
  } catch (err) {
    if (!backupCorruptBoard(BOARD_PATH, err)) {
      throw new BoardUnreadableError('board.json is unreadable and could not be backed up; it was left untouched', err);
    }
    throw new BoardCorruptError('board.json is damaged (a copy was kept as board.json.corrupt-…); nothing was changed', err);
  }
}

export function writeBoardFile(board: RawBoard): void {
  board.savedAt = new Date().toISOString();
  writeFileAtomic(BOARD_PATH, JSON.stringify(board, null, 2));
}

/** Size of the open window's content area, so CLI placement can aim at the visible centre. */
export function windowViewSize(): { width: number; height: number } | null {
  const w = getMainWindow();
  if (!w) return null;
  const [width, height] = w.getContentSize();
  return width && height ? { width, height } : null;
}

export function notifyBoardChanged(): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('board:changed');
  }
}

/**
 * Load → mutate → save → notify. The mutator may mutate `board` in-place and
 * return void, or return a new board object. Returns the final board.
 */
export function mutateBoard(
  mutator: (board: RawBoard) => RawBoard | void,
): RawBoard {
  // A missing board starts from the canonical seed, never an empty board:
  // writing an empty board would permanently drop the mother nodes. A damaged
  // one throws (readBoardFile): seeding over it would wipe the open window's
  // board on its next reload.
  const current = readBoardFile() ?? (seedBoard() as RawBoard);
  const next = mutator(current) ?? current;
  writeBoardFile(next);
  notifyBoardChanged();
  return next;
}
