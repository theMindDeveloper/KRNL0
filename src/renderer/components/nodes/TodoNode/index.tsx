// TODO (Week 2): full Todo implementation
// State: tasks[] { id, text, tag, done, createdAt }
// Commands: add, check, uncheck, remove

export function TodoNode() {
  return (
    <div
      style={{
        width: 280,
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
        ▙ TODOS
      </div>
      <div style={{ padding: '12px' }}>
        <div style={{ color: 'var(--ink-3)', fontSize: 12, fontFamily: 'var(--font-body)' }}>
          No tasks yet.
        </div>
      </div>
    </div>
  );
}
