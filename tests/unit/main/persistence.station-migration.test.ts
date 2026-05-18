/**
 * ADR 0008 § 4.2 / § 5 — station-mode migration tests.
 *
 * Cases:
 *   1. Pre-ADR board.json (no layoutMode, no stationSlot on mothers)
 *      → layoutMode === 'canvas', all mothers get default stationSlot.
 *   2. New empty board (no file on disk, seedBoard() path)
 *      → layoutMode === 'station'.
 *   3. Existing tests in the migration chain are not broken
 *      (existing mothers still heal correctly; new fields are additive).
 *
 * Slot mapping (architect decision § 9.1 OQ-1.A, option A):
 *   pomo     → top-left
 *   todo     → top-center
 *   habit    → top-right-pre   (Habit gets its own column)
 *   calendar → top-right-upper
 *   clock    → top-right-lower
 *   term     → bottom-strip
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBoardFrom, seedBoard } from '../../../src/main/persistence/board';

interface LoadedNode {
  id: string;
  kind: string;
  isMother?: boolean;
  state?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

interface LoadedBoard {
  schemaVersion?: number;
  layoutMode?: string;
  nodes: LoadedNode[];
  edges: unknown[];
}

describe('ADR 0008 — station-mode migration', () => {
  let dir: string;
  let boardPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'krnl0-station-'));
    boardPath = join(dir, 'board.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // ── Case 1: pre-ADR board → layoutMode 'canvas', stationSlot backfilled ──────

  it('pre-ADR board (no layoutMode, no stationSlot) gets layoutMode canvas and all mother stationSlots', () => {
    const preAdr = {
      version: 1,
      schemaVersion: 1,
      savedAt: '2026-05-01T00:00:00.000Z',
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
        {
          id: 'mother-todo',
          kind: 'todo',
          position: { x: -840, y: 0 },
          isMother: true,
          state: { items: [] },
          config: { showCompleted: true, maxVisible: 50 },
        },
        {
          id: 'mother-habit',
          kind: 'habit',
          position: { x: -280, y: 0 },
          isMother: true,
          state: { habits: [] },
          config: { maxHabits: 5, weekStartsOn: 'monday', view: 'week' },
        },
        {
          id: 'mother-calendar',
          kind: 'calendar',
          position: { x: 280, y: 0 },
          isMother: true,
          state: { selectedDate: null, anchorDate: '2026-05-01' },
          config: {
            view: 'week', weekStartsOn: 'monday',
            showHabits: true, showPomoHeatmap: true,
            hourRange: { start: 6, end: 23 },
          },
        },
        {
          id: 'mother-clock',
          kind: 'clock',
          position: { x: 840, y: 0 },
          isMother: true,
          state: { linkedTodoId: null, viewWindow: 0, selectedDate: '2026-05-01' },
          config: {},
        },
        {
          id: 'mother-term',
          kind: 'term',
          position: { x: 1400, y: 0 },
          isMother: true,
          state: { sessionId: null, title: 'Terminal' },
          config: { shell: 'default', fontSize: 13 },
        },
      ],
      edges: [],
    };
    writeFileSync(boardPath, JSON.stringify(preAdr), 'utf-8');

    const loaded = loadBoardFrom(boardPath) as LoadedBoard;

    // layoutMode defaults to 'canvas' for legacy boards (ADR 0008 § 5)
    expect(loaded.layoutMode).toBe('canvas');
    // schemaVersion bumped to 2
    expect(loaded.schemaVersion).toBe(2);

    // All six mothers get their default stationSlot
    const slotFor = (kind: string) => {
      const node = loaded.nodes.find((n) => n.kind === kind && n.isMother);
      return node?.config?.['stationSlot'];
    };

    expect(slotFor('pomo')).toBe('top-left');
    expect(slotFor('todo')).toBe('top-center');
    expect(slotFor('habit')).toBe('top-right-pre');      // OQ-1.A decision A
    expect(slotFor('calendar')).toBe('top-right-upper');
    expect(slotFor('clock')).toBe('top-right-lower');
    expect(slotFor('term')).toBe('bottom-strip');
  });

  it('stationSlot migration is idempotent — already-set slots are preserved', () => {
    // Board with stationSlots already set (e.g. from a previous migration run)
    const alreadyMigrated = {
      version: 1,
      schemaVersion: 2,
      savedAt: '2026-05-18T00:00:00.000Z',
      viewport: { x: 0, y: 220, zoom: 1 },
      layoutMode: 'station',
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
    writeFileSync(boardPath, JSON.stringify(alreadyMigrated), 'utf-8');

    const loaded = loadBoardFrom(boardPath) as LoadedBoard;

    // layoutMode must be preserved as 'station'
    expect(loaded.layoutMode).toBe('station');
    // stationSlot must remain 'top-left' (not reset)
    const pomo = loaded.nodes.find((n) => n.kind === 'pomo');
    expect(pomo?.config?.['stationSlot']).toBe('top-left');
  });

  it('child nodes (isMother=false) do NOT get a stationSlot', () => {
    const withChild = {
      version: 1,
      schemaVersion: 1,
      savedAt: '2026-05-01T00:00:00.000Z',
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: 'mother-todo',
          kind: 'todo',
          position: { x: -840, y: 0 },
          isMother: true,
          state: { items: [] },
          config: { showCompleted: true, maxVisible: 50 },
        },
        {
          id: 'task-1',
          kind: 'todo.task',
          position: { x: 0, y: 200 },
          isMother: false,
          state: {
            text: 'a task', done: false, durationMin: 25, eta: '~25 min',
            sequenceNumber: 1, layer: 0, createdAt: '2026-05-01T10:00:00.000Z',
            parentTodoId: 'mother-todo', parentTaskId: null, todoItemId: null,
            pomoSessionsCompleted: 0, plannedMin: 25, secondsAccumulated: 0,
            currentSessionElapsedSec: 0, kind: 'focus',
          },
          config: { showDuration: true },
        },
      ],
      edges: [],
    };
    writeFileSync(boardPath, JSON.stringify(withChild), 'utf-8');

    const loaded = loadBoardFrom(boardPath) as LoadedBoard;

    const task = loaded.nodes.find((n) => n.id === 'task-1');
    // Child node must NOT have stationSlot set
    expect(task?.config?.['stationSlot']).toBeUndefined();
  });

  // ── Case 2: new empty board (no file on disk) → layoutMode 'station' ──────────

  it('new board (no file on disk) defaults to layoutMode station', () => {
    // boardPath does not exist — loadBoardFrom falls through to seedBoard()
    const loaded = loadBoardFrom(boardPath) as LoadedBoard;

    expect(loaded.layoutMode).toBe('station');
    expect(loaded.schemaVersion).toBe(2);
  });

  it('seedBoard() produces all six mothers with stationSlot pre-populated', () => {
    const board = seedBoard();
    const nodes = board.nodes as LoadedNode[];

    const slotFor = (kind: string) => {
      const node = nodes.find((n) => n.kind === kind && n.isMother);
      return (node?.config as Record<string, unknown> | undefined)?.['stationSlot'];
    };

    expect(slotFor('pomo')).toBe('top-left');
    expect(slotFor('todo')).toBe('top-center');
    expect(slotFor('habit')).toBe('top-right-pre');
    expect(slotFor('calendar')).toBe('top-right-upper');
    expect(slotFor('clock')).toBe('top-right-lower');
    expect(slotFor('term')).toBe('bottom-strip');
  });

  // ── Case 3: existing migration chain is not broken ────────────────────────────

  it('existing PomoConfig migration still runs alongside new station migrations', () => {
    // Board with old-style PomoConfig (no sessionMin) AND no layoutMode
    const legacy = {
      version: 1,
      schemaVersion: 1,
      savedAt: '2026-05-01T00:00:00.000Z',
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: 'mother-pomo',
          kind: 'pomo',
          position: { x: -1400, y: 0 },
          isMother: true,
          state: { status: 'idle', startedAt: null, durationMin: 25, breakMin: 5, label: '', sessionsCompleted: 0, history: [] },
          config: { shortBreakMin: 5, longBreakMin: 15, sessionsUntilLongBreak: 4 },
        },
      ],
      edges: [],
    };
    writeFileSync(boardPath, JSON.stringify(legacy), 'utf-8');

    const loaded = loadBoardFrom(boardPath) as LoadedBoard;
    const pomo = loaded.nodes.find((n) => n.kind === 'pomo')!;

    // Pomo config migration: sessionMin must be promoted from legacy key
    expect(pomo.config?.['sessionMin']).toBe(25);
    expect(pomo.config?.['longBreakEvery']).toBe(4);

    // Station migration still ran
    expect(loaded.layoutMode).toBe('canvas');
    expect(pomo.config?.['stationSlot']).toBe('top-left');
    expect(loaded.schemaVersion).toBe(2);
  });
});
