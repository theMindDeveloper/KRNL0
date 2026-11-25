// The Free canvas as one steady GPU layer (Decision 65,
// docs/06-requirements/canvas-smoothness.md).
//
// reactflow-theme.css keeps the viewport a GPU layer for as long as the
// canvas is shown (an opacity hint: a pan only slides it, a zoom draws it
// again at the new size, sharp). This module puts the layer on whole device
// pixels (a picture drawn between pixels is blurred a little differently
// every frame: text shimmered while it moved).

import { getCanvasOrigin } from '../../utils/viewportBus';

/**
 * The correction that puts a translate of (x, y) CSS px on whole device
 * pixels: always under half a device pixel. `left` / `top` are the canvas's
 * own screen offset (a Station cell can sit at a fractional position), so it
 * is the layer's place on the screen that lands on a pixel.
 */
export function pixelSnapOffset(x: number, y: number, dpr: number, left = 0, top = 0): { x: number; y: number } {
  const d = dpr > 0 ? dpr : 1;
  const r = (v: number): number => {
    const o = Math.round((Math.round(v * d) / d - v) * 1000) / 1000;
    return o === 0 ? 0 : o; // never -0
  };
  return { x: r(left + x), y: r(top + y) };
}

/** Apply the correction with the CSS `translate` property (React Flow keeps writing `transform`). */
export function snapViewportToPixels(container: HTMLElement | null, x: number, y: number): void {
  const vp = container?.querySelector<HTMLElement>('.react-flow__viewport');
  if (!vp) return;
  const origin = getCanvasOrigin();
  const o = pixelSnapOffset(x, y, (typeof window !== 'undefined' && window.devicePixelRatio) || 1, origin.left, origin.top);
  const next = o.x === 0 && o.y === 0 ? '' : `${o.x}px ${o.y}px`;
  if (vp.style.translate !== next) vp.style.translate = next;
}

export interface CanvasLayer {
  /** Every viewport change (pan or zoom frame). */
  moved(x: number, y: number, zoom: number): void;
  dispose(): void;
}

/**
 * The layer itself needs nothing per frame (reactflow-theme.css: an opacity
 * hint keeps it a GPU layer that is drawn again at each zoom step, so there
 * is no redraw to time); each move only lands it on whole pixels.
 */
export function createCanvasLayer(getContainer: () => HTMLElement | null): CanvasLayer {
  return {
    moved(x, y) { snapViewportToPixels(getContainer(), x, y); },
    dispose() { /* nothing to undo */ },
  };
}
