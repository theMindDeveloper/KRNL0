/**
 * viewportBus — module-level RF viewport state for zero-layout-read badge tracking.
 *
 * Problem: badge and swap-button trackers called getBoundingClientRect() every
 * frame during pan. Even when batched (rafBatcher), each frame still requires
 * one layout flush because the previous frame's style.top/left writes dirty the
 * layout tree, and getBoundingClientRect forces a sync re-layout to resolve them.
 *
 * Fix: remove all getBoundingClientRect calls from the hot path entirely.
 * The RF viewport transform is known (x, y, zoom) and the RF canvas container's
 * screen offset is known (canvasLeft, canvasTop). The screen position of any
 * node-local point (rfX, rfY) is pure arithmetic:
 *
 *   screenX = canvasLeft + rfX * zoom + vpX
 *   screenY = canvasTop  + rfY * zoom + vpY
 *
 * CanvasFlow calls updateViewport() from its onMove handler (every pan frame)
 * and updateCanvasRect() from a ResizeObserver on the canvas container element.
 * Badge and swap-button write callbacks call rfToScreen() — no DOM access.
 */

let _vpX = 0;
let _vpY = 0;
let _zoom = 1;
let _canvasLeft = 0;
let _canvasTop = 0;

/** Called by CanvasFlow's onMove (every viewport change during pan/zoom). */
export function updateViewport(x: number, y: number, zoom: number): void {
  _vpX = x;
  _vpY = y;
  _zoom = zoom;
}

/** Called by CanvasFlow's ResizeObserver on the canvas container div. */
export function updateCanvasRect(left: number, top: number): void {
  _canvasLeft = left;
  _canvasTop = top;
}

/**
 * Convert RF flow-space coordinates to screen (fixed-position) pixels.
 * Safe to call in rAF write callbacks — reads only module-level scalars.
 */
export function rfToScreen(rfX: number, rfY: number): { x: number; y: number } {
  return {
    x: Math.round(_canvasLeft + rfX * _zoom + _vpX),
    y: Math.round(_canvasTop + rfY * _zoom + _vpY),
  };
}
