/**
 * ADR 0008 § 4.1 / § 12 — schemaVersion bump tests.
 *
 * Three cases required by the architect:
 *   1. Loading a schemaVersion: 1 (or missing-version) fixture surfaces
 *      schemaVersion: 2 in memory after load.
 *   2. The next save writes schemaVersion: 2 to disk.
 *   3. Round-tripping an already-v2 fixture is idempotent (no spurious diff).
 *
 * Runs in the main-process tsconfig (pure Node, no DOM).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBoardFrom, saveBoardTo } from '../../../src/main/persistence/board';

interface LoadedBoard {
  schemaVersion?: number;
  layoutMode?: string;
  nodes: unknown[];
  edges: unknown[];
}

describe('ADR 0008 — schemaVersion bump', () => {
  let dir: string;
  let boardPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'krnl0-sv-'));
    boardPath = join(dir, 'board.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // ── Case 1: loading a v1 fixture surfaces schemaVersion: 2 in memory ─────────

  it('loading schemaVersion: 1 board surfaces schemaVersion: 2 in memory', () => {
    const legacyV1 = {
      version: 1,
      schemaVersion: 1,
      savedAt: '2026-05-10T00:00:00.000Z',
      viewport: { x: 0, y: 220, zoom: 1 },
      nodes: [
        {
          id: 'mother-pomo',
          kind: 'pomo',
          position: { x: -1400, y: 0 },
          isMother: true,
          state: {
            status: 'idle', startedAt: null, durationMin: 25, breakMin: 5,
            label: '', sessionsCompleted: 0, activeTaskId: null, history: [],
            pausedAt: null, pausedElapsedMs: 0,
          },
          config: { sessionMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4 },
        },
      ],
      edges: [],
    };
    writeFileSync(boardPath, JSON.stringify(legacyV1), 'utf-8');

    const loaded = loadBoardFrom(boardPath) as LoadedBoard;

    expect(loaded.schemaVersion).toBe(2);
  });

  it('loading a board with no schemaVersion field surfaces schemaVersion: 2 in memory', () => {
    const noVersion = {
      version: 1,
      savedAt: '2026-05-10T00:00:00.000Z',
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [],
      edges: [],
    };
    writeFileSync(boardPath, JSON.stringify(noVersion), 'utf-8');

    const loaded = loadBoardFrom(boardPath) as LoadedBoard;

    expect(loaded.schemaVersion).toBe(2);
  });

  // ── Case 2: the next save writes schemaVersion: 2 to disk ────────────────────

  it('saving the migrated board writes schemaVersion: 2 to disk', () => {
    const legacyV1 = {
      version: 1,
      schemaVersion: 1,
      savedAt: '2026-05-10T00:00:00.000Z',
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [],
      edges: [],
    };
    writeFileSync(boardPath, JSON.stringify(legacyV1), 'utf-8');

    const loaded = loadBoardFrom(boardPath);
    // Simulate a save (the same data the renderer would send back)
    saveBoardTo(boardPath, loaded);

    const raw = JSON.parse(readFileSync(boardPath, 'utf-8')) as LoadedBoard;
    expect(raw.schemaVersion).toBe(2);
  });

  // ── Case 3: round-tripping a v2 fixture is idempotent ────────────────────────

  it('round-tripping an already-v2 fixture is idempotent (no spurious diff)', () => {
    const v2Board = {
      version: 1,
      schemaVersion: 2,
      savedAt: '2026-05-18T10:00:00.000Z',
      viewport: { x: 0, y: 220, zoom: 1 },
      layoutMode: 'canvas',
      nodes: [
        {
          id: 'mother-pomo',
          kind: 'pomo',
          position: { x: -1400, y: 0 },
          isMother: true,
          state: {
            status: 'idle', startedAt: null, durationMin: 25, breakMin: 5,
            label: '', sessionsCompleted: 0, activeTaskId: null, history: [],
            pausedAt: null, pausedElapsedMs: 0,
          },
          config: {
            sessionMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4,
            stationSlot: 'top-left',
          },
        },
      ],
      edges: [],
    };
    writeFileSync(boardPath, JSON.stringify(v2Board), 'utf-8');

    const loaded = loadBoardFrom(boardPath) as LoadedBoard;

    // schemaVersion must remain 2
    expect(loaded.schemaVersion).toBe(2);
    // layoutMode must be preserved
    expect(loaded.layoutMode).toBe('canvas');

    // Save and reload — still idempotent
    saveBoardTo(boardPath, loaded);
    const reloaded = loadBoardFrom(boardPath) as LoadedBoard;
    expect(reloaded.schemaVersion).toBe(2);
    expect(reloaded.layoutMode).toBe('canvas');
  });
});
