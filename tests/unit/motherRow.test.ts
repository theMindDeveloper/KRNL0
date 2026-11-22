import { describe, it, expect } from 'vitest';
import { motherRowY } from '../../src/renderer/components/Canvas/motherRow';
import type { Node } from '../../src/shared/types/node';

const n = (y: number, isMother = false, id = `n${y}${isMother}`) => ({ id, kind: 'text', position: { x: 0, y }, isMother, config: {}, state: {} }) as unknown as Node;

// Decision 60 — the row of windows stays where it is; notes never push it.
describe('motherRowY', () => {
  it('is the windows\' own height, whatever the notes do', () => {
    expect(motherRowY([n(0, true), n(900)])).toBe(0);
    expect(motherRowY([n(0, true), n(300), n(-800)])).toBe(0);
  });
  it('takes the height most windows share; an empty canvas is 0', () => {
    expect(motherRowY([n(-120, true, 'a'), n(-120, true, 'b'), n(40, true, 'c')])).toBe(-120);
    expect(motherRowY([])).toBe(0);
  });
});
