// MotherFrame — shared card frame for the 6 fixed mother nodes.
// Replicates the LifeOS Whiteboard.html `.node.fixed` pattern:
//   - badge slot tag (top:-11px, left:14px) with spine-hot-colored slot number
//   - 4 outset corner brackets (inset:-8px, L-shapes)
//   - drag-to-reorder: hold and drag horizontally to swap positions
// All mothers use this frame; their bodies render as children.

import { useRef, useState, type ReactNode } from 'react';
import { useReactFlow } from '@xyflow/react';
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
  // Reorder callbacks from CanvasFlow
  onReorderDrop?: ((fromSlotIndex: number, toSlotIndex: number) => void) | undefined;
  onReorderHover?: ((candidateSlotIndex: number) => void) | undefined;
  // Slot x-centers in flow coords (sorted by slot order) for candidate detection.
  slotCentersX?: readonly number[] | undefined;
}

// Wave C (LifeOS UI refresh) — bumped to 500×500 so mothers read as the
// primary canvas anchor against the 220×120 child task cards. Was 440×440;
// pre-PR2 was 380×600 portrait. MUST stay in sync with INITIAL_DIMS_BY_KIND
// in src/renderer/components/Canvas/rfAdapters.tsx and the seed/migration
// positions in src/main/persistence/board.ts — see ADR 0006.
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
  onReorderDrop,
  onReorderHover,
  slotCentersX,
}: Props) {
  const setHoveredNodeId = useBoardStore((s) => s.setHoveredNodeId);
  const idx = String(slotIndex).padStart(2, '0');
  const total = String(slotTotal).padStart(2, '0');

  // Drag state
  const [dragging, setDragging] = useState(false);
  const [dx, setDx] = useState(0);
  const [snapping, setSnapping] = useState(false);
  const pointerStartFlowX = useRef<number>(0);
  const candidateSlotRef = useRef<number>(slotIndex - 1); // 0-based
  const { screenToFlowPosition, getViewport } = useReactFlow();

  // Convert a candidate 0-based slot index from pointer position in flow coords.
  function findCandidateSlot(flowX: number): number {
    if (!slotCentersX || slotCentersX.length === 0) return slotIndex - 1;
    let best = 0;
    let bestDist = Math.abs(flowX - (slotCentersX[0] ?? 0));
    for (let i = 1; i < slotCentersX.length; i++) {
      const dist = Math.abs(flowX - (slotCentersX[i] ?? 0));
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return best;
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Only primary button; avoid firing while dragging inside xterm or inputs.
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'BUTTON' ||
      target.isContentEditable
    ) return;
    if (!onReorderDrop) return;

    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);

    const flowStart = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    pointerStartFlowX.current = flowStart.x;
    candidateSlotRef.current = slotIndex - 1;

    document.body.classList.add('krnl-reordering');
    setDragging(true);
    setSnapping(false);
    setDx(0);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    e.stopPropagation();

    const { zoom } = getViewport();
    const flowCurrent = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const deltaPx = (flowCurrent.x - pointerStartFlowX.current) * zoom;
    setDx(deltaPx);

    // Candidate slot: find nearest slot center to the card's current flow center.
    const cardFlowCenter = flowCurrent.x;
    const candidate = findCandidateSlot(cardFlowCenter);
    if (candidate !== candidateSlotRef.current) {
      candidateSlotRef.current = candidate;
      onReorderHover?.(candidate);
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    e.stopPropagation();
    e.currentTarget.releasePointerCapture(e.pointerId);

    const fromSlot = slotIndex - 1; // 0-based
    const toSlot = candidateSlotRef.current;

    // Animate snap-back before clearing drag state.
    setSnapping(true);
    setDx(0);
    setTimeout(() => {
      setDragging(false);
      setSnapping(false);
      document.body.classList.remove('krnl-reordering');
    }, 200);

    if (fromSlot !== toSlot) {
      onReorderDrop?.(fromSlot, toSlot);
    }
  }

  function onPointerCancel(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
    setSnapping(false);
    setDx(0);
    document.body.classList.remove('krnl-reordering');
  }

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onMouseEnter={() => setHoveredNodeId(nodeId)}
      onMouseLeave={() => setHoveredNodeId(null)}
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
        // Smaller blur radius: wide-blur box-shadows on large nodes are the
        // dominant GPU repaint cost during pan. Dropping 12→8px cuts the fill
        // area the compositor rasterises on every pan frame.
        boxShadow: '0 2px 8px rgba(0,0,0,0.28)',
        // Outer is visible so corner brackets and the slot tag can sit at
        // negative offsets; inner body needs its own overflow handling.
        overflow: 'visible',
        // 'layout paint' limits repaint propagation to this subtree. 'style'
        // is intentionally excluded — it would block CSS custom-property
        // inheritance from tokens.css (var(--node-bg) etc.).
        contain: 'layout paint',
        // Promote each mother to its own GPU compositor layer so pan only
        // uploads texture deltas rather than re-rasterising the whole canvas.
        // Six 500×500 nodes ≈ 6 × ~1 MB VRAM; acceptable for Electron desktop.
        willChange: 'transform',
        // Translate card following pointer during drag. Snap-back uses CSS
        // transition (only active during snapping phase) for 200ms ease.
        transform: dragging || snapping ? `translateX(${dx}px)` : undefined,
        transition: snapping ? 'transform 200ms ease' : undefined,
        cursor: dragging ? 'grabbing' : 'grab',
        zIndex: dragging ? 10 : undefined,
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
