// TODO (Week 2): full Pomodoro implementation
// State: currentSession { startedAt, durationMin, label, status } + history[]
// Key rule: persist startedAt, derive countdown from now() - startedAt

export function PomoNode() {
  return (
    <div
      style={{
        width: 240,
        border: 'var(--node-border)',
        borderRadius: 'var(--node-radius)',
        background: 'var(--paper-2)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          borderBottom: 'var(--node-border)',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--ink-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        ▙ POMO
      </div>
      <div style={{ padding: '16px 12px' }}>
        <div
          style={{
            fontSize: 36,
            fontFamily: 'var(--font-mono)',
            color: 'var(--rust)',
            tabularNums: 'tabular-nums',
            letterSpacing: '-0.02em',
          }}
        >
          25:00
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
          SESSION 0 / 4
        </div>
      </div>
    </div>
  );
}
