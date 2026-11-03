/** First-run detection for the orb's greeting. */
import { describe, it, expect } from 'vitest';
import { isFreshBoard } from '../../../src/renderer/components/Orb/freshBoard';
import type { Board } from '../../../src/shared/types';

const b = (nodes: unknown[]) => ({ nodes, edges: [] }) as unknown as Board;
const mother = (kind: string, state: Record<string, unknown> = {}) => ({ id: `mother-${kind}`, kind, isMother: true, state });

describe('isFreshBoard', () => {
  it('only the seeded, untouched mothers → fresh', () => {
    expect(isFreshBoard(b([mother('todo', { items: [] }), mother('habit', { habits: [] }), mother('pomo', { history: [] })]))).toBe(true);
  });
  it('a todo, a habit, a pomo span or any free node → not fresh', () => {
    expect(isFreshBoard(b([mother('todo', { items: [{ id: 'i' }] })]))).toBe(false);
    expect(isFreshBoard(b([mother('habit', { habits: [{ id: 'h' }] })]))).toBe(false);
    expect(isFreshBoard(b([mother('pomo', { history: [{ id: 's' }] })]))).toBe(false);
    expect(isFreshBoard(b([mother('todo'), { id: 'n', kind: 'text', isMother: false, state: {} }]))).toBe(false);
    expect(isFreshBoard(null)).toBe(false);
  });
});
