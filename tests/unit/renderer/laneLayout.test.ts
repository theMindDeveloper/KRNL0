import { describe, it, expect } from 'vitest';
import { packLanes } from '../../../src/renderer/store/laneLayout';

const iv = (id: string, start: number, end: number) => ({ id, start, end });

describe('packLanes', () => {
  it('non-overlapping blocks each get a full-width single lane', () => {
    const r = packLanes([iv('a', 0, 60), iv('b', 60, 120)]);
    expect(r.get('a')).toEqual({ lane: 0, laneCount: 1, span: 1 });
    expect(r.get('b')).toEqual({ lane: 0, laneCount: 1, span: 1 });
  });

  it('a 3-way parallel fork gets 3 equal lanes', () => {
    const r = packLanes([iv('x', 60, 105), iv('y', 60, 90), iv('z', 60, 120)]);
    expect(new Set([...r.values()].map((p) => p.lane))).toEqual(new Set([0, 1, 2]));
    for (const p of r.values()) expect(p.laneCount).toBe(3);
  });

  it('every block in a chained-overlap cluster shares the lane count', () => {
    // a overlaps b, b overlaps c, a does not overlap c
    const r = packLanes([iv('a', 0, 60), iv('b', 30, 90), iv('c', 70, 120)]);
    expect(r.get('a')!.laneCount).toBe(2);
    expect(r.get('c')!.laneCount).toBe(2);
    expect(r.get('c')!.lane).toBe(0); // reuses lane 0 freed by a
  });

  it('a block widens into lanes that stay free for its whole interval', () => {
    // fork x,y,z at 60; summary s at 120–150 overlaps only z (60–130)
    const r = packLanes([iv('x', 60, 105), iv('y', 60, 90), iv('z', 60, 130), iv('s', 120, 150)]);
    const s = r.get('s')!;
    const z = r.get('z')!;
    expect(s.laneCount).toBe(3);
    expect(s.lane).not.toBe(z.lane);
    // s may span every lane except z's
    expect(s.span).toBeGreaterThanOrEqual(1);
    expect(s.lane + s.span <= z.lane || s.lane > z.lane).toBe(true);
  });

  it('five crowded tasks in one hour use at most the lanes they need', () => {
    const r = packLanes([0, 10, 20, 30, 40].map((m, i) => iv(`c${i}`, 840 + m, 860 + m)));
    const counts = new Set([...r.values()].map((p) => p.laneCount));
    expect(counts).toEqual(new Set([2]));
  });

  it('separate clusters get independent lane counts', () => {
    const r = packLanes([iv('a', 0, 60), iv('b', 0, 60), iv('c', 100, 160)]);
    expect(r.get('a')!.laneCount).toBe(2);
    expect(r.get('c')).toEqual({ lane: 0, laneCount: 1, span: 1 });
  });
});
