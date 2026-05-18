/**
 * station-toggle-preserves-state.test.ts
 *
 * ADR 0008 § 7 / F9 — toggling canvas→station→canvas preserves nodes, edges,
 * viewport, and zoom unchanged.
 *
 * Tests run in node environment (no DOM needed — pure store assertions).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import type { Board } from '../../../src/shared/types';
import type { Node } from '../../../src/shared/types/node';
import type { Edge } from '../../../src/shared/types/edge';

const INITIAL_VIEWPORT = { x: 120, y: -40, zoom: 0.85 };

const NODES: Node[] = [
  {
    id: 'mother-pomo',
    kind: 'pomo',
    position: { x: -1400, y: 0 },
    isMother: true,
    state: {},
    config: { stationSlot: 'top-left' },
  },
  {
    id: 'task-1',
    kind: 'todo.task',
    position: { x: 240, y: 80 },
    isMother: false,
    state: { text: 'write tests', done: false },
    config: {},
  },
];

const EDGES: Edge[] = [
  {
    id: 'e1',
    from: { nodeId: 'mother-pomo', event: 'link' },
    to: { nodeId: 'task-1', command: 'link' },
    enabled: true,
  },
];

function makeBoard(): Board {
  return {
    version: 1,
    schemaVersion: 2,
    savedAt: '2026-05-18T00:00:00.000Z',
    viewport: INITIAL_VIEWPORT,
    layoutMode: 'canvas',
    nodes: NODES,
    edges: EDGES,
  };
}

describe('mode toggle preserves board state (ADR 0008 F9)', () => {
  beforeEach(() => {
    useBoardStore.setState({
      board: makeBoard(),
      viewport: INITIAL_VIEWPORT,
      history: [],
      future: [],
    });
  });

  it('canvas → station: nodes unchanged', () => {
    useBoardStore.getState().setLayoutMode('station');
    const board = useBoardStore.getState().board!;
    expect(board.nodes).toHaveLength(2);
    expect(board.nodes[0]?.id).toBe('mother-pomo');
    expect(board.nodes[1]?.id).toBe('task-1');
  });

  it('canvas → station → canvas: nodes unchanged', () => {
    useBoardStore.getState().setLayoutMode('station');
    useBoardStore.getState().setLayoutMode('canvas');
    const board = useBoardStore.getState().board!;
    expect(board.nodes).toHaveLength(2);
    expect(board.nodes[1]?.position).toEqual({ x: 240, y: 80 });
  });

  it('canvas → station → canvas: edges unchanged', () => {
    useBoardStore.getState().setLayoutMode('station');
    useBoardStore.getState().setLayoutMode('canvas');
    const board = useBoardStore.getState().board!;
    expect(board.edges).toHaveLength(1);
    expect(board.edges[0]?.id).toBe('e1');
  });

  it('canvas → station → canvas: viewport unchanged in store', () => {
    useBoardStore.getState().setLayoutMode('station');
    useBoardStore.getState().setLayoutMode('canvas');
    // boardStore.viewport is not modified by mode toggle.
    expect(useBoardStore.getState().viewport).toEqual(INITIAL_VIEWPORT);
  });

  it('mode toggle does not push to history', () => {
    const histBefore = useBoardStore.getState().history.length;
    useBoardStore.getState().setLayoutMode('station');
    useBoardStore.getState().setLayoutMode('canvas');
    expect(useBoardStore.getState().history.length).toBe(histBefore);
  });

  it('mother position at (-1400, 0) is preserved across round-trip', () => {
    useBoardStore.getState().setLayoutMode('station');
    useBoardStore.getState().setLayoutMode('canvas');
    const pomo = useBoardStore.getState().board?.nodes.find((n) => n.id === 'mother-pomo');
    expect(pomo?.position).toEqual({ x: -1400, y: 0 });
  });
});
