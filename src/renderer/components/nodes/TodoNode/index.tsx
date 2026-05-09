// TODO (Week 2): full Todo implementation.
// State: tasks[] { id, text, tag, done, createdAt }.
// Commands: add, check, uncheck, remove.

export function TodoNode() {
  return (
    <div
      style={{
        width: 300,
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
        ▙ TODOS
      </div>
      <div style={{ padding: '14px 16px' }}>
        <div style={{ color: 'var(--ink-3)', fontSize: 13, fontFamily: 'var(--font-sans)' }}>
          No tasks yet.
        </div>
      </div>
    </div>
  );
}
