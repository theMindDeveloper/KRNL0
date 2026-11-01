/**
 * boardIo.ts — shared board.json read/write + change notification.
 *
 * Both the IPC handlers and the sys CLI commands go through this module so
 * there is exactly one persistence path. `notifyBoardChanged` lets sys-driven
 * mutations reach the renderer's Zustand store via the `board:changed` event.
 */

import { app, BrowserWindow } from 'electron';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { backupCorruptBoard, seedBoard, writeFileAtomic } from './persistence/board';

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

export function readBoardFile(): RawBoard | null {
  try {
    if (!existsSync(BOARD_PATH)) return null;
    const raw = readFileSync(BOARD_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as RawBoard;
    if (!Array.isArray(parsed.nodes)) parsed.nodes = [];
    if (!Array.isArray(parsed.edges)) parsed.edges = [];
    return parsed;
  } catch (err) {
    backupCorruptBoard(BOARD_PATH, err);
    return null;
  }
}

export function writeBoardFile(board: RawBoard): void {
  board.savedAt = new Date().toISOString();
  writeFileAtomic(BOARD_PATH, JSON.stringify(board, null, 2));
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
  // A missing (or unreadable — already backed up by readBoardFile) board
  // starts from the canonical seed, never an empty board: writing an empty
  // board would permanently drop the mother nodes.
  const current = readBoardFile() ?? (seedBoard() as RawBoard);
  const next = mutator(current) ?? current;
  writeBoardFile(next);
  notifyBoardChanged();
  return next;
}
