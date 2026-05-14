/**
 * Decision 24.2 — migrateClockState migration tests.
 *
 * Verifies:
 *   - windowStartHour is stripped from legacy clock nodes
 *   - viewWindow is set to 0 (default) or preserved when already set
 *   - linkedTodoId is preserved
 *   - Migration is idempotent
 *   - No duplicate mother-clock is injected
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBoardFrom } from '../../../src/main/persistence/board';

interface LoadedBoard {
  nodes: Array<{
    id: string;
    kind: string;
    state?: Record<string, unknown>;
    config?: Record<string, unknown>;
  }>;
  edges: unknown[];
}

describe('Decision 24.2 — migrateClockState', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'krnl0-mig24_2-'));
    path = join(dir, 'board.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('strips windowStartHour and sets viewWindow to 0', () => {
    const board = {
      version: 1,
      schemaVersion: 1,
      savedAt: '2026-05-14T00:00:00.000Z',
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        { id: 'mother-clock', kind: 'clock', position: { x: 1252, y: 0 }, isMother: true, state: { linkedTodoId: null, windowStartHour: 14 }, config: {} },
      ],
      edges: [],
    };
    writeFileSync(path, JSON.stringify(board), 'utf-8');
    const out = loadBoardFrom(path) as LoadedBoard;

    const clock = out.nodes.find((n) => n.id === 'mother-clock');
    expect(clock).toBeDefined();
    expect(clock!.state).toMatchObject({ linkedTodoId: null, viewWindow: 0 });
    expect(clock!.state).not.toHaveProperty('windowStartHour');
  });

  it('preserves linkedTodoId', () => {
    const board = {
      version: 1,
      schemaVersion: 1,
      savedAt: '2026-05-14T00:00:00.000Z',
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        { id: 'mother-clock', kind: 'clock', position: { x: 1252, y: 0 }, isMother: true, state: { linkedTodoId: 'todo-x', windowStartHour: 14 }, config: {} },
      ],
      edges: [],
    };
    writeFileSync(path, JSON.stringify(board), 'utf-8');
    const out = loadBoardFrom(path) as LoadedBoard;

    const clock = out.nodes.find((n) => n.id === 'mother-clock');
    expect(clock!.state?.linkedTodoId).toBe('todo-x');
    expect(clock!.state).not.toHaveProperty('windowStartHour');
  });

  it('preserves viewWindow=1 if already migrated', () => {
    const board = {
      version: 1,
      schemaVersion: 1,
      savedAt: '2026-05-14T00:00:00.000Z',
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        { id: 'mother-clock', kind: 'clock', position: { x: 1252, y: 0 }, isMother: true, state: { linkedTodoId: null, viewWindow: 1 }, config: {} },
      ],
      edges: [],
    };
    writeFileSync(path, JSON.stringify(board), 'utf-8');
    const out = loadBoardFrom(path) as LoadedBoard;

    const clock = out.nodes.find((n) => n.id === 'mother-clock');
    expect(clock!.state?.viewWindow).toBe(1);
  });

  it('is idempotent on already-migrated boards', () => {
    const board = {
      version: 1,
      schemaVersion: 1,
      savedAt: '2026-05-14T00:00:00.000Z',
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        { id: 'mother-clock', kind: 'clock', position: { x: 1252, y: 0 }, isMother: true, state: { linkedTodoId: null, viewWindow: 0 }, config: {} },
      ],
      edges: [],
    };
    writeFileSync(path, JSON.stringify(board), 'utf-8');
    const once = loadBoardFrom(path) as LoadedBoard;

    // Save the migrated board and load again
    const path2 = join(dir, 'board2.json');
    writeFileSync(path2, JSON.stringify(once), 'utf-8');
    const twice = loadBoardFrom(path2) as LoadedBoard;

    const clock = twice.nodes.find((n) => n.id === 'mother-clock');
    expect(clock!.state).toMatchObject({ linkedTodoId: null, viewWindow: 0 });
    expect(clock!.state).not.toHaveProperty('windowStartHour');
  });

  it('does not duplicate mother-clock when migrating legacy board', () => {
    const board = {
      version: 1,
      schemaVersion: 1,
      savedAt: '2026-05-14T00:00:00.000Z',
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        { id: 'mother-clock', kind: 'clock', position: { x: 1252, y: 0 }, isMother: true, state: { linkedTodoId: null, windowStartHour: 8 }, config: {} },
      ],
      edges: [],
    };
    writeFileSync(path, JSON.stringify(board), 'utf-8');
    const out = loadBoardFrom(path) as LoadedBoard;

    const clocks = out.nodes.filter((n) => n.kind === 'clock');
    expect(clocks).toHaveLength(1);
  });
});
