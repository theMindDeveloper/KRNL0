// MotherFrame — shared card frame for the 4 fixed mother nodes.
// Replicates the LifeOS Whiteboard.html `.node.fixed` pattern:
//   - badge slot tag (top:-11px, left:14px) with spine-hot-colored slot number
//   - 4 outset corner brackets (inset:-8px, L-shapes)
// All mothers use this frame; their bodies render as children.

import type { ReactNode } from 'react';

interface Props {
  slotIndex: number;       // 1-based
  slotTotal: number;
  width: number;
  children: ReactNode;
  background?: string;     // override (terminal uses --term-bg)
  borderColor?: string;
}

export const MOTHER_WIDTH = 380;
export const MOTHER_TOTAL = 4;

export function MotherFrame({
  slotIndex,
  slotTotal,
  width,
  children,
  background = 'var(--node-bg)',
  borderColor = 'var(--paper-3)',
}: Props) {
  const idx = String(slotIndex).padStart(2, '0');
  const total = String(slotTotal).padStart(2, '0');

  return (
    <div
      style={{
        position: 'relative',
        width,
        background,
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        boxShadow: '0 14px 28px rgba(0,0,0,0.45)',
        overflow: 'visible',
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
