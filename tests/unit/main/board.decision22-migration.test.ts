/**
 * Decision 22 — board migrations:
 *   - PomoConfig schema unified to { sessionMin, shortBreakMin, longBreakMin, longBreakEvery }.
 *   - Legacy keys (defaultDurationMin / defaultBreakMin / sessionsUntilLongBreak) heal to the canonical names.
 *   - PomoState gains `activeTaskId: null` backfill.
 *   - TaskState gains `plannedMin` (from existing durationMin) and `secondsAccumulated: 0`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBoardFrom, seedBoard } from '../../../src/main/persistence/board';

interface LoadedBoard {
  nodes: Array<{
    id: string;
    kind: string;
    state?: Record<string, unknown>;
    config?: Record<string, unknown>;
  }>;
  edges: unknown[];
}

describe('Decision 22 — board migration', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'krnl0-mig-'));
    path = join(dir, 'board.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('promotes legacy seed config (shortBreakMin/sessionsUntilLongBreak) to canonical', () => {
    const legacy = {
      version: 1,
      schemaVersion: 1,
      savedAt: '2026-05-09T00:00:00.000Z',
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: 'mother-pomo',
          kind: 'pomo',
          position: { x: -808, y: 0 },
          isMother: true,
          state: { status: 'idle', startedAt: null, durationMin: 25, label: '', sessionsCompleted: 0, history: [] },
          config: { shortBreakMin: 5, longBreakMin: 15, sessionsUntilLongBreak: 4 },
        },
      ],
      edges: [],
    };
    writeFileSync(path, JSON.stringify(legacy), 'utf-8');
    const loaded = loadBoardFrom(path) as LoadedBoard;
    const pomo = loaded.nodes.find((n) => n.kind === 'pomo')!;
    expect(pomo.config).toMatchObject({
      sessionMin: 25,
      shortBreakMin: 5,
      longBreakMin: 15,
      longBreakEvery: 4,
    });
    expect(pomo.state).toMatchObject({ activeTaskId: null });
  });

  it('promotes legacy v1 PomoConfig shape (defaultDurationMin/defaultBreakMin/longBreakEvery)', () => {
    const legacy = {
      version: 1,
      nodes: [
        {
          id: 'mother-pomo',
          kind: 'pomo',
          position: { x: 0, y: 0 },
          isMother: true,
          state: { status: 'idle', startedAt: null, durationMin: 25, breakMin: 5, label: '', sessionsCompleted: 0, history: [] },
          config: {
            defaultDurationMin: 50,
            defaultBreakMin: 10,
            longBreakEvery: 3,
            longBreakMin: 20,
          },
        },
      ],
      edges: [],
    };
    writeFileSync(path, JSON.stringify(legacy), 'utf-8');
    const loaded = loadBoardFrom(path) as LoadedBoard;
    const pomo = loaded.nodes.find((n) => n.kind === 'pomo')!;
    expect(pomo.config).toMatchObject({
      sessionMin: 50,
      shortBreakMin: 10,
      longBreakMin: 20,
      longBreakEvery: 3,
    });
  });

  it('backfills plannedMin from durationMin on existing task nodes', () => {
    const legacy = {
      version: 1,
      nodes: [
        {
          id: 'mother-todo',
          kind: 'todo',
          position: { x: 0, y: 0 },
          isMother: true,
          state: { items: [{ id: 'it1', text: 'x', done: false, createdAt: 't', completedAt: null }] },
          config: { showCompleted: true, maxVisible: 50 },
        },
        {
          id: 'task-1',
          kind: 'todo.task',
          position: { x: 0, y: 0 },
          isMother: false,
          state: {
            text: 'legacy task',
            done: false,
            durationMin: 40,
            eta: '~40 min',
            sequenceNumber: 1,
            layer: 0,
            createdAt: '2026-05-12T10:00:00.000Z',
            parentTodoId: 'mother-todo',
          },
          config: { showDuration: true },
        },
      ],
      edges: [],
    };
    writeFileSync(path, JSON.stringify(legacy), 'utf-8');
    const loaded = loadBoardFrom(path) as LoadedBoard;
    const task = loaded.nodes.find((n) => n.kind === 'todo.task')!;
    expect(task.state).toMatchObject({
      plannedMin: 40,
      secondsAccumulated: 0,
      parentTaskId: null,
      todoItemId: null,
      pomoSessionsCompleted: 0,
    });
  });

  it('backfills pausedAt / pausedElapsedMs / currentSessionElapsedSec on a pre-v2.1 board', () => {
    const legacy = {
      version: 1,
      schemaVersion: 1,
      savedAt: '2026-05-12T00:00:00.000Z',
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: 'mother-pomo',
          kind: 'pomo',
          position: { x: -808, y: 0 },
          isMother: true,
          // Pre-v2.1: no pausedAt, no pausedElapsedMs
          state: {
            status: 'idle',
            startedAt: null,
            durationMin: 25,
            breakMin: 5,
            label: '',
            sessionsCompleted: 0,
            activeTaskId: null,
            history: [],
          },
          config: { sessionMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4 },
        },
        {
          id: 'task-legacy',
          kind: 'todo.task',
          position: { x: 0, y: 0 },
          isMother: false,
          // Pre-v2.1: no currentSessionElapsedSec
          state: {
            text: 'legacy task',
            done: false,
            durationMin: 25,
            eta: '~25 min',
            sequenceNumber: 1,
            layer: 0,
            createdAt: '2026-05-12T10:00:00.000Z',
            parentTodoId: 'mother-todo',
            parentTaskId: null,
            todoItemId: null,
            pomoSessionsCompleted: 0,
            plannedMin: 25,
            secondsAccumulated: 0,
          },
          config: { showDuration: true },
        },
      ],
      edges: [],
    };
    writeFileSync(path, JSON.stringify(legacy), 'utf-8');
    const loaded = loadBoardFrom(path) as LoadedBoard;

    const pomo = loaded.nodes.find((n) => n.kind === 'pomo')!;
    expect(pomo.state).toMatchObject({ pausedAt: null, pausedElapsedMs: 0 });

    const task = loaded.nodes.find((n) => n.kind === 'todo.task')!;
    expect(task.state).toMatchObject({ currentSessionElapsedSec: 0 });
  });

  it('preserves an already-canonical config on round-trip', () => {
    const canonical = {
      version: 1,
      nodes: [
        {
          id: 'mother-pomo',
          kind: 'pomo',
          position: { x: 0, y: 0 },
          isMother: true,
          state: {
            status: 'idle',
            startedAt: null,
            durationMin: 25,
            breakMin: 5,
            label: '',
            sessionsCompleted: 0,
            activeTaskId: null,
            history: [],
          },
          config: { sessionMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4 },
        },
      ],
      edges: [],
    };
    writeFileSync(path, JSON.stringify(canonical), 'utf-8');
    const loaded = loadBoardFrom(path) as LoadedBoard;
    const pomo = loaded.nodes.find((n) => n.kind === 'pomo')!;
    expect(pomo.config).toMatchObject({
      sessionMin: 25,
      shortBreakMin: 5,
      longBreakMin: 15,
      longBreakEvery: 4,
    });
  });

  // ── Decision 23.1 — migrateAddClockMother ────────────────────────────────────

  it('Decision 23.1: back-fills mother-clock into a board that predates the clock mother', () => {
    // Simulate a board saved before Decision 23.1 — no mother-clock node.
    const preClock = {
      version: 1,
      schemaVersion: 1,
      savedAt: '2026-05-13T00:00:00.000Z',
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: 'mother-pomo',
          kind: 'pomo',
          position: { x: -808, y: 0 },
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
    writeFileSync(path, JSON.stringify(preClock), 'utf-8');
    const loaded = loadBoardFrom(path) as LoadedBoard;

    const clock = loaded.nodes.find((n) => n.id === 'mother-clock');
    expect(clock).toBeDefined();
    expect(clock!.kind).toBe('clock');
    expect(clock!.state).toMatchObject({ linkedTodoId: null, viewWindow: 0 });
    // Position matches NEW_MOTHER_POSITIONS entry for mother-clock — bumped
    // 1252 → 1300 (PR2.1, 520px spacing for 440-wide mothers) → 1350
    // (Wave C, 540px spacing for 500-wide mothers).
    expect((clock as { position?: { x: number; y: number } }).position).toMatchObject({ x: 1350, y: 0 });
  });

  it('Decision 23.1: migrateAddClockMother is idempotent — no duplicate mother-clock on double load', () => {
    // Board already contains mother-clock (post-migration state).
    const postClock = {
      version: 1,
      schemaVersion: 1,
      savedAt: '2026-05-13T00:00:00.000Z',
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: 'mother-clock',
          kind: 'clock',
          position: { x: 1252, y: 0 },
          isMother: true,
          state: { linkedTodoId: null, viewWindow: 0 },
          config: {},
        },
      ],
      edges: [],
    };
    writeFileSync(path, JSON.stringify(postClock), 'utf-8');
    const loaded = loadBoardFrom(path) as LoadedBoard;

    const clockNodes = loaded.nodes.filter((n) => n.id === 'mother-clock');
    expect(clockNodes).toHaveLength(1);
    expect(clockNodes[0]!.state).toMatchObject({ linkedTodoId: null, viewWindow: 0 });
  });

  // ── AC1 — Fresh seed (Decision 23.1) ─────────────────────────────────────────

  it('AC1: seedBoard() produces exactly 6 mothers including mother-clock at the canonical x', () => {
    const board = seedBoard();

    // Exactly 6 nodes (the 6 permanent mothers)
    expect(board.nodes).toHaveLength(6);

    // mother-clock seed x: 1252 (orig) → 1300 (PR2.1, 520px spacing for 440-wide)
    // → 1350 (Wave C, 540px spacing for 500-wide mothers).
    const clock = (board.nodes as Array<{ id: string; kind: string; position: { x: number; y: number }; isMother: boolean; state: Record<string, unknown>; config: Record<string, unknown> }>)
      .find((n) => n.id === 'mother-clock');
    expect(clock).toBeDefined();
    expect(clock!.kind).toBe('clock');
    expect(clock!.position).toEqual({ x: 1350, y: 0 });
    expect(clock!.isMother).toBe(true);
    // ADR 0004 §3 — selectedDate defaults to today (local) in the seed.
    expect(clock!.state).toMatchObject({ linkedTodoId: null, viewWindow: 0 });
    expect((clock!.state as { selectedDate?: string }).selectedDate).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
    expect(clock!.config).toEqual({});
  });
});
