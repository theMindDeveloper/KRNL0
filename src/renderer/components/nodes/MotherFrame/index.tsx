// MotherFrame — shared card frame for the 6 fixed mother nodes.
// Replicates the LifeOS Whiteboard.html `.node.fixed` pattern:
//   - badge slot tag (top:-11px, left:14px) with spine-hot-colored slot number
//   - 4 outset corner brackets (inset:-8px, L-shapes)
//   - left/right reorder arrows (visible on hover, disabled at extremes)
// All mothers use this frame; their bodies render as children.

import { useState, type ReactNode } from 'react';

interface Props {
  slotIndex: number;       // 1-based
  slotTotal: number;
  width: number;
  children: ReactNode;
  background?: string;     // override (terminal uses --term-bg)
  borderColor?: string;
  minHeight?: number;      // override — must match INITIAL_DIMS_BY_KIND height
  onMoveLeft?: ((() => void) | undefined);   // undefined = disabled (first slot)
  onMoveRight?: ((() => void) | undefined);  // undefined = disabled (last slot)
}

// PR2 (LifeOS UI refresh) — canonical mother size is 440×440 (a balanced
// square), down from the previous 380×600 portrait. MonthView's 6×7 grid
// uses `flex: 1` rows so it scales cleanly; per-node body re-flows happen
// in PR4-PR7. The mother size MUST stay in sync with INITIAL_DIMS_BY_KIND
// in src/renderer/components/Canvas/rfAdapters.tsx — see ADR 0006.
export const MOTHER_WIDTH = 440;
export const MOTHER_HEIGHT = 440;
export const MOTHER_TOTAL = 6;

export function MotherFrame({
  slotIndex,
  slotTotal,
  width,
  children,
  background = 'var(--node-bg)',
  borderColor = 'var(--paper-3)',
  minHeight = MOTHER_HEIGHT,
  onMoveLeft,
  onMoveRight,
}: Props) {
  const [hovered, setHovered] = useState(false);
  const idx = String(slotIndex).padStart(2, '0');
  const total = String(slotTotal).padStart(2, '0');

  const reorderBtnBase: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    width: 18,
    height: 36,
    background: 'var(--paper)',
    border: '1px solid var(--ink-3)',
    borderRadius: 3,
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
    zIndex: 7,
    color: 'var(--ink-2)',
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    opacity: hovered ? 1 : 0,
    transition: 'opacity 0.15s, background 0.12s',
    padding: 0,
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        width,
        // PR2.1 — pin to a FIXED height matching INITIAL_DIMS_BY_KIND, not
        // minHeight. Previously some mothers (Terminal, Calendar) grew past
        // the floor because their content overflowed, breaking the user's
        // "all the same size" ask. Bodies must overflow internally now.
        height: minHeight,
        display: 'flex',
        flexDirection: 'column',
        background,
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        // Lighter shadow + contain hint reduces compositor work on pan/drag.
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        // Outer is visible so corner brackets and the slot tag can sit at
        // negative offsets; inner body needs its own overflow handling.
        overflow: 'visible',
        contain: 'layout',
      }}
    >
      {/* Left reorder arrow */}
      <button
        type="button"
        aria-label="Move left"
        disabled={!onMoveLeft}
        onClick={onMoveLeft}
        style={{
          ...reorderBtnBase,
          left: -22,
          pointerEvents: !onMoveLeft ? 'none' : undefined,
          opacity: hovered && onMoveLeft ? 1 : 0,
        }}
      >
        ‹
      </button>

      {/* Right reorder arrow */}
      <button
        type="button"
        aria-label="Move right"
        disabled={!onMoveRight}
        onClick={onMoveRight}
        style={{
          ...reorderBtnBase,
          right: -22,
          pointerEvents: !onMoveRight ? 'none' : undefined,
          opacity: hovered && onMoveRight ? 1 : 0,
        }}
      >
        ›
      </button>

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

      {/* Slot badge — ink bg, paper color, spine-hot number */}
      <div
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
          zIndex: 6,
          pointerEvents: 'none',
        }}
      >
        <span style={{ color: 'var(--spine-hot)', marginRight: 1 }}>{idx}</span>
        <span> · spine · {total}</span>
      </div>

      {children}
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
