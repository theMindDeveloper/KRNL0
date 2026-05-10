import { useBoardStore } from '../../store/boardStore';
import type { PomoStatus } from '../nodes/PomoNode/types';

function dotColor(status: PomoStatus): string {
  if (status === 'running') return 'var(--rust)';
  if (status === 'break') return 'var(--acid-glow)';
  // idle | done
  return 'var(--ink-4)';
}

function statusLabel(status: PomoStatus): string {
  if (status === 'running') return 'RUNNING';
  if (status === 'break') return 'BREAK';
  // idle | done
  return 'IDLE';
}

export function StatusBar() {
  const board = useBoardStore((s) => s.board);
  const nodes = board?.nodes ?? [];
  const pomoNode = nodes.find((n) => n.kind === 'pomo');
  // Safe cast: we only read status, which is always present on a pomo node
  const pomoStatus: PomoStatus =
    (pomoNode?.state as { status?: PomoStatus } | undefined)?.status ?? 'idle';

  const dot = dotColor(pomoStatus);
  const label = statusLabel(pomoStatus);

  return (
    <div
      style={{
        height: 28,
        background: 'var(--paper-2)',
        borderTop: '1px solid var(--paper-3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 14px',
        flexShrink: 0,
        fontFamily: 'var(--font-mono)',
        fontSize: 10.5,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        zIndex: 100,
      }}
    >
      {/* Pomo state */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: dot, fontSize: 8 }}>●</span>
        <span style={{ color: 'var(--ink-3)' }}>POMO · {label}</span>
      </div>

      {/* Connection indicator */}
      <span style={{ color: 'var(--ink-4)' }}>◉ CONNECTED</span>
    </div>
  );
}
