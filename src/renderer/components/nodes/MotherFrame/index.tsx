// MotherFrame — shared card frame for the 6 fixed mother nodes.
// Replicates the LifeOS Whiteboard.html `.node.fixed` pattern:
//   - badge slot tag (top:-11px, left:14px) with spine-hot-colored slot number
//   - 4 outset corner brackets (inset:-8px, L-shapes)
//
// Slot badge clipping note (2026-05-15): the badge needs to overhang the
// panel's top edge per the LifeOS design, but `.react-flow` has
// `overflow:hidden` to clip nodes during pan/zoom. When a mother is panned
// near the canvas top, the negative-top badge gets sliced. The fix is to
// portal the badge into `document.body` with `position:fixed` so it escapes
// the canvas's clip context entirely. Position is tracked via rAF +
// getBoundingClientRect so badge follows the panel during pan/zoom without
// subscribing to RF store (which would re-render on every viewport tick).

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useBoardStore } from '../../../store/boardStore';

interface Props {
  nodeId: string;          // reports hover to boardStore so edges can bold on hover
  slotIndex: number;       // 1-based
  slotTotal: number;
  width: number;
  children: ReactNode;
  background?: string;     // override (terminal uses --term-bg)
  borderColor?: string;
  minHeight?: number;      // override — must match INITIAL_DIMS_BY_KIND height
}

// Wave C (LifeOS UI refresh) — bumped to 500×500 so mothers read as the
// primary canvas anchor against the 220×120 child task cards. MUST stay in
// sync with INITIAL_DIMS_BY_KIND in rfAdapters.tsx and seed positions in
// src/main/persistence/board.ts — see ADR 0006.
export const MOTHER_WIDTH = 500;
export const MOTHER_HEIGHT = 500;
export const MOTHER_TOTAL = 6;

export function MotherFrame({
  nodeId,
  slotIndex,
  slotTotal,
  width,
  children,
  background = 'var(--node-bg)',
  borderColor = 'var(--paper-3)',
  minHeight = MOTHER_HEIGHT,
}: Props) {
  const setHoveredNodeId = useBoardStore((s) => s.setHoveredNodeId);
  const idx = String(slotIndex).padStart(2, '0');
  const total = String(slotTotal).padStart(2, '0');

  const rootRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);

  // Single rAF loop per mother that mirrors the panel's top-left screen
  // position to the portaled badge. getBoundingClientRect forces layout, so
  // we read once and write once per frame, never inside React's render.
  useLayoutEffect(() => {
    let rafId: number | null = null;
    let lastL = NaN;
    let lastT = NaN;
    const tick = () => {
      const root = rootRef.current;
      const badge = badgeRef.current;
      if (root && badge) {
        const r = root.getBoundingClientRect();
        // Badge anchored to panel's top-left, offset to overhang by 11px
        // and indent 14px (matches original LifeOS layout).
        const l = Math.round(r.left + 14);
        const t = Math.round(r.top - 11);
        if (l !== lastL) {
          badge.style.left = `${l}px`;
          lastL = l;
        }
        if (t !== lastT) {
          badge.style.top = `${t}px`;
          lastT = t;
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      onMouseEnter={() => setHoveredNodeId(nodeId)}
      onMouseLeave={() => setHoveredNodeId(null)}
      style={{
        position: 'relative',
        width,
        // Pinned fixed height (not minHeight) — see PR2.1 history. Bodies
        // must overflow internally.
        height: minHeight,
        display: 'flex',
        flexDirection: 'column',
        // Subtle gradient overlay on the base bg for the "panel" feel — top
        // is slightly lighter so the card has a hint of elevation. Falls back
        // to plain bg if `background` was overridden (terminal --term-bg).
        background: background === 'var(--node-bg)'
          ? 'linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0) 30%), var(--node-bg)'
          : background,
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        // Box-shadow only (no outline) so the panel rim is never clipped by
        // upstream overflow:hidden ancestors. Modest blur (8px) keeps GPU
        // composite cost low — wide shadows dominate pan repaints.
        boxShadow:
          '0 2px 8px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.04)',
        // Outer is visible so corner brackets and the slot tag can sit at
        // negative offsets; inner body needs its own overflow handling.
        overflow: 'visible',
        // 'layout paint' limits repaint propagation to this subtree. 'style'
        // is intentionally excluded — would block CSS custom-property
        // inheritance from tokens.css.
        contain: 'layout paint',
        // Promote each mother to its own GPU compositor layer so pan only
        // uploads texture deltas rather than re-rasterising the whole canvas.
        willChange: 'transform',
      }}
    >
      {/* Outset corner brackets — `inset:-8px`, opacity 0.3 base */}
      <div
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

      {/* Slot badge — portal target document.body, position:fixed so it
          escapes `.react-flow`'s overflow:hidden clip. Initial top/left are
          off-screen; the rAF loop above writes the real coords on the next
          paint. Guarded for SSR/non-DOM test envs (no document). */}
      {typeof document !== 'undefined' && createPortal(
        <div
          ref={badgeRef}
          aria-hidden
          style={{
            position: 'fixed',
            top: -9999,
            left: -9999,
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
