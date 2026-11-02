import { describe, it, expect } from 'vitest';
import { motherRowY, MOTHER_ROW_GAP, MOTHER_ROW_HEIGHT } from '../../src/renderer/components/Canvas/motherRow';
import type { Node } from '../../src/shared/types/node';

const n = (y: number, isMother = false) => ({ id: `n${y}${isMother}`, kind: 'text', position: { x: 0, y }, isMother, config: {}, state: {} }) as unknown as Node;

describe('motherRowY', () => {
  it('stays at 0 when everything is below the row', () => {
    expect(motherRowY([n(0, true), n(900)])).toBe(0);
  });
  it('lifts the row above the topmost node so nothing sits behind a mother', () => {
    const y = motherRowY([n(0, true), n(300), n(800)]);
    expect(y + MOTHER_ROW_HEIGHT + MOTHER_ROW_GAP).toBeLessThanOrEqual(300);
  });
  it('ignores mothers and handles an empty canvas', () => {
    expect(motherRowY([n(-5000, true)])).toBe(0);
    expect(motherRowY([])).toBe(0);
  });
});
