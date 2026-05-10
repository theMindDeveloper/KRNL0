import { describe, it, expect, beforeEach } from 'vitest';
import { useBoardStore } from '../../../src/renderer/store/boardStore';

describe('boardStore viewport', () => {
  beforeEach(() => {
    useBoardStore.setState({ viewport: { x: 0, y: 160, zoom: 1 } });
  });

  it('starts at the default viewport (x=0, y=160, zoom=1)', () => {
    expect(useBoardStore.getState().viewport).toEqual({ x: 0, y: 160, zoom: 1 });
  });

  it('panBy translates viewport by screen pixels', () => {
    useBoardStore.getState().panBy(40, -20);
    expect(useBoardStore.getState().viewport).toEqual({ x: 40, y: 140, zoom: 1 });
  });

  it('setViewport clamps zoom to [0.25, 4]', () => {
    useBoardStore.getState().setViewport({ x: 0, y: 0, zoom: 99 });
    expect(useBoardStore.getState().viewport.zoom).toBe(4);
    useBoardStore.getState().setViewport({ x: 0, y: 0, zoom: 0.001 });
    expect(useBoardStore.getState().viewport.zoom).toBe(0.25);
  });

  it('zoomAt keeps the focal point fixed in world space', () => {
    // Start at identity. Place focal at (50, 30) in canvas-local coords.
    // World point under cursor = (50 - 0)/1, (30 - 160)/1 = (50, -130).
    useBoardStore.getState().zoomAt(50, 30, 2);
    const v = useBoardStore.getState().viewport;
    // After zoom, the same world point must still land at the cursor:
    //   screen = world * zoom + translate => (50,30) = (50,-130)*2 + (vx,vy)
    //   => vx = -50, vy = 290
    expect(v.zoom).toBe(2);
    expect(v.x).toBe(-50);
    expect(v.y).toBe(290);
  });

  it('zoomAt clamps within [0.25, 4] and is a no-op at the bound', () => {
    useBoardStore.setState({ viewport: { x: 0, y: 0, zoom: 4 } });
    useBoardStore.getState().zoomAt(0, 0, 2);
    expect(useBoardStore.getState().viewport.zoom).toBe(4);
  });

  it('resetViewport returns to the default', () => {
    useBoardStore.getState().setViewport({ x: 999, y: 999, zoom: 2 });
    useBoardStore.getState().resetViewport();
    expect(useBoardStore.getState().viewport).toEqual({ x: 0, y: 160, zoom: 1 });
  });
});
