/** Station soft snap (station-layout.md, soft snap). */
import { describe, it, expect } from 'vitest';
import { dividers, snapRow, snapPercent } from '../../../src/renderer/components/Station/softSnap';

describe('soft snap', () => {
  const order = ['canvas', 'analytics', 'clock'];
  it('reads the dividers of a row', () => {
    expect(dividers({ canvas: 50, analytics: 22, clock: 28 }, order)).toEqual([50, 72]);
  });
  it('a divider let go close to the line above clicks onto it', () => {
    // Calendar's left edge is at 73 %; the Clock's edge was dropped at 72 %.
    const out = snapRow({ canvas: 50, analytics: 22, clock: 28 }, order, [73], 1.2);
    expect(out).toEqual({ canvas: 50, analytics: 23, clock: 27 });
  });
  it('far from any line it stays where you put it', () => {
    expect(snapRow({ canvas: 50, analytics: 15, clock: 35 }, order, [73], 1.2)).toBeNull();
  });
  it('already on the line: nothing to do (no loop)', () => {
    expect(snapRow({ canvas: 50, analytics: 23, clock: 27 }, order, [73], 1.2)).toBeNull();
  });
  it('never squeezes a panel below its minimum', () => {
    expect(snapRow({ canvas: 50, analytics: 22, clock: 28 }, order, [73], 1.2, { clock: 27.5 })).toBeNull();
  });
  it('14 px is about 1 % of a 1400 px wide window', () => {
    expect(snapPercent(1400)).toBeCloseTo(1, 5);
    expect(snapPercent(0)).toBe(0);
  });
});
