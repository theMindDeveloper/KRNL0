// TODO (Week 2): full Habit implementation
// State: habits[] { name, completions: Record<dateString, boolean> }
// Commands: add, done, undone
// Derive: streak from completions log

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function HabitNode() {
  return (
    <div
      style={{
        width: 320,
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
        ▙ HABITS
      </div>
      <div style={{ padding: '12px' }}>
        {/* 7-day header */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 8, justifyContent: 'flex-end' }}>
          {DAYS.map((d, i) => (
            <div
              key={i}
              style={{
                width: 28,
                textAlign: 'center',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--ink-3)',
              }}
            >
              {d}
            </div>
          ))}
        </div>
        <div style={{ color: 'var(--ink-3)', fontSize: 12, fontFamily: 'var(--font-body)' }}>
          No habits yet.
        </div>
      </div>
    </div>
  );
}
