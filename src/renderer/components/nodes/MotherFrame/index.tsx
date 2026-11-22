// MotherFrame — shared card frame for the 6 fixed mother nodes.
// Replicates the LifeOS Whiteboard.html `.node.fixed` pattern:
//   - badge slot tag (top:-11px, left:14px) with spine-hot-colored slot number
//   - 4 outset corner brackets (inset:-8px, L-shapes)
//
// Badge positioning (2026-05-15): the badge must overhang the panel top edge
// but `.react-flow` has `overflow:hidden`. Solution: portal badge to
// `document.body` with `position:fixed`.
//
// Badge tracking (pan-perf fix 2026-05-15): original approach called
// getBoundingClientRect() in a rAF loop — 6 forced layout reads per frame
// during pan. Replaced with viewportBus.rfToScreen() which computes the screen
// position from RF flow-coordinates + the known viewport transform. Zero DOM
// reads, zero layout flushes. Badge style uses CSS `transform:translate` (not
// top/left) so the write is also compositor-level.

import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useBoardStore } from '../../../store/boardStore';
import { scheduleBatch } from '../../../utils/rafBatcher';
import { rfToScreen, getZoom } from '../../../utils/viewportBus';

// Shared drag-and-drop MIME for swapping mother positions. Both station cells
// and canvas mother cards use this so a handle from one view can drop on a
// target in the other (when both happen to be live during a layout-mode
// transition). The string is namespaced so it doesn't collide with stray
// drag payloads from other apps or the canvas image-drop path.
import { MOTHER_DRAG_MIME, beginHold } from './motherDrag';
export { MOTHER_DRAG_MIME };

// Station mode mounts mother nodes inside resizable panels (ADR 0008). Each
// mother component renders its own <MotherFrame width=540> internally; in
// canvas mode that's correct (RF flow coords), but in station mode the
// fixed 540×540 prevents the card from filling the panel. StationCell
// wraps its child in this provider so any nested MotherFrame auto-switches
// to the fluid 100%/100% variant — no per-kind component changes needed.
/** The "01 · spine · 05" slot badge over a window in the Free layout. Off: it covered the header's name. */
const SHOW_SLOT_BADGE: boolean = false;

export const MotherFrameStationContext = createContext(false);

interface Props {
  nodeId: string;          // reports hover to boardStore so edges can bold on hover
  slotIndex: number;       // 1-based
  slotTotal: number;
  width: number;
  children: ReactNode;
  // RF flow-space position of this node — used to compute badge screen coords
  // without calling getBoundingClientRect(). Must match the node's actual RF
  // position (node.position from boardStore). For fixed mother nodes this is
  // always correct; positions only change on explicit swap commands.
  position: { x: number; y: number };
  background?: string;     // override (terminal uses --term-bg)
  borderColor?: string;
  minHeight?: number;      // override — must match INITIAL_DIMS_BY_KIND height
  // ADR 0008 § 2.7 / § 12 required change #4 — variant controls whether the
  // RF-specific rfToScreen badge tracker and portal are used.  In 'station'
  // variant the badge is a normal absolute-positioned span inside the panel
  // (no ViewportPortal, no rfToScreen arithmetic).  Mother content is identical.
  variant?: 'canvas' | 'station';
  /** Decision 60 — the window can be resized on the canvas (its right edge,
   *  bottom edge and corner); `onResized` gets the size when you let go. */
  resizable?: { onResize: (width: number, height: number, first: boolean) => void; min: { width: number; height: number }; max: { width: number; height: number } };
}

// Wave C (LifeOS UI refresh) — bumped to 500×500 so mothers read as the
// primary canvas anchor against the 220×120 child task cards. MUST stay in
// sync with INITIAL_DIMS_BY_KIND in rfAdapters.tsx and seed positions in
// src/main/persistence/board.ts — see ADR 0006.
export const MOTHER_WIDTH = 540;
export const MOTHER_HEIGHT = 540;
export const MOTHER_TOTAL = 7; // Decision 32 — analytics is the seventh mother

