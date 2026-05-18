/**
 * ADR 0008 § 2.1 / § 4.1 — boardStore layout-mode actions.
 *
 * Tests:
 *   - setLayoutMode('station') updates the store's board.layoutMode.
 *   - setLayoutMode('canvas') round-trips back to canvas.
 *   - setLayoutGeometry({...}) updates the store's board.layoutGeometry.
 *   - setLayoutGeometry(undefined) clears layoutGeometry without leaving
 *     an undefined key (exactOptionalPropertyTypes compliance).
 *
 * Note: saveBoard() calls window.krnl.boardSave which is absent in the
 * test environment. The store silently no-ops the IPC call (the function
 * is a no-op when window.krnl is undefined). We verify the in-memory
 * store state only; IPC round-trip is integration-tested by handlers.pty.test.ts.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import type { Board } from '../../../src/shared/types';

function makeBoard(overrides: Partial<Board> = {}): Board {
  return {
    version: 1,
    schemaVersion: 2,
    savedAt: '2026-05-18T00:00:00.000Z',
    viewport: { x: 0, y: 220, zoom: 1 },
    layoutMode: 'canvas',
    nodes: [],
    edges: [],
    ...overrides,
  };
}

describe('boardStore — setLayoutMode', () => {
  beforeEach(() => {
    useBoardStore.setState({ board: makeBoard({ layoutMode: 'canvas' }) });
  });

  it('setLayoutMode("station") sets board.layoutMode to station', () => {
    useBoardStore.getState().setLayoutMode('station');
    expect(useBoardStore.getState().board?.layoutMode).toBe('station');
  });

  it('setLayoutMode("canvas") sets board.layoutMode back to canvas', () => {
    useBoardStore.setState({ board: makeBoard({ layoutMode: 'station' }) });
    useBoardStore.getState().setLayoutMode('canvas');
    expect(useBoardStore.getState().board?.layoutMode).toBe('canvas');
  });

  it('setLayoutMode is a no-op when board is null', () => {
    useBoardStore.setState({ board: null });
    // Must not throw
    expect(() => useBoardStore.getState().setLayoutMode('station')).not.toThrow();
    expect(useBoardStore.getState().board).toBeNull();
  });

  it('setLayoutMode does not push a history entry (mode toggle is not undoable)', () => {
    const historyBefore = useBoardStore.getState().history.length;
    useBoardStore.getState().setLayoutMode('station');
    // history length must be unchanged — mode is a preference, not a content mutation
    expect(useBoardStore.getState().history.length).toBe(historyBefore);
  });

  it('setLayoutMode preserves all other board fields unchanged', () => {
    const nodes = [
      {
        id: 'n1', kind: 'text', position: { x: 10, y: 20 },
        isMother: false, state: { text: 'hello' }, config: {},
      },
    ];
    useBoardStore.setState({ board: makeBoard({ layoutMode: 'canvas', nodes }) });
    useBoardStore.getState().setLayoutMode('station');
    const board = useBoardStore.getState().board!;
    expect(board.nodes).toHaveLength(1);
    expect(board.nodes[0]?.id).toBe('n1');
    expect(board.edges).toHaveLength(0);
    expect(board.viewport).toEqual({ x: 0, y: 220, zoom: 1 });
  });
});

describe('boardStore — setLayoutGeometry', () => {
  beforeEach(() => {
    useBoardStore.setState({ board: makeBoard() });
  });

  it('setLayoutGeometry sets board.layoutGeometry.station', () => {
    const geom = {
      station: {
        rowFraction: 0.32,
        columnFractions: [0.22, 0.30, 0.22, 0.26],
        rightColumnSplit: 0.55,
      },
    };
    useBoardStore.getState().setLayoutGeometry(geom);
    expect(useBoardStore.getState().board?.layoutGeometry).toEqual(geom);
  });

  it('setLayoutGeometry updates only the geometry, leaving layoutMode unchanged', () => {
    useBoardStore.setState({ board: makeBoard({ layoutMode: 'station' }) });
    useBoardStore.getState().setLayoutGeometry({
      station: { rowFraction: 0.4, columnFractions: [0.25, 0.25, 0.25, 0.25], rightColumnSplit: 0.5 },
    });
    expect(useBoardStore.getState().board?.layoutMode).toBe('station');
  });

  it('setLayoutGeometry with undefined removes layoutGeometry from board', () => {
    useBoardStore.setState({
      board: makeBoard({
        layoutGeometry: {
          station: { rowFraction: 0.32, columnFractions: [0.22, 0.30, 0.22, 0.26], rightColumnSplit: 0.55 },
        },
      }),
    });
    useBoardStore.getState().setLayoutGeometry(undefined);
    const board = useBoardStore.getState().board!;
    // The key must be absent, not set to undefined (exactOptionalPropertyTypes)
    expect('layoutGeometry' in board).toBe(false);
  });

  it('setLayoutGeometry is a no-op when board is null', () => {
    useBoardStore.setState({ board: null });
    expect(() =>
      useBoardStore.getState().setLayoutGeometry({
        station: { rowFraction: 0.32, columnFractions: [0.22, 0.30, 0.22, 0.26], rightColumnSplit: 0.55 },
      }),
    ).not.toThrow();
    expect(useBoardStore.getState().board).toBeNull();
  });
});
