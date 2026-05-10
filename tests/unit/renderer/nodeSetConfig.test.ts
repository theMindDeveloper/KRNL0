import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for node.setConfig command — Decision #15.
 * This command is handled directly in makeCommandHandler (not in applyCommand),
 * so we test it via the makeCommandHandler closure with a mocked boardStore.
 */

// We must set up mocks before importing the module under test.
const mockUpdateNode = vi.fn();
let mockBoard: {
  nodes: Array<{ id: string; kind: string; state: Record<string, unknown>; config: Record<string, unknown> }>;
  edges: unknown[];
} = { nodes: [], edges: [] };

vi.mock('../../../src/renderer/store/boardStore', () => ({
  useBoardStore: {
    getState: () => ({
      board: mockBoard,
      updateNode: mockUpdateNode,
      addNode: vi.fn(),
      addEdge: vi.fn(),
    }),
  },
}));

// window.krnl is not available in tests — mock it to avoid errors
Object.defineProperty(globalThis, 'window', {
  value: { krnl: undefined },
  writable: true,
});

import { makeCommandHandler } from '../../../src/renderer/components/Canvas/commandDispatch';

describe('node.setConfig command (Decision #15)', () => {
  beforeEach(() => {
    mockUpdateNode.mockClear();
    mockBoard = {
      nodes: [
        {
          id: 'pomo-1',
          kind: 'pomo',
          state: { status: 'idle' },
          config: { defaultDurationMin: 25, defaultBreakMin: 5, variant: 'vapor' },
        },
      ],
      edges: [],
    };
  });

  it('patches config without overwriting other config fields', () => {
    const handler = makeCommandHandler('pomo-1');
    handler('node.setConfig', { patch: { variant: 'ring' } });

    expect(mockUpdateNode).toHaveBeenCalledOnce();
    const [id, patch] = mockUpdateNode.mock.calls[0] as [string, { config: Record<string, unknown> }];
    expect(id).toBe('pomo-1');
    // variant should be updated
    expect(patch.config['variant']).toBe('ring');
    // other existing config fields should be preserved
    expect(patch.config['defaultDurationMin']).toBe(25);
    expect(patch.config['defaultBreakMin']).toBe(5);
  });

  it('adds new config keys without overwriting existing ones', () => {
    const handler = makeCommandHandler('pomo-1');
    handler('node.setConfig', { patch: { longBreakEvery: 6 } });

    const [, patch] = mockUpdateNode.mock.calls[0] as [string, { config: Record<string, unknown> }];
    // New key added
    expect(patch.config['longBreakEvery']).toBe(6);
    // Pre-existing keys still present
    expect(patch.config['defaultDurationMin']).toBe(25);
    expect(patch.config['variant']).toBe('vapor');
  });

  it('patches multiple fields at once', () => {
    const handler = makeCommandHandler('pomo-1');
    handler('node.setConfig', { patch: { variant: 'ascii', defaultDurationMin: 50 } });

    const [, patch] = mockUpdateNode.mock.calls[0] as [string, { config: Record<string, unknown> }];
    expect(patch.config['variant']).toBe('ascii');
    expect(patch.config['defaultDurationMin']).toBe(50);
    // Unchanged field
    expect(patch.config['defaultBreakMin']).toBe(5);
  });

  it('is a no-op when patch argument is missing', () => {
    const handler = makeCommandHandler('pomo-1');
    // No 'patch' key in args
    handler('node.setConfig', {});
    expect(mockUpdateNode).not.toHaveBeenCalled();
  });

  it('is a no-op when node is not found in the board', () => {
    const handler = makeCommandHandler('nonexistent-id');
    handler('node.setConfig', { patch: { variant: 'lcd' } });
    expect(mockUpdateNode).not.toHaveBeenCalled();
  });

  it('does not mutate state field — only config', () => {
    const handler = makeCommandHandler('pomo-1');
    handler('node.setConfig', { patch: { variant: 'blocks' } });

    const [, patch] = mockUpdateNode.mock.calls[0] as [string, { config: Record<string, unknown>; state?: unknown }];
    // updateNode should only be called with a config patch, not a state patch
    expect(patch).not.toHaveProperty('state');
    expect(patch).toHaveProperty('config');
  });
});
