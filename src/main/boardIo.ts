/**
 * boardIo.ts — shared board.json read/write + change notification.
 *
 * Both the IPC handlers and the sys CLI commands go through this module so
 * there is exactly one persistence path. `notifyBoardChanged` lets sys-driven
 * mutations reach the renderer's Zustand store via the `board:changed` event.
 */

import { app, BrowserWindow } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

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
  } catch {
    return null;
  }
}

export function writeBoardFile(board: RawBoard): void {
  if (!existsSync(BOARD_DIR)) mkdirSync(BOARD_DIR, { recursive: true });
  board.savedAt = new Date().toISOString();
  writeFileSync(BOARD_PATH, JSON.stringify(board, null, 2), 'utf-8');
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
  const current =
    readBoardFile() ?? {
      version: 1,
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      viewport: { x: 0, y: 220, zoom: 1 },
      nodes: [],
      edges: [],
    };
  const next = mutator(current) ?? current;
  writeBoardFile(next);
  notifyBoardChanged();
  return next;
}
