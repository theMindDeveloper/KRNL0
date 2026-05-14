/**
 * Viewport persistence — Architect Amendment B.
 *
 * The bug: migrateMotherPositions was clobbering every loaded board's
 * viewport to { x: 0, y: 220, zoom: 1 } unconditionally. The fix changes
 * it to only set the sentinel default when viewport is absent.
 *
 * Covered:
 *   - A board with a persisted viewport { x: 500, y: 100, zoom: 0.5 }
 *     loads and returns the same viewport unchanged (no clobber).
 *   - A board with no viewport key gets the seed default { x: 0, y: 220, zoom: 1 }.
 *   - A board with the sentinel viewport { x: 0, y: 220, zoom: 1 } keeps it (existing user).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBoardFrom } from '../../../src/main/persistence/board';

interface LoadedBoard {
  nodes: Array<{ id: string; kind: string }>;
  edges: unknown[];
  viewport?: { x: number; y: number; zoom: number };
}

describe('board viewport migration — Amendment B', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'krnl0-vp-'));
    path = join(dir, 'board.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('preserves a persisted viewport { x: 500, y: 100, zoom: 0.5 } unchanged', () => {
    const board = {
      version: 1,
      schemaVersion: 1,
      savedAt: '2026-05-14T10:00:00.000Z',
      viewport: { x: 500, y: 100, zoom: 0.5 },
      nodes: [
        {
          id: 'mother-pomo',
          kind: 'pomo',
          position: { x: -808, y: 0 },
          isMother: true,
          state: { status: 'idle', startedAt: null, durationMin: 25, breakMin: 5, label: '', sessionsCompleted: 0, history: [] },
          config: { sessionMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4 },
        },
      ],
      edges: [],
    };
    writeFileSync(path, JSON.stringify(board), 'utf-8');
    const loaded = loadBoardFrom(path) as LoadedBoard;
    expect(loaded.viewport).toEqual({ x: 500, y: 100, zoom: 0.5 });
  });

  it('sets seed default viewport { x: 0, y: 220, zoom: 1 } when viewport key is missing', () => {
    const board = {
      version: 1,
      schemaVersion: 1,
      savedAt: '2026-05-14T10:00:00.000Z',
      // No viewport key
      nodes: [
        {
          id: 'mother-pomo',
          kind: 'pomo',
          position: { x: -808, y: 0 },
          isMother: true,
          state: { status: 'idle', startedAt: null, durationMin: 25, breakMin: 5, label: '', sessionsCompleted: 0, history: [] },
          config: { sessionMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4 },
        },
      ],
      edges: [],
    };
    writeFileSync(path, JSON.stringify(board), 'utf-8');
    const loaded = loadBoardFrom(path) as LoadedBoard;
    expect(loaded.viewport).toEqual({ x: 0, y: 220, zoom: 1 });
  });

  it('keeps viewport unchanged when it already equals the sentinel { x: 0, y: 220, zoom: 1 }', () => {
    const board = {
      version: 1,
      schemaVersion: 1,
      savedAt: '2026-05-14T10:00:00.000Z',
      viewport: { x: 0, y: 220, zoom: 1 },
      nodes: [
        {
          id: 'mother-pomo',
          kind: 'pomo',
          position: { x: -808, y: 0 },
          isMother: true,
          state: { status: 'idle', startedAt: null, durationMin: 25, breakMin: 5, label: '', sessionsCompleted: 0, history: [] },
          config: { sessionMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4 },
        },
      ],
      edges: [],
    };
    writeFileSync(path, JSON.stringify(board), 'utf-8');
    const loaded = loadBoardFrom(path) as LoadedBoard;
    expect(loaded.viewport).toEqual({ x: 0, y: 220, zoom: 1 });
  });

  it('preserves viewport across multiple migration passes (idempotent)', () => {
    const board = {
      version: 1,
      schemaVersion: 1,
      savedAt: '2026-05-14T10:00:00.000Z',
      viewport: { x: -300, y: 50, zoom: 1.5 },
      nodes: [],
      edges: [],
    };
    writeFileSync(path, JSON.stringify(board), 'utf-8');

    const first = loadBoardFrom(path) as LoadedBoard;
    expect(first.viewport).toEqual({ x: -300, y: 50, zoom: 1.5 });

    // Simulate a re-save and re-load (write the result back and reload).
    writeFileSync(path, JSON.stringify(first), 'utf-8');
    const second = loadBoardFrom(path) as LoadedBoard;
    expect(second.viewport).toEqual({ x: -300, y: 50, zoom: 1.5 });
  });
});
