/** Readable parallel tasks (calendar-clock-visuals F-PL1..F-PL4). */
import { describe, it, expect } from 'vitest';
import { layoutDayBlocks, readableLaneCount, MIN_LANE_PX, type LanePlacement } from '../dayBlockLayout';

// Five tasks all overlapping 10:00–11:30 — the screenshot case.
const slices = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, startMin: 600 + i * 10, endMin: 690 }));
const raw = new Map<string, LanePlacement>(slices.map((s, i) => [s.id, { colIndex: i, colCount: 5, span: 1 }]));

describe('readableLaneCount', () => {
  it('is never below 1 and never NaN', () => {
    expect(readableLaneCount(0)).toBe(1);
    expect(readableLaneCount(-5)).toBe(1);
    expect(readableLaneCount(Number.NaN)).toBe(1);
    expect(readableLaneCount(MIN_LANE_PX - 1)).toBe(1);
    expect(readableLaneCount(MIN_LANE_PX * 3 + 1)).toBe(3);
  });
});

describe('layoutDayBlocks', () => {
  it('narrow column (1 lane): first task full width, the rest in one compact chip', () => {
    const l = layoutDayBlocks(slices, raw, 84);
    expect(l.maxLanes).toBe(1);
    expect([...l.placements.entries()]).toEqual([['a', { colIndex: 0, colCount: 1, span: 1 }]]);
    expect([...l.hidden].sort()).toEqual(['b', 'c', 'd', 'e']);
    expect(l.overflow).toHaveLength(1);
    expect(l.overflow[0]!.compact).toBe(true);
    expect(l.overflow[0]!.slices.map((s) => s.id)).toEqual(['b', 'c', 'd', 'e']);
    expect(l.overflow[0]!.startMin).toBe(610);
  });

  it('two lanes: one task lane plus a chip lane', () => {
    const l = layoutDayBlocks(slices, raw, MIN_LANE_PX * 2);
    expect(l.maxLanes).toBe(2);
    expect(l.placements.get('a')).toEqual({ colIndex: 0, colCount: 2, span: 1 });
    expect(l.hidden.size).toBe(4);
    expect(l.overflow[0]!.compact).toBe(false);
    expect(l.overflow[0]!.leftFrac).toBe(0.5);
  });

  it('every visible block is at least MIN_LANE_PX wide', () => {
    for (const px of [40, 84, 130, 200, 260, 400]) {
      const l = layoutDayBlocks(slices, raw, px);
      for (const p of l.placements.values()) {
        expect((px * p.span) / p.colCount).toBeGreaterThanOrEqual(Math.min(px, MIN_LANE_PX));
      }
      for (const og of l.overflow) expect(Number.isFinite(og.leftFrac)).toBe(true);
    }
  });

  it('wide column: all lanes fit, nothing collapses', () => {
    const l = layoutDayBlocks(slices, raw, MIN_LANE_PX * 5);
    expect(l.hidden.size).toBe(0);
    expect(l.overflow).toEqual([]);
    expect(l.placements.get('e')).toEqual({ colIndex: 4, colCount: 5, span: 1 });
  });

  it('separate overlap runs get separate chips', () => {
    const two = [
      { id: 'a', startMin: 60, endMin: 120 }, { id: 'b', startMin: 60, endMin: 120 },
      { id: 'c', startMin: 600, endMin: 660 }, { id: 'd', startMin: 600, endMin: 660 },
    ];
    const r = new Map<string, LanePlacement>([
      ['a', { colIndex: 0, colCount: 2, span: 1 }], ['b', { colIndex: 1, colCount: 2, span: 1 }],
      ['c', { colIndex: 0, colCount: 2, span: 1 }], ['d', { colIndex: 1, colCount: 2, span: 1 }],
    ]);
    const l = layoutDayBlocks(two, r, 80);
    expect(l.overflow.map((o) => o.slices.map((s) => s.id))).toEqual([['b'], ['d']]);
  });
});
