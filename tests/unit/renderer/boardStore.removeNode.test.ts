import { describe, it, expect, beforeEach } from 'vitest';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import type { Board } from '../../../src/shared/types';

function seed(): Board {
  return {
    version: 1,
    schemaVersion: 2,
    savedAt: '2026-05-12T00:00:00.000Z',
    viewport: { x: 0, y: 0, zoom: 1 },
    layoutMode: 'canvas',
    nodes: [
      {
        id: 'mom',
        kind: 'pomo',
        position: { x: 0, y: 0 },
        isMother: true,
        state: {},
        config: {},
      },
      {
        id: 'child-a',
        kind: 'text',
        position: { x: 100, y: 0 },
        isMother: false,
        state: { text: '' },
        config: {},
      },
      {
        id: 'child-b',
        kind: 'image',
        position: { x: 200, y: 0 },
        isMother: false,
        state: { assetId: null },
        config: {},
      },
    ],
    edges: [
      { id: 'e1', from: { nodeId: 'child-a', event: 'link' }, to: { nodeId: 'child-b', command: 'link' }, enabled: true },
      { id: 'e2', from: { nodeId: 'child-b', event: 'link' }, to: { nodeId: 'mom',     command: 'link' }, enabled: true },
      { id: 'e3', from: { nodeId: 'child-a', event: 'link' }, to: { nodeId: 'mom',     command: 'link' }, enabled: true },
    ],
  };
}

beforeEach(() => {
  useBoardStore.setState({ board: seed(), selectedNodeId: 'child-a' });
});

describe('boardStore.removeNode', () => {
  it('removes a non-mother node from board.nodes', () => {
    useBoardStore.getState().removeNode('child-a');
    const nodes = useBoardStore.getState().board?.nodes ?? [];
    expect(nodes.find((n) => n.id === 'child-a')).toBeUndefined();
    expect(nodes.find((n) => n.id === 'mom')).toBeDefined();
    expect(nodes.find((n) => n.id === 'child-b')).toBeDefined();
  });

  it('strips every edge that touches the removed node', () => {
    useBoardStore.getState().removeNode('child-a');
    const edges = useBoardStore.getState().board?.edges ?? [];
    expect(edges.map((e) => e.id).sort()).toEqual(['e2']);
  });

  it('refuses to delete a mother node', () => {
    useBoardStore.getState().removeNode('mom');
    const nodes = useBoardStore.getState().board?.nodes ?? [];
    expect(nodes.find((n) => n.id === 'mom')).toBeDefined();
    const edges = useBoardStore.getState().board?.edges ?? [];
    expect(edges).toHaveLength(3);
  });

  it('clears selectedNodeId if the deleted node was selected', () => {
    expect(useBoardStore.getState().selectedNodeId).toBe('child-a');
    useBoardStore.getState().removeNode('child-a');
    expect(useBoardStore.getState().selectedNodeId).toBeNull();
  });

  it('is a no-op for an unknown id', () => {
    const before = useBoardStore.getState().board;
    useBoardStore.getState().removeNode('does-not-exist');
    expect(useBoardStore.getState().board).toBe(before);
  });
});
