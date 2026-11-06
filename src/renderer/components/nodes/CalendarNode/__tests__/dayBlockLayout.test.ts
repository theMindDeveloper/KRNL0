/** Readable parallel tasks (calendar-clock-visuals F-PL1..F-PL4). */
import { describe, it, expect } from 'vitest';
import { layoutDayBlocks, readableLaneCount, MIN_LANE_PX, MIN_SIDE_BY_SIDE, LANE_CAP, type LanePlacement } from '../dayBlockLayout';

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
  it('narrow column: two lanes, the first task and a chip for the rest (no slivers)', () => {
    const l = layoutDayBlocks(slices, raw, 84);
    expect(l.maxLanes).toBe(MIN_SIDE_BY_SIDE);
    expect(l.placements.get('a')).toEqual({ colIndex: 0, colCount: 2, span: 1 });
    expect([...l.hidden].sort()).toEqual(['b', 'c', 'd', 'e']);
    expect(l.overflow).toHaveLength(1);
    expect(l.overflow[0]!.leftFrac).toBe(0.5);
  });

  it('the week caps lanes at 2 even when the column is wide; the day at 4', () => {
    expect(layoutDayBlocks(slices, raw, MIN_LANE_PX * 5, MIN_LANE_PX, LANE_CAP.week).maxLanes).toBe(2);
    expect(layoutDayBlocks(slices, raw, MIN_LANE_PX * 8, MIN_LANE_PX, LANE_CAP.day).maxLanes).toBe(4);
  });

  it('two parallel tasks in a narrow column: both visible, nothing collapses', () => {
    const pair = slices.slice(0, 2);
    const r = new Map<string, LanePlacement>([['a', { colIndex: 0, colCount: 2, span: 1 }], ['b', { colIndex: 1, colCount: 2, span: 1 }]]);
    const l = layoutDayBlocks(pair, r, 60);
    expect(l.hidden.size).toBe(0);
    expect(l.placements.get('b')).toEqual({ colIndex: 1, colCount: 2, span: 1 });
  });

  it('wide column with a high cap: all lanes fit, nothing collapses', () => {
    const l = layoutDayBlocks(slices, raw, MIN_LANE_PX * 5, MIN_LANE_PX, 8);
    expect(l.maxLanes).toBe(5);
    expect(l.hidden.size).toBe(0);
    expect(l.overflow).toEqual([]);
    expect(l.placements.get('e')).toEqual({ colIndex: 4, colCount: 5, span: 1 });
  });

  it('separate overlap runs get separate chips', () => {
    const run = (p: string, at: number) => [0, 1, 2, 3, 4].map((i) => ({ id: `${p}${i}`, startMin: at, endMin: at + 60 }));
    const two = [...run('a', 60), ...run('c', 600)];
    const r = new Map<string, LanePlacement>(two.map((s) => [s.id, { colIndex: Number(s.id.slice(1)), colCount: 5, span: 1 }]));
    const l = layoutDayBlocks(two, r, 80);
    expect(l.overflow.map((o) => o.slices.map((s) => s.id))).toEqual([['a1', 'a2', 'a3', 'a4'], ['c1', 'c2', 'c3', 'c4']]);
  });

  it('a block widens over the chip lane where no hidden task is', () => {
    const pair = [{ id: 'x', startMin: 600, endMin: 660 }, { id: 'y', startMin: 600, endMin: 660 }, { id: 'z', startMin: 600, endMin: 660 }, { id: 'w', startMin: 900, endMin: 960 }];
    const r = new Map<string, LanePlacement>([['x', { colIndex: 0, colCount: 3, span: 1 }], ['y', { colIndex: 1, colCount: 3, span: 1 }], ['z', { colIndex: 2, colCount: 3, span: 1 }], ['w', { colIndex: 0, colCount: 3, span: 1 }]]);
    const l = layoutDayBlocks(pair, r, 140, MIN_LANE_PX, LANE_CAP.week);
    expect(l.placements.get('x')).toEqual({ colIndex: 0, colCount: 2, span: 1 });
    expect(l.placements.get('w')).toEqual({ colIndex: 0, colCount: 2, span: 2 });
  });
});
