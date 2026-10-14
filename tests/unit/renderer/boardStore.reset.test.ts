/**
 * Destructive board actions — clearFocusHistory + factoryReset.
 *
 * clearFocusHistory: wipes board.completions + every pomo node's history,
 * leaves the rest of the board, and clears undo/redo so a stale snapshot
 * can't resurrect the wiped data.
 *
 * factoryReset: adopts the fresh board returned by the board:reset IPC and
 * clears undo/redo.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import type { Board } from '../../../src/shared/types';

function seed(): Board {
  return {
    version: 1,
    schemaVersion: 2,
    savedAt: '2026-06-02T00:00:00.000Z',
    viewport: { x: 0, y: 0, zoom: 1 },
    layoutMode: 'canvas',
    completions: [
      { taskId: 't1', text: 'done', plannedMin: 25, completedAt: '2026-06-01T09:00:00.000Z' },
    ],
    nodes: [
      {
        id: 'mother-pomo',
        kind: 'pomo',
        position: { x: 0, y: 0 },
        isMother: true,
        state: { status: 'idle', history: [{ id: 's1', startedAt: 'x', endedAt: 'y', durationMin: 25, completed: true, label: '' }] },
        config: {},
      },
      {
        id: 'mother-habit',
        kind: 'habit',
        position: { x: 200, y: 0 },
        isMother: true,
        state: { habits: [{ id: 'h1', name: 'Run', log: ['2026-06-01'], archived: false }] },
        config: {},
      },
    ],
    edges: [],
  };
}

beforeEach(() => {
  useBoardStore.setState({ board: seed(), history: [seed()], future: [seed()] });
  // @ts-expect-error — jsdom has no krnl bridge
  globalThis.window = globalThis.window ?? {};
});

describe('boardStore.clearFocusHistory', () => {
  it('drops the completion ledger', () => {
    useBoardStore.getState().clearFocusHistory();
    expect(useBoardStore.getState().board!.completions).toBeUndefined();
  });

  it('empties every pomo node history but keeps the node', () => {
    useBoardStore.getState().clearFocusHistory();
    const pomo = useBoardStore.getState().board!.nodes.find((n) => n.kind === 'pomo')!;
    expect((pomo.state as { history: unknown[] }).history).toEqual([]);
  });

  it('leaves habit logs untouched', () => {
    useBoardStore.getState().clearFocusHistory();
    const habit = useBoardStore.getState().board!.nodes.find((n) => n.kind === 'habit')!;
    expect((habit.state as { habits: { log: string[] }[] }).habits[0]!.log).toEqual(['2026-06-01']);
  });

  it('clears undo/redo stacks (non-undoable)', () => {
    useBoardStore.getState().clearFocusHistory();
    expect(useBoardStore.getState().history).toEqual([]);
    expect(useBoardStore.getState().future).toEqual([]);
  });
});

describe('boardStore.factoryReset', () => {
  it('adopts the board returned by the reset IPC and clears stacks', async () => {
    const fresh: Board = { ...seed(), savedAt: 'fresh', completions: [], nodes: [] };
    // @ts-expect-error — install a minimal krnl bridge
    globalThis.window.krnl = { boardReset: vi.fn().mockResolvedValue(fresh) };

    await useBoardStore.getState().factoryReset();

    expect(useBoardStore.getState().board!.savedAt).toBe('fresh');
    expect(useBoardStore.getState().history).toEqual([]);
    expect(useBoardStore.getState().future).toEqual([]);
  });

  it('is a no-op when the bridge is unavailable', async () => {
    // @ts-expect-error
    globalThis.window.krnl = {};
    const before = useBoardStore.getState().board;
    await useBoardStore.getState().factoryReset();
    expect(useBoardStore.getState().board).toBe(before);
  });
});
