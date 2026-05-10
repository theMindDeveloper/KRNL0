/**
 * StatusBar — 28px chrome bar at bottom.
 * Requirement F5: "{n} node(s) · {m} edge(s) · {boardName}" + zoom level.
 *
 * Zoom comes from RF's internal useStore (transform[2]) — not boardStore —
 * so it updates live during pan/zoom without triggering a Zustand cascade.
 */

import { useStore } from '@xyflow/react';
import { useBoardStore } from '../../store/boardStore';

function pluralize(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : singular + 's'}`;
}

export function StatusBar() {
  // Granular selectors — subscribing to s.board would re-render this row on
  // every drag tick (board ref churns 60fps). Selecting primitives means
  // Zustand only triggers a re-render when the actual count/name changes.
  const nodeCount = useBoardStore((s) => s.board?.nodes.length ?? 0);
  const edgeCount = useBoardStore((s) => s.board?.edges.length ?? 0);
  const boardName = useBoardStore(
    (s) => (s.board as { title?: string } | null)?.title ?? 'deep-work'
  );
  // Read zoom directly from RF's internal transform — live, zero Zustand writes.
  const zoomPct = useStore((s) => Math.round(s.transform[2] * 100));

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
