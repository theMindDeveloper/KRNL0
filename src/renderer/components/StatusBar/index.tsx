/**
 * StatusBar — 28px chrome bar at bottom.
 * Requirement F5: "{n} node(s) · {m} edge(s) · {boardName}" + zoom level.
 */

import { useReactFlow } from '@xyflow/react';
import { useBoardStore } from '../../store/boardStore';

function pluralize(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : singular + 's'}`;
}

export function StatusBar() {
  const board = useBoardStore((s) => s.board);
  const viewport = useBoardStore((s) => s.viewport);
  const rf = useReactFlow();

  const nodeCount = board?.nodes.length ?? 0;
  const edgeCount = board?.edges.length ?? 0;
  // board.title does not exist in v1 — fall back to the constant per scope refinements.
  const boardName = (board as { title?: string } | null)?.title ?? 'deep-work';

  // Prefer RF's live zoom when available; fall back to store viewport.
  let zoomPct: number;
  try {
    const { zoom } = rf.getViewport();
    zoomPct = Math.round(zoom * 100);
  } catch {
    zoomPct = Math.round(viewport.zoom * 100);
  }

  const nodeStr = pluralize(nodeCount, 'node');
  const edgeStr = pluralize(edgeCount, 'edge');

  return (
    <div
      data-testid="statusbar"
      style={{
        height: 28,
        background: 'var(--ink)',
        borderTop: '1px solid var(--paper-3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 14px',
        flexShrink: 0,
        fontFamily: 'var(--font-mono)',
        fontSize: 10.5,
        letterSpacing: '0.04em',
        textTransform: 'uppercase' as const,
        zIndex: 100,
        boxSizing: 'border-box',
      }}
    >
      {/* Counts + board name */}
      <span
        data-testid="statusbar-counts"
        style={{ color: 'var(--paper-2)' }}
      >
        {nodeStr} · {edgeStr} · {boardName}
      </span>

      {/* Zoom level */}
      <span
        data-testid="statusbar-zoom"
        style={{ color: 'var(--paper-3)' }}
      >
        {zoomPct}%
      </span>
    </div>
  );
}
