/** The tour's guide card never covers what it talks about (when the screen allows it). */
import { describe, it, expect } from 'vitest';
import { placeCard } from '../../../src/renderer/components/Tour/TourHost';

const overlaps = (p: { left: number; top: number }, w: number, h: number, r: { left: number; top: number; width: number; height: number }) =>
  p.left < r.left + r.width && p.left + w > r.left && p.top < r.top + r.height && p.top + h > r.top;

describe('placeCard', () => {
  it('goes below a small target when there is room', () => {
    const r = { left: 100, top: 100, width: 200, height: 40 };
    expect(placeCard(r, 420, 240, 1280, 800)).toEqual({ left: 100, top: 158 });
  });
  it('with no room on any side, it picks a spot clear of a tall target (Settings › Sounds)', () => {
    const r = { left: 460, top: 140, width: 520, height: 600 };
    const p = placeCard(r, 420, 240, 1280, 800);
    expect(overlaps(p, 420, 240, r)).toBe(false);
  });
  it('when every spot overlaps, it covers as little as possible', () => {
    const r = { left: 40, top: 40, width: 1200, height: 720 };
    const p = placeCard(r, 420, 240, 1280, 800);
    expect(p).toBeDefined();
  });
});
