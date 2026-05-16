// cameraEnsureVisible — pan/zoom the RF viewport so a flow-space rect is
// comfortably inside the visible canvas.
//
// Reusable for any "focus a thing" interaction (spawn a node, jump to a
// search result, focus a chain head, follow a notification, etc.). The
// camera only ever zooms OUT — never IN — so a user who is purposely
// zoomed-in on something stays roughly at their level unless the target
// genuinely doesn't fit at their current zoom.
//
// Usage:
//   const ensureVisible = useCameraEnsureVisible(canvasRef);
//   ensureVisible({ x, y, width, height });
//   ensureVisible(rect, { padding: 80, duration: 600 });

import { useCallback, type RefObject } from 'react';
import { useReactFlow } from '@xyflow/react';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EnsureVisibleOptions {
  /** Screen-space padding (px) kept clear of canvas edges. Default 60. */
  padding?: number;
  /** Animation duration in ms. Pass 0 for instant. Default 400. */
  duration?: number;
  /** If the rect is already fully visible with `padding` margin, skip. Default true. */
  skipIfVisible?: boolean;
}

interface RFView {
  getViewport: () => { x: number; y: number; zoom: number };
  setViewport: (
    vp: { x: number; y: number; zoom: number },
    opts?: { duration?: number },
  ) => void;
}

/** Pure imperative — call directly when you already hold the RF instance + canvas element. */
export function cameraEnsureVisible(
  rf: RFView,
  canvasEl: HTMLElement,
  rect: Rect,
  opts: EnsureVisibleOptions = {},
): void {
  const padding = opts.padding ?? 60;
  const duration = opts.duration ?? 400;
  const skipIfVisible = opts.skipIfVisible ?? true;

  const cw = canvasEl.clientWidth;
  const ch = canvasEl.clientHeight;
  if (cw <= 0 || ch <= 0) return;

  const vp = rf.getViewport();
  const z = vp.zoom;

  // Flow-space rect → screen-space within canvas container.
  const sx = rect.x * z + vp.x;
  const sy = rect.y * z + vp.y;
  const sw = rect.width * z;
  const sh = rect.height * z;

  const fullyVisible =
    sx >= padding &&
    sy >= padding &&
    sx + sw <= cw - padding &&
    sy + sh <= ch - padding;

  if (skipIfVisible && fullyVisible) return;

  // Target zoom = min(current, fitting). Never zoom IN to a target.
  const availW = Math.max(1, cw - padding * 2);
  const availH = Math.max(1, ch - padding * 2);
  const fitZoom = Math.min(availW / rect.width, availH / rect.height);
  const targetZoom = Math.min(z, fitZoom);

  // Center the rect in the canvas at the target zoom.
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const newVpX = cw / 2 - cx * targetZoom;
  const newVpY = ch / 2 - cy * targetZoom;

  rf.setViewport({ x: newVpX, y: newVpY, zoom: targetZoom }, { duration });
}

/** React hook — wraps cameraEnsureVisible with the RF instance + a canvas ref. */
export function useCameraEnsureVisible(
  canvasRef: RefObject<HTMLElement | null>,
): (rect: Rect, opts?: EnsureVisibleOptions) => void {
  const { getViewport, setViewport } = useReactFlow();
  return useCallback(
    (rect: Rect, opts?: EnsureVisibleOptions) => {
      const el = canvasRef.current;
      if (!el) return;
      cameraEnsureVisible({ getViewport, setViewport }, el, rect, opts);
    },
    [canvasRef, getViewport, setViewport],
  );
}
