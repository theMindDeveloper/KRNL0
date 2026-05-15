/**
 * StatusBar — 28px chrome bar at the bottom of the canvas.
 *
 * PR3 (LifeOS UI refresh) — expanded from the previous "counts · boardName"
 * + zoom layout to a multi-item status strip mirroring the LifeOS source:
 *
 *   workspace · claude(acid) · pomo(rust) · day  │  nodes · edges · zoom · v
 *
 * Each item subscribes to a primitive selector so Zustand doesn't trigger a
 * cascade on every drag-tick. Zoom comes from RF's internal `useStore`
 * (transform[2]) so it updates live during pan/zoom without writes to the
 * board store.
 *
 * Pomo state reads the mother pomo node's status + session count. The
 * second-by-second MM:SS countdown lives on the Pomo node itself; this
 * strip shows only the high-level state to avoid 1Hz re-renders here.
 */

import { useStore } from '@xyflow/react';
import { useShallow } from 'zustand/react/shallow';
import { useBoardStore } from '../../store/boardStore';

const BOARD_VERSION = 'v0.2.0';

export function StatusBar() {
  // Granular primitive selectors — subscribing to s.board would re-render
  // this row on every drag tick (the board ref churns at 60fps).
  const nodeCount = useBoardStore((s) => s.board?.nodes.length ?? 0);
  const edgeCount = useBoardStore((s) => s.board?.edges.length ?? 0);
  const boardName = useBoardStore(
    (s) => (s.board as { title?: string } | null)?.title ?? 'deep-work'
  );

  // Pomo summary — wrapped in useShallow so the returned object identity is
  // compared field-by-field, not by reference. Only re-renders on state
  // changes (idle/running/paused/break) or session-count bump, not 1Hz tick.
  const { pomoStatus, pomoSessions } = useBoardStore(
    useShallow((s): { pomoStatus: string; pomoSessions: number } => {
      if (!s.board) return { pomoStatus: 'idle', pomoSessions: 0 };
      const pomo = s.board.nodes.find(
        (n) => (n as { kind?: string; isMother?: boolean }).kind === 'pomo'
          && (n as { kind?: string; isMother?: boolean }).isMother === true
      );
      if (!pomo) return { pomoStatus: 'idle', pomoSessions: 0 };
      const state = (pomo as { state?: { status?: string; sessionsCompleted?: number } }).state ?? {};
      return {
        pomoStatus: state.status ?? 'idle',
        pomoSessions: state.sessionsCompleted ?? 0,
      };
    })
  );

  // Read zoom directly from RF's internal transform — live, zero Zustand writes.
  const zoomPct = useStore((s) => Math.round(s.transform[2] * 100));

  // Current day label — read on each render. The bar re-renders frequently
  // enough (zoom changes, node moves) that a separate tick isn't needed.
  const dateStr = new Date()
    .toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
    .toUpperCase();

  const pomoText = `${pomoSessions}/4 · ${pomoStatus}`;

  return (
    <div
      data-testid="statusbar"
      style={{
        height: 28,
        /* Hardcoded dark — --ink flips to light in dark mode, which would
           wash out the bar. The statusbar is always-black by design. */
        background: '#0c0a08',
        borderTop: '1px solid var(--paper-3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 14px',
        gap: 14,
        flexShrink: 0,
        fontFamily: 'var(--font-mono)',
        fontSize: 10.5,
        letterSpacing: '0.04em',
        textTransform: 'uppercase' as const,
        zIndex: 100,
        boxSizing: 'border-box',
      }}
    >
      {/* Left cluster: workspace · claude · pomo · day */}
      <div style={leftRightStyle}>
        <StatusItem label="workspace" testId="statusbar-workspace">
          ~/krnl0/{boardName}
        </StatusItem>
        <StatusItem label="claude" testId="statusbar-claude" valueColor="var(--acid)">
          ● connected
        </StatusItem>
        <StatusItem label="pomo" testId="statusbar-pomo" valueColor="var(--rust)">
          {pomoText}
        </StatusItem>
        <StatusItem label="day" testId="statusbar-day">
          {dateStr}
        </StatusItem>
      </div>

      {/* Right cluster: nodes · edges · zoom · version */}
      <div style={leftRightStyle}>
        <StatusItem label="nodes" testId="statusbar-nodes">
          {nodeCount}
        </StatusItem>
        <StatusItem label="edges" testId="statusbar-edges">
          {edgeCount}
        </StatusItem>
        <StatusItem label="zoom" testId="statusbar-zoom">
          {zoomPct}%
        </StatusItem>
        <StatusItem testId="statusbar-version">{BOARD_VERSION}</StatusItem>
      </div>
    </div>
  );
}

const leftRightStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  minWidth: 0,
  overflow: 'hidden',
};

interface StatusItemProps {
  label?: string;
  children: React.ReactNode;
  valueColor?: string;
  testId?: string;
}

function StatusItem({ label, children, valueColor, testId }: StatusItemProps) {
  return (
    <span
      data-testid={testId}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        whiteSpace: 'nowrap',
      }}
    >
      {label !== undefined && (
        <span style={{ color: 'var(--ink-4)' }}>{label}</span>
      )}
      <span style={{ color: valueColor ?? 'var(--paper-3)' }}>{children}</span>
    </span>
  );
}