export function MotherFrame({
  nodeId,
  slotIndex,
  slotTotal,
  width,
  children,
  position,
  background = 'var(--node-bg)',
  borderColor = 'var(--paper-3)',
  minHeight = MOTHER_HEIGHT,
  variant: variantProp = 'canvas',
  resizable,
}: Props) {
  // Context override: when this MotherFrame is rendered inside a StationCell,
  // the provider sets the context to true and we force 'station' variant —
  // overriding the prop. This lets each mother component (PomoNode, etc.)
  // keep its own `<MotherFrame width={MOTHER_WIDTH}>` call unchanged.
  const inStation = useContext(MotherFrameStationContext);
  const variant: 'canvas' | 'station' = inStation ? 'station' : variantProp;
  const setHoveredNodeId = useBoardStore((s) => s.setHoveredNodeId);
  const idx = String(slotIndex).padStart(2, '0');
  const total = String(slotTotal).padStart(2, '0');

  const badgeRef = useRef<HTMLDivElement>(null);
  // Portal the badge into the canvas root (not <body>) so it shares the
  // canvas stacking context: it still escapes the node's clipping, but the
  // dock and other canvas panels draw on top of it.
  const frameRef = useRef<HTMLDivElement>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setPortalTarget((frameRef.current?.closest('.react-flow') as HTMLElement | null) ?? document.body);
  }, []);

  // Swapping windows is a pointer "hold and carry" (motherDrag.ts): the grip
  // picks the window up, the drop target is found under the pointer.

  // Badge position tracking (canvas variant only) — pure arithmetic, no DOM reads.
  // Badge anchor: left:14px, top:-11px relative to panel's RF top-left corner
  // → in screen space: rfToScreen(nodeX + 14, nodeY - 11).
  //
  // In 'station' variant this effect is a no-op: the badge renders as a normal
  // absolute-positioned span inside the panel — no ViewportPortal escape needed
  // because the panel is not clipped by .react-flow { overflow: hidden }.
  //
  // CSS transform is used instead of top/left because transform writes are
  // compositor-level (no layout dirtying). The badge starts at (0,0) hidden
  // via transform: the first rAF tick writes the real position.
  //
  // Dependency on position.x/y: re-registers when node is swapped so the
  // closure captures the new flow coordinates.
  useLayoutEffect(() => {
    if (variant === 'station') return;

    let cachedX = NaN;
    let cachedY = NaN;
    let cachedZ = NaN;
    let liveX = NaN;
    let liveY = NaN;
    let liveZ = 1;

    return scheduleBatch({
      read() {
        // Zero DOM reads — pure math from module-level viewport scalars.
        const s = rfToScreen(position.x + 14, position.y - 11);
        liveX = s.x;
        liveY = s.y;
        // Scale badge with the canvas zoom so it doesn't appear oversized
        // relative to the mother card when zooming out.
        liveZ = getZoom();
      },
      write() {
        const badge = badgeRef.current;
        if (!badge) return;
        if (liveX !== cachedX || liveY !== cachedY || liveZ !== cachedZ) {
          badge.style.transform = `translate(${liveX}px, ${liveY}px) scale(${liveZ})`;
          cachedX = liveX;
          cachedY = liveY;
          cachedZ = liveZ;
        }
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position.x, position.y, variant]);

  const isStation = variant === 'station';
  // Decision 60 — live size while an edge is dragged; it stays until the
  // board has the new size (no snap back to the old one for a frame).
  const [live, setLive] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => { setLive(null); }, [width, minHeight]);
  const startResize = (axis: 'x' | 'y' | 'xy') => (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizable || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const y0 = e.clientY;
    const zoom = getZoom() || 1;
    const w0 = width;
    const h0 = minHeight;
    let last = { width: w0, height: h0 };
    let started = false;
    // Decision 60 — smooth: while you drag, only the screen changes (this
    // frame's size, and the windows to its right slid along with a CSS
    // translate on their wrappers); the board is written once, on release.
    // (Writing it on every move re-rendered the whole canvas: it stuttered.)
    const frame = frameRef.current;
    const ownWrap = frame?.closest('.react-flow__node') as HTMLElement | null;
    const ownLeft = ownWrap?.getBoundingClientRect().left ?? 0;
    const neighbours = Array.from(document.querySelectorAll<HTMLElement>('.react-flow__node.krnl-mother'))
      .filter((el) => el !== ownWrap && el.getBoundingClientRect().left > ownLeft + 1)
      .map((el) => ({ el, transform: el.style.transform }));
    // Decision 61 — the inside keeps up by itself: the Calendar's hours are
    // sized by CSS from its own height, so they follow the edge in the same
    // frame (an earlier "scale while dragging" could leave the inside frozen
    // at its old size).
    let raf = 0;
    const paint = () => {
      raf = 0;
      if (frame) { frame.style.width = `${last.width}px`; frame.style.height = `${last.height}px`; }
      for (const n of neighbours) n.el.style.translate = `${last.width - w0}px 0px`;
    };
    // It grows like a picture (same shape), never below the standard size,
    // and snaps to the smallest and largest sizes when you come close.
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - x0) / zoom;
      const dy = (ev.clientY - y0) / zoom;
      const d = axis === 'x' ? dx : axis === 'y' ? dy : Math.max(dx, dy);
      // Every pixel (steps of 10 px read as jumps); snaps only at the ends.
      let side = Math.round(w0 + d);
      if (side < resizable.min.width + 28) side = resizable.min.width;
      if (side > resizable.max.width - 28) side = resizable.max.width;
      const next = { width: side, height: Math.round(side * (h0 / Math.max(1, w0))) };
      if (next.width === last.width && next.height === last.height) return;
      last = next;
      started = true;
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (raf) { cancelAnimationFrame(raf); paint(); }
      if (!started) return;
      // One write (one undo step); the neighbours' slide is handed to the
      // canvas once it has moved them. Their 280 ms glide is off for that
      // hand-off: with it, the new place glided in while the slide was taken
      // away, so a window jumped back and came forward again (owner).
      // The slide comes off in the very moment the canvas moves a window
      // (a style change is seen before the screen is drawn; checking once a
      // frame missed it by one frame: the window jumped and came back).
      for (const n of neighbours) n.el.style.transition = 'none';
      let done = false;
      const finish = (mo: MutationObserver | null) => {
        if (done) return;
        done = true;
        mo?.disconnect();
        for (const n of neighbours) n.el.style.translate = '';
        // The glide back on for later moves (swaps), once this is drawn.
        requestAnimationFrame(() => requestAnimationFrame(() => { for (const n of neighbours) n.el.style.transition = ''; }));
      };
      const mo = typeof MutationObserver === 'function'
        ? new MutationObserver(() => {
          let pending = false;
          for (const n of neighbours) {
            if (!n.el.style.translate) continue;
            if (n.el.style.transform !== n.transform) n.el.style.translate = '';
            else pending = true;
          }
          if (!pending) finish(mo);
        })
        : null;
      for (const n of neighbours) mo?.observe(n.el, { attributes: true, attributeFilter: ['style'] });
      resizable.onResize(last.width, last.height, true);
      // Never stuck: whatever the canvas shows after a moment stands.
      window.setTimeout(() => finish(mo), 600);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const shownW = live?.width ?? width;
  const shownH = live?.height ?? minHeight;
  return (
    <div
      ref={frameRef}
      className="mother-frame"
      data-tour={nodeId}
      onMouseEnter={() => setHoveredNodeId(nodeId)}
      onMouseLeave={() => setHoveredNodeId(null)}
      style={{
        position: 'relative',
        // Canvas: fixed 540×540 (RF flow coords). Station: fill the resizable
        // panel so the user can shrink/grow it without content overflowing.
        width: isStation ? '100%' : shownW,
        height: isStation ? '100%' : shownH,
        display: 'flex',
        flexDirection: 'column',
        background: background === 'var(--node-bg)'
          ? 'var(--k-mother-wash, linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0) 30%)), var(--node-bg)'
          : background,
        border: `1px solid ${borderColor}`,
        borderRadius: 'var(--k-mother-radius, 8px)',
        boxShadow:
          'var(--k-mother-shadow, 0 2px 8px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.04))',
        // Station-mode panels must clip overflow so the inner mother content
        // never bleeds past the resizable panel boundary.
        overflow: isStation ? 'hidden' : 'visible',
        contain: 'layout paint',
        // willChange:'transform' removed (2026-05-15 pan-perf fix) — promoting
        // 6 compositor layers costs VRAM with no benefit during pan. RF moves
        // the viewport wrapper, not individual node elements.
      }}
    >
      {/* Outset corner brackets — `inset:-8px`, opacity 0.3 base.
          `.mother-frame__corners` class so chassis.css can hide them under
          any active dock variant via `[data-dock]` selector. */}
      <div
        className="mother-frame__corners"
        aria-hidden
        style={{
          position: 'absolute',
          inset: -8,
          pointerEvents: 'none',
          opacity: 0.3,
        }}
      >
        <span style={cornerBase('tl')} />
        <span style={cornerBase('tr')} />
        <span style={cornerBase('bl')} />
        <span style={cornerBase('br')} />
      </div>

      {/* Canvas variant: top-edge drag handle for the swap-by-drag UX
          (replaces the in-gap swap-button click target — 2026-05-18).
          Station variant omits it because StationCell already renders one
          as a sibling, with the same MIME contract. */}
      {!isStation && (
        <MotherDragHandle nodeId={nodeId} />
      )}

      {/* Decision 60 — resize edges (canvas only): right, bottom, corner. */}
      {!isStation && resizable && (
        <>
          <div className="nodrag nopan mother-resize mother-resize--x" data-testid={`mother-resize-x-${nodeId}`} title="Drag to resize" onPointerDown={startResize('x')}
            style={{ position: 'absolute', top: 40, bottom: 14, right: -5, width: 10, cursor: 'ew-resize', zIndex: 6 }} />
          <div className="nodrag nopan mother-resize mother-resize--y" data-testid={`mother-resize-y-${nodeId}`} title="Drag to resize" onPointerDown={startResize('y')}
            style={{ position: 'absolute', left: 14, right: 14, bottom: -5, height: 10, cursor: 'ns-resize', zIndex: 6 }} />
          <div className="nodrag nopan mother-resize mother-resize--xy" data-testid={`mother-resize-${nodeId}`} title="Drag to resize" onPointerDown={startResize('xy')}
            style={{ position: 'absolute', right: 0, bottom: 0, width: 20, height: 20, cursor: 'nwse-resize', zIndex: 7 }}>
            {/* The canvas's own resize grip (as on notes and images). */}
            <svg className="mother-resize__grip" width="14" height="14" viewBox="0 0 14 14" aria-hidden style={{ position: 'absolute', right: 3, bottom: 3, color: 'var(--ink-4)', pointerEvents: 'none' }}>
              <path d="M13 5L5 13M13 9L9 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </div>
        </>
      )}

      {children}

      {/* Slot badge — canvas variant only.
          Station mode panels are named by position (top-row column, bottom
          clock) so a slot index would be visual noise. It also got clipped
          by overflow:hidden on the station mother frame ("splice box cut in
          half" bug). Skip it entirely in station variant. */}
      {/* window-frame.md (2026-11-20): the badge sat on top of the window's own header; it is no longer drawn. */}
      {SHOW_SLOT_BADGE && variant !== 'station' && (
        typeof document !== 'undefined' && portalTarget && createPortal(
          <div
            ref={badgeRef}
            className="mother-frame__badge"
            aria-hidden
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              transformOrigin: '0 0',
              // Start far offscreen — rAF writes the real transform on first paint.
              transform: 'translate(-9999px, -9999px)',
              background: 'var(--paper-2)',
              color: 'var(--ink-2)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              padding: '2.5px 8px 3px',
              borderRadius: 2,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              fontWeight: 600,
              border: '1px solid var(--paper-3)',
              // Above the nodes, under canvas panels (the dock).
              zIndex: 4,
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ color: 'var(--spine-hot)', marginRight: 1 }}>{idx}</span>
            <span> · spine · {total}</span>
          </div>,
          portalTarget,
        )
      )}
    </div>
  );
}

