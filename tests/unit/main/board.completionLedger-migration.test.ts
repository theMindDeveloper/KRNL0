/**
 * #169 — completion-ledger backfill migration.
 *
 * On load, board.completions is populated from existing done task nodes (done
 * && completedAt), keyed/deduped by taskId, matching the old taskSource
 * semantics. Idempotent: an already-present ledger entry is not duplicated.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBoardFrom } from '../../../src/main/persistence/board';

interface LoadedBoard {
  nodes: Array<{ id: string; kind: string; state?: Record<string, unknown> }>;
  completions?: Array<{ taskId: string; text: string; plannedMin: number; completedAt: string }>;
}

function task(id: string, state: Record<string, unknown>) {
  return {
    id,
    kind: 'todo.task',
    isMother: false,
    position: { x: 0, y: 0 },
    state: {
      text: 'T', done: false, durationMin: 25, eta: '~25 min', sequenceNumber: 1, layer: 0,
      createdAt: '2026-05-10T00:00:00.000Z', parentTodoId: 'mother-todo', parentTaskId: null,
      todoItemId: null, pomoSessionsCompleted: 0, plannedMin: 25, secondsAccumulated: 0,
      currentSessionElapsedSec: 0, kind: 'event', ...state,
    },
    config: { showDuration: true },
  };
}

function writeBoard(path: string, extra: Record<string, unknown>) {
  const board = {
    version: 1, schemaVersion: 2, savedAt: '2026-05-10T00:00:00.000Z',
    viewport: { x: 0, y: 0, zoom: 1 }, layoutMode: 'canvas',
    nodes: [
      { id: 'mother-todo', kind: 'todo', isMother: true, position: { x: 0, y: 0 }, state: { items: [] }, config: {} },
      ...((extra['nodes'] as unknown[]) ?? []),
    ],
    edges: [],
    ...(extra['completions'] !== undefined ? { completions: extra['completions'] } : {}),
  };
  writeFileSync(path, JSON.stringify(board), 'utf-8');
}

describe('#169 — completion-ledger backfill migration', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'krnl0-ledger-'));
    path = join(dir, 'board.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('backfills a ledger entry for a done task with completedAt', () => {
    writeBoard(path, {
      nodes: [task('task-1', { done: true, completedAt: '2026-05-10T09:00:00.000Z', text: 'done one', plannedMin: 40 })],
    });
    const loaded = loadBoardFrom(path) as LoadedBoard;
    expect(loaded.completions).toHaveLength(1);
    expect(loaded.completions![0]).toMatchObject({
      taskId: 'task-1', text: 'done one', plannedMin: 40, completedAt: '2026-05-10T09:00:00.000Z',
    });
  });

  it('excludes undone tasks and legacy done-without-completedAt', () => {
    writeBoard(path, {
      nodes: [
        task('task-undone', { done: false }),
        task('task-legacy', { done: true }), // no completedAt
      ],
    });
    const loaded = loadBoardFrom(path) as LoadedBoard;
    expect(loaded.completions ?? []).toHaveLength(0);
  });

  it('is idempotent — does not duplicate an existing ledger entry', () => {
    writeBoard(path, {
      nodes: [task('task-1', { done: true, completedAt: '2026-05-10T09:00:00.000Z', text: 'x', plannedMin: 25 })],
      completions: [{ taskId: 'task-1', text: 'x', plannedMin: 25, completedAt: '2026-05-10T09:00:00.000Z' }],
    });
    const loaded = loadBoardFrom(path) as LoadedBoard;
    expect(loaded.completions).toHaveLength(1);
  });

  it('preserves a ledger entry whose task node no longer exists (#169 core)', () => {
    writeBoard(path, {
      nodes: [], // task was deleted
      completions: [{ taskId: 'gone', text: 'deleted but done', plannedMin: 50, completedAt: '2026-05-11T08:00:00.000Z' }],
    });
    const loaded = loadBoardFrom(path) as LoadedBoard;
    expect(loaded.completions).toHaveLength(1);
    expect(loaded.completions![0]!.taskId).toBe('gone');
  });
});
