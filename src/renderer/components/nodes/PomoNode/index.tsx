// TODO (Issue #3): full Pomodoro implementation per Decision #9.
// State: currentSession { startedAt, durationMin, label, status } + history[].
// Persistence rule: save startedAt; derive countdown from now() - startedAt.
import type { NodeProps } from '../types';

export function PomoNode(_props: NodeProps) {
  return (
    <div
      style={{
        width: 240,
        border: '1px solid var(--paper-3)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--node-bg)',
        boxShadow: 'var(--shadow-1)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '7px 10px 6px',
          borderBottom: '1px solid var(--paper-3)',
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          color: 'var(--ink-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        ▙ POMO
      </div>
      <div style={{ padding: '14px 16px' }}>
        <div
          style={{
            fontSize: 64,
            fontFamily: 'var(--font-mono)',
            fontWeight: 300,
            color: 'var(--rust)',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.02em',
          }}
        >
          25:00
        </div>
        <div
          style={{
            fontSize: 10.5,
            color: 'var(--ink-3)',
            marginTop: 4,
            fontFamily: 'var(--font-mono)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          SESSION 0 / 4
        </div>
      </div>
    </div>
  );
}
