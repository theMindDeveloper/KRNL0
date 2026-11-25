// CanvasGrid — the dot grid behind the Free canvas (Decision 65).
//
// React Flow's <Background> moves its SVG pattern by changing the pattern's
// x/y on every pan frame, so the whole screen of dots is drawn again 60–144
// times a second, and at fractional offsets the tiny dots shimmer. Here the
// dots are drawn once per zoom into a layer one tile larger than the canvas
// on each side, and a pan only slides that layer (a GPU transform, snapped
// to whole device pixels, so the dots stay still and crisp).
//
// Same look as the two <Background> layers it replaces: minor dots every 32,
// major dots every 160 (flow units), the same sizes, colours and positions.

import { memo, useId, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { getCanvasOrigin } from '../../utils/viewportBus';
import { useStoreApi } from '@xyflow/react';

export const GRID_LAYERS = [
  { id: 'krnl-grid-minor', gap: 32, size: 1.6, color: 'var(--grid)' },
  { id: 'krnl-grid-major', gap: 160, size: 3.6, color: 'var(--grid-strong)' },
] as const;

/** One tile of the grid layer: the largest gap (every smaller gap divides it). */
const TILE = 160;

/**
 * Where the grid layer sits for a viewport (x, y, zoom): its origin lands on
 * the same phase as the viewport's translate, one tile up-left of the canvas,
 * with its place on the screen (`left` / `top` = the canvas's own offset)
 * rounded to whole device pixels.
 */
export function gridOffset(x: number, y: number, zoom: number, dpr = 1, left = 0, top = 0): { x: number; y: number } {
  const tile = TILE * zoom;
  const mod = (v: number): number => ((v % tile) + tile) % tile;
  const snap = (v: number, o: number): number => Math.round((o + v) * dpr) / dpr - o;
  return { x: snap(mod(x) - tile, left), y: snap(mod(y) - tile, top) };
}

function CanvasGridImpl() {
  const store = useStoreApi();
  // The dot size follows the zoom through useSyncExternalStore, which renders
  // in the same frame as React Flow's viewport (a state update from a wheel
  // event could land a frame late: the dots would jump on every zoom step).
  const zoom = useSyncExternalStore(store.subscribe, () => store.getState().transform[2]);
  const ref = useRef<SVGSVGElement>(null);
  // Pattern ids unique per grid: two canvases on screen never share one.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');

  // A pan only moves the layer: written straight to the element, no render.
  useLayoutEffect(() => {
    const place = (t: readonly [number, number, number]): void => {
      const el = ref.current;
      if (!el) return;
      const origin = getCanvasOrigin();
      const o = gridOffset(t[0], t[1], t[2], window.devicePixelRatio || 1, origin.left, origin.top);
      el.style.transform = `translate3d(${o.x}px, ${o.y}px, 0)`;
    };
    place(store.getState().transform);
    return store.subscribe((s, prev) => {
      if (s.transform !== prev.transform) place(s.transform);
    });
  }, [store]);

  const tile = TILE * zoom;
  return (
    <svg
      ref={ref}
      className="react-flow__background krnl-canvas-grid"
      data-testid="canvas-grid"
      aria-hidden
      style={{
        position: 'absolute', left: 0, top: 0,
        width: `calc(100% + ${2 * tile}px)`, height: `calc(100% + ${2 * tile}px)`,
        pointerEvents: 'none', willChange: 'transform',
      }}
    >
      {GRID_LAYERS.map((l) => {
        const gap = l.gap * zoom;
        const r = (l.size * zoom) / 2;
        // React Flow's dot phase (offset 0): shifted back by 1 + gap / 2.
        const shift = 1 + gap / 2;
        return (
          <pattern key={l.id} id={`${l.id}-${uid}`} data-grid={l.id} x={0} y={0} width={gap} height={gap} patternUnits="userSpaceOnUse" patternTransform={`translate(-${shift},-${shift})`}>
            <circle cx={r} cy={r} r={r} style={{ fill: l.color }} />
          </pattern>
        );
      })}
      {GRID_LAYERS.map((l) => <rect key={l.id} x={0} y={0} width="100%" height="100%" fill={`url(#${l.id}-${uid})`} />)}
    </svg>
  );
}

export const CanvasGrid = memo(CanvasGridImpl);
