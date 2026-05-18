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

import { createContext, useContext, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useBoardStore } from '../../../store/boardStore';
import { scheduleBatch } from '../../../utils/rafBatcher';
import { rfToScreen, getZoom } from '../../../utils/viewportBus';

// Station mode mounts mother nodes inside resizable panels (ADR 0008). Each
// mother component renders its own <MotherFrame width=540> internally; in
// canvas mode that's correct (RF flow coords), but in station mode the
// fixed 540×540 prevents the card from filling the panel. StationCell
// wraps its child in this provider so any nested MotherFrame auto-switches
// to the fluid 100%/100% variant — no per-kind component changes needed.
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
}

// Wave C (LifeOS UI refresh) — bumped to 500×500 so mothers read as the
// primary canvas anchor against the 220×120 child task cards. MUST stay in
// sync with INITIAL_DIMS_BY_KIND in rfAdapters.tsx and seed positions in
// src/main/persistence/board.ts — see ADR 0006.
export const MOTHER_WIDTH = 540;
export const MOTHER_HEIGHT = 540;
export const MOTHER_TOTAL = 6;

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
  return (
    <div
      className="mother-frame"
      onMouseEnter={() => setHoveredNodeId(nodeId)}
      onMouseLeave={() => setHoveredNodeId(null)}
      style={{
        position: 'relative',
        // Canvas: fixed 540×540 (RF flow coords). Station: fill the resizable
        // panel so the user can shrink/grow it without content overflowing.
        width: isStation ? '100%' : width,
        height: isStation ? '100%' : minHeight,
        display: 'flex',
        flexDirection: 'column',
        background: background === 'var(--node-bg)'
          ? 'linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0) 30%), var(--node-bg)'
          : background,
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        boxShadow:
          '0 2px 8px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.04)',
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

      {children}

      {/* Slot badge — two rendering paths depending on variant:
          'canvas': portaled to document.body with position:fixed so it escapes
            `.react-flow`'s overflow:hidden clip. rafBatcher computes real coords
            each frame from rfToScreen() — no getBoundingClientRect, no layout reads.
          'station': normal absolute-positioned span inside the panel. The panel
            is not RF-clipped so no portal escape is needed. */}
      {variant === 'station' ? (
        <span
          className="mother-frame__badge"
          aria-hidden
          style={{
            position: 'absolute',
            top: -11,
            left: 14,
            background: 'var(--paper-2)',
            color: 'var(--ink-2)',
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            padding: '2.5px 8px 3px',
            borderRadius: 2,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            fontWeight: 600,
            border: '1px solid var(--paper-3)',
            zIndex: 5,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ color: 'var(--spine-hot)', marginRight: 1 }}>{idx}</span>
          <span> · spine · {total}</span>
        </span>
      ) : (
        typeof document !== 'undefined' && createPortal(
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
              fontSize: 9,
              padding: '2.5px 8px 3px',
              borderRadius: 2,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              fontWeight: 600,
              border: '1px solid var(--paper-3)',
              zIndex: 5,
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ color: 'var(--spine-hot)', marginRight: 1 }}>{idx}</span>
            <span> · spine · {total}</span>
          </div>,
          document.body,
        )
      )}
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
