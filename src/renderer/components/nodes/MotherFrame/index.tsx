// MotherFrame — shared card frame for the 6 fixed mother nodes.
// Replicates the LifeOS Whiteboard.html `.node.fixed` pattern:
//   - badge slot tag (top:-11px, left:14px) with spine-hot-colored slot number
//   - 4 outset corner brackets (inset:-8px, L-shapes)
//
// Slot badge clipping note (2026-05-15): the badge needs to overhang the
// panel's top edge per the LifeOS design, but `.react-flow` has
// `overflow:hidden` to clip nodes during pan/zoom. The fix is to portal the
// badge into `document.body` with `position:fixed` so it escapes the canvas's
// clip context entirely. Position is tracked via the shared rafBatcher —
// all 6 badge reads happen in one batch before any writes, eliminating the
// layout-thrashing (11 forced layout flushes → 1 per frame) that caused
// pan stutter after PR #123.

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useBoardStore } from '../../../store/boardStore';
import { scheduleBatch } from '../../../utils/rafBatcher';

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

  // Shared rAF batch: read BCR for this badge in the global read pass, write
  // style.left/top in the global write pass. All 6 mothers share one rAF tick
  // so reads happen before any write — one layout flush per frame instead of 6.
  useLayoutEffect(() => {
    let cachedL = NaN;
    let cachedT = NaN;
    let liveL = NaN;
    let liveT = NaN;

    return scheduleBatch({
      read() {
        const root = rootRef.current;
        if (!root) return;
        const r = root.getBoundingClientRect();
        liveL = Math.round(r.left + 14);
        liveT = Math.round(r.top - 11);
      },
      write() {
        const badge = badgeRef.current;
        if (!badge) return;
        if (liveL !== cachedL) { badge.style.left = `${liveL}px`; cachedL = liveL; }
        if (liveT !== cachedT) { badge.style.top = `${liveT}px`; cachedT = liveT; }
      },
    });
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
        // willChange:'transform' removed — promoting 6 compositor layers
        // costs VRAM with no pan benefit (RF transforms the viewport wrapper,
        // not per-node elements, during pan). Swap animation still works via
        // the CSS transition on .react-flow__node.krnl-mother.
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
          off-screen; the shared rafBatcher writes real coords on next paint.
          Guarded for SSR/non-DOM test envs (no document). */}
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