// MotherDragHandle — top-center grab affordance used to swap two mothers'
// positions via HTML5 drag-and-drop. Same MIME + .station-drag-handle CSS
// class as the station-mode handle so the visual treatment is identical
// across views; this one lives inside the canvas MotherFrame so the user
// no longer needs the inter-mother swap button. Pointer events stop
// propagating so RF doesn't start a pan / marquee when the user grabs it.
function MotherDragHandle({ nodeId }: { nodeId: string }) {
  // Press and move to pick the window up (it follows you, tilting in 3D).
  // Stops propagation so RF doesn't start a pan or marquee.
  const onPointerDown = useCallback((e: React.PointerEvent) => beginHold(e, nodeId), [nodeId]);
  const stop = useCallback((e: React.MouseEvent) => { e.stopPropagation(); }, []);
  return (
    <div
      role="button"
      aria-label="Drag to swap with another window"
      className="station-drag-handle"
      onPointerDown={onPointerDown}
      onMouseDown={stop}
    >
      <svg
        aria-hidden
        width="18"
        height="10"
        viewBox="0 0 18 10"
        fill="currentColor"
        style={{ display: 'block', pointerEvents: 'none' }}
      >
        <circle cx="3"  cy="3" r="1" />
        <circle cx="9"  cy="3" r="1" />
        <circle cx="15" cy="3" r="1" />
        <circle cx="3"  cy="7" r="1" />
        <circle cx="9"  cy="7" r="1" />
        <circle cx="15" cy="7" r="1" />
      </svg>
    </div>
  );
}

function cornerBase(corner: 'tl' | 'tr' | 'bl' | 'br'): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'absolute',
    width: 9,
    height: 9,
    border: '1.5px solid var(--ink-3)',
  };
  if (corner === 'tl') return { ...base, top: 0, left: 0, borderRight: 0, borderBottom: 0 };
  if (corner === 'tr') return { ...base, top: 0, right: 0, borderLeft: 0, borderBottom: 0 };
  if (corner === 'bl') return { ...base, bottom: 0, left: 0, borderRight: 0, borderTop: 0 };
  return { ...base, bottom: 0, right: 0, borderLeft: 0, borderTop: 0 };
}
