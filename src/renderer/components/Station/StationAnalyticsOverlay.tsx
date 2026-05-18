/**
 * StationAnalyticsOverlay — floating Analytics panel for station mode.
 *
 * 2026-05-18 (rev 3). Analytics isn't a mother and doesn't fit any of the 6
 * station slots, so we render it as a fixed 540×540 overlay anchored to the
 * top-right of the station shell. The user toggles visibility from the
 * StationToolbar (`analyticsHidden` lives on layoutGeometry.station and
 * defaults to true).
 *
 * If no analytics node exists on the board yet, we auto-spawn one off-canvas
 * the first time the overlay is shown. The node is a normal canvas node
 * (visible in canvas mode too) so its state — pinned cards, ranges, hidden
 * cards — survives across views.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useBoardStore } from '../../store/boardStore';
import { saveBoard } from '../../store/eventLog';
import { AnalyticsNode } from '../nodes/AnalyticsNode';
import { defaultAnalyticsState, defaultAnalyticsConfig } from '../nodes/AnalyticsNode/types';
import { makeCommandHandler } from '../Canvas/commandDispatch';
import { SLOT_DEFAULTS } from './SlotResolver';
import type { StationGeometry } from '../../../shared/types';
import type { Node } from '../../../shared/types/node';

// Overlay sized to match the standard mother box so analytics reads as a
// first-class card alongside the panels behind it. Anchored top-right and
// inset under the toolbar so it doesn't cover the panel-toggle row.
const PANEL_W = 540;
const PANEL_H = 540;

export function StationAnalyticsOverlay() {
  const board = useBoardStore((s) => s.board);
  const addNode = useBoardStore((s) => s.addNode);
  const setLayoutGeometry = useBoardStore((s) => s.setLayoutGeometry);
  const spawnedRef = useRef(false);

  const analyticsNode = useMemo<Node | null>(
    () => board?.nodes.find((n) => n.kind === 'analytics') ?? null,
    [board],
  );

  // First-show auto-spawn: if there's no analytics node yet, drop one in
  // off-screen so the overlay has something to drive commands against.
  // Guarded by a ref so a parent re-render mid-spawn doesn't double-add.
  useEffect(() => {
    if (analyticsNode || spawnedRef.current || !board) return;
    spawnedRef.current = true;
    const newNode: Node = {
      id: `node-analytics-${Date.now()}`,
      kind: 'analytics',
      position: { x: -2000, y: -2000 }, // park off-canvas
      state: defaultAnalyticsState() as unknown as Record<string, unknown>,
      config: defaultAnalyticsConfig() as unknown as Record<string, unknown>,
      isMother: false,
    };
    addNode(newNode);
    const updated = useBoardStore.getState().board;
    if (updated) void saveBoard(updated);
  }, [analyticsNode, board, addNode]);

  const onClose = () => {
    const cur = board?.layoutGeometry?.station;
    const next: StationGeometry = {
      rowFraction: cur?.rowFraction ?? SLOT_DEFAULTS.rowPercent / 100,
      columnFractions: cur?.columnFractions ?? [],
      rightColumnSplit: cur?.rightColumnSplit ?? SLOT_DEFAULTS.bottom.canvas / 100,
      ...(cur?.canvasHidden !== undefined ? { canvasHidden: cur.canvasHidden } : {}),
      analyticsHidden: true,
    };
    setLayoutGeometry({ station: next });
  };

  if (!analyticsNode) {
    return (
      <div data-testid="station-analytics-overlay-spawning" style={overlayStyle()}>
        <CloseButton onClose={onClose} />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--ink-3)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          spawning analytics…
        </div>
      </div>
    );
  }

  const onCommand = makeCommandHandler(analyticsNode.id);

  return (
    <div data-testid="station-analytics-overlay" style={overlayStyle()}>
      <CloseButton onClose={onClose} />
      <div style={{ width: '100%', height: '100%', display: 'flex' }}>
        <AnalyticsNode
          node={analyticsNode as Parameters<typeof AnalyticsNode>[0]['node']}
          selected={false}
          onCommand={onCommand}
          onSelect={() => {}}
        />
      </div>
    </div>
  );
}

function overlayStyle(): React.CSSProperties {
  return {
    position: 'absolute',
    top: 52, // toolbar (32) + a comfortable inset
    right: 16,
    width: PANEL_W,
    height: PANEL_H,
    zIndex: 50,
    boxShadow:
      '0 24px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.5), 0 0 0 2px rgba(201,241,88,0.15)',
    borderRadius: 12,
    overflow: 'hidden',
  };
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      data-testid="station-analytics-overlay-close"
      aria-label="Hide analytics"
      title="Hide analytics (toolbar to show)"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 5,
        width: 24,
        height: 24,
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(20,22,24,0.85)',
        color: '#eef1f4',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 6,
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        lineHeight: 1,
        padding: 0,
      }}
    >
      ×
    </button>
  );
}
