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

import { LineGlyph } from '../ui/LineGlyph';
import { useStore } from '@xyflow/react';
import { useShallow } from 'zustand/react/shallow';
import { useBoardStore } from '../../store/boardStore';
import { Z } from '../ui/layers';
import { primaryUpdateAction, useUpdateStore } from '../../store/updateStore';

// Injected from package.json at build time (electron.vite.config.ts).
const BOARD_VERSION = `v${typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'}`;

interface StatusBarProps {
  /** ADR 0008 § 9.5 — shown when station mode falls back to canvas due to narrow viewport. */
  fallbackNotice?: boolean;
}

export function StatusBar({ fallbackNotice = false }: StatusBarProps) {
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
  const { pomoStatus, pomoSessions, pomoEvery } = useBoardStore(
    useShallow((s): { pomoStatus: string; pomoSessions: number; pomoEvery: number } => {
      if (!s.board) return { pomoStatus: 'idle', pomoSessions: 0, pomoEvery: 4 };
      const pomo = s.board.nodes.find(
        (n) => (n as { kind?: string; isMother?: boolean }).kind === 'pomo'
          && (n as { kind?: string; isMother?: boolean }).isMother === true
      );
      if (!pomo) return { pomoStatus: 'idle', pomoSessions: 0, pomoEvery: 4 };
      const state = (pomo as { state?: { status?: string; sessionsCompleted?: number } }).state ?? {};
      // Sessions until the long break: the Pomo's own setting, not always 4.
      const every = (pomo as { config?: { longBreakEvery?: number } }).config?.longBreakEvery;
      return {
        pomoStatus: state.status ?? 'idle',
        pomoSessions: state.sessionsCompleted ?? 0,
        pomoEvery: typeof every === 'number' && every > 0 ? every : 4,
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

  const pomoText = `${pomoSessions}/${pomoEvery} · ${pomoStatus}`;

  return (
    <div
      data-testid="statusbar"
      style={{
        height: 28,
        /* Hardcoded dark — --ink flips to light in dark mode, which would
           wash out the bar. The statusbar is always-black by design. */
        background: 'var(--k-status-bg, #0c0a08)',
        borderTop: '1px solid var(--k-status-line, var(--paper-3))',
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
        zIndex: Z.chrome,
        boxSizing: 'border-box',
      }}
    >
      {/* Left cluster: workspace · claude · pomo · day */}
      <div style={leftRightStyle}>
        <StatusItem label="workspace" testId="statusbar-workspace">
          ~/krnl0/{boardName}
        </StatusItem>
        <StatusItem label="claude" testId="statusbar-claude" valueColor="var(--k-status-ok, var(--accent-on-dark))">
          <LineGlyph name="dot" size={9} /> connected
        </StatusItem>
        <StatusItem label="pomo" testId="statusbar-pomo" valueColor="var(--k-status-warn, var(--rust))">
          {pomoText}
        </StatusItem>
        <StatusItem label="day" testId="statusbar-day">
          {dateStr}
        </StatusItem>
        {fallbackNotice && (
          <span
            data-testid="statusbar-station-fallback"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              color: 'var(--k-status-label, #8a8270)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase' as const,
              whiteSpace: 'nowrap' as const,
            }}
          >
            Station mode requires ≥ 1024 × 640 — falling back to canvas.
          </span>
        )}
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
        <VersionItem />
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
        <span style={{ color: 'var(--k-status-label, #8a8270)' }}>{label}</span>
      )}
      <span style={{ color: valueColor ?? 'var(--k-status-value, #d9d1b8)' }}>{children}</span>
    </span>
  );
}

/**
 * Version, plus the update state when there is one (Decision 36, F4):
 * `v0.10.0` · `v0.10.0 · ↓ 42%` · `v0.10.0 → 0.11.0` (clickable: restart or download).
 */
function VersionItem() {
  const state = useUpdateStore((s) => s.state);
  const action = primaryUpdateAction(state);
  if (state?.status === 'downloading') {
    return (
      <StatusItem testId="statusbar-version">
        <span title={`Downloading KRNL0 ${state.latestVersion ?? ''} in the background`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          ↓ {state.latestVersion}
          <span aria-hidden style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--paper-3)', overflow: 'hidden', display: 'inline-block' }}>
            <span style={{ display: 'block', height: '100%', width: `${Math.round(state.percent ?? 0)}%`, background: 'var(--acid)', borderRadius: 2 }} />
          </span>
          {Math.round(state.percent ?? 0)}% · {BOARD_VERSION}
        </span>
      </StatusItem>
    );
  }
  if (state && action) {
    return (
      <button
        type="button"
        data-testid="statusbar-version"
        title={action.title}
        onClick={() => { void action.run(); }}
        style={{
          all: 'unset', cursor: 'pointer', whiteSpace: 'nowrap',
          color: 'var(--k-status-ok, var(--accent-on-dark))',
        }}
      >
        {BOARD_VERSION} → {state.latestVersion}
      </button>
    );
  }
  return <StatusItem testId="statusbar-version">{BOARD_VERSION}</StatusItem>;
}
