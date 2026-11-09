/** Readable parallel tasks and letter bars (calendar-clock-visuals F-PL1..F-PL4, F28). */
import { describe, it, expect } from 'vitest';
import { layoutDayBlocks, readableLaneCount, MIN_LANE_PX, READABLE_LANE_PX, LANE_CAP, type LanePlacement } from '../dayBlockLayout';

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
  it('F28: a clash that needs more lanes than fit keeps every plan in its own lane, as letter bars — nothing hidden', () => {
    const l = layoutDayBlocks(slices, raw, 84);
    expect(l.maxLanes).toBe(1);
    expect(l.clashes).toHaveLength(1);
    expect(l.clashes[0]!.slices.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(l.clashes[0]!.startMin).toBe(600);
    expect(l.clashes[0]!.endMin).toBe(690);
    expect([...l.lettered].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(l.placements.get('e')).toEqual({ colIndex: 4, colCount: 5, span: 1 });
  });

  it('the week caps lanes at 2 even when the column is wide; the day at 4', () => {
    expect(layoutDayBlocks(slices, raw, MIN_LANE_PX * 5, MIN_LANE_PX, LANE_CAP.week).maxLanes).toBe(2);
    expect(layoutDayBlocks(slices, raw, MIN_LANE_PX * 8, MIN_LANE_PX, LANE_CAP.day).maxLanes).toBe(4);
  });

  it('two parallel tasks: side by side when both lanes are readable, letter bars when names would be cut', () => {
    const pair = slices.slice(0, 2);
    const r = new Map<string, LanePlacement>([['a', { colIndex: 0, colCount: 2, span: 1 }], ['b', { colIndex: 1, colCount: 2, span: 1 }]]);
    const roomy = layoutDayBlocks(pair, r, READABLE_LANE_PX * 2, READABLE_LANE_PX, LANE_CAP.week);
    expect(roomy.clashes).toEqual([]);
    expect(roomy.placements.get('b')).toEqual({ colIndex: 1, colCount: 2, span: 1 });
    const narrow = layoutDayBlocks(pair, r, READABLE_LANE_PX * 2 - 1, READABLE_LANE_PX, LANE_CAP.week);
    expect(narrow.clashes[0]!.slices.map((s) => s.id)).toEqual(['a', 'b']);
    expect(narrow.placements.get('b')).toEqual({ colIndex: 1, colCount: 2, span: 1 });
  });

  it('wide column with a high cap: all lanes fit, names drawn', () => {
    const l = layoutDayBlocks(slices, raw, MIN_LANE_PX * 5, MIN_LANE_PX, 8);
    expect(l.maxLanes).toBe(5);
    expect(l.clashes).toEqual([]);
    expect(l.placements.get('e')).toEqual({ colIndex: 4, colCount: 5, span: 1 });
  });

  it('separate clashes are separate; a plan alone keeps the full width', () => {
    const run = (p: string, at: number) => [0, 1, 2, 3, 4].map((i) => ({ id: `${p}${i}`, startMin: at, endMin: at + 60 }));
    const two = [...run('a', 60), ...run('c', 600), { id: 'w', startMin: 900, endMin: 960 }];
    const r = new Map<string, LanePlacement>(two.map((s) => [s.id, { colIndex: s.id === 'w' ? 0 : Number(s.id.slice(1)), colCount: 5, span: 1 }]));
    const l = layoutDayBlocks(two, r, 80);
    expect(l.clashes.map((o) => o.slices.map((s) => s.id))).toEqual([['a0', 'a1', 'a2', 'a3', 'a4'], ['c0', 'c1', 'c2', 'c3', 'c4']]);
    expect(l.placements.get('w')).toEqual({ colIndex: 0, colCount: 1, span: 1 });
  });

  it('a clash lists its plans in start order, shorter first on a tie', () => {
    const s = [{ id: 'long', startMin: 600, endMin: 700 }, { id: 'late', startMin: 615, endMin: 640 }, { id: 'short', startMin: 600, endMin: 630 }];
    const r = new Map<string, LanePlacement>(s.map((x, i) => [x.id, { colIndex: i, colCount: 3, span: 1 }]));
    expect(layoutDayBlocks(s, r, 90, MIN_LANE_PX, LANE_CAP.week).clashes[0]!.slices.map((x) => x.id)).toEqual(['short', 'long', 'late']);
  });

  it('short plans that touch on screen count as one clash (minSpanMin)', () => {
    const s = [{ id: 'p', startMin: 600, endMin: 605 }, { id: 'q', startMin: 610, endMin: 615 }, { id: 'r', startMin: 612, endMin: 617 }];
    const r = new Map<string, LanePlacement>(s.map((x, i) => [x.id, { colIndex: i, colCount: 3, span: 1 }]));
    expect(layoutDayBlocks(s, r, 90, MIN_LANE_PX, LANE_CAP.week, 0).clashes[0]!.slices.map((x) => x.id)).toEqual(['q', 'r']);
    expect(layoutDayBlocks(s, r, 90, MIN_LANE_PX, LANE_CAP.week, 20).clashes[0]!.slices.map((x) => x.id)).toEqual(['p', 'q', 'r']);
  });

});
