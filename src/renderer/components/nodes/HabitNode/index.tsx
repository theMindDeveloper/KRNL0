// TODO (Issue #5): full Habit implementation per Decision #11.
// State: habits[] { id, name, log: YYYY-MM-DD[] (sorted desc), archived }.
// Week grid + streak are derived at render time. ISO Monday-first week.
import type { NodeProps } from '../types';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function HabitNode(_props: NodeProps) {
  return (
    <div
      style={{
        width: 320,
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
        ▙ HABITS
      </div>
      <div style={{ padding: '14px 16px' }}>
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
        <div style={{ color: 'var(--ink-3)', fontSize: 13, fontFamily: 'var(--font-sans)' }}>
          No habits yet.
        </div>
      </div>
    </div>
  );
}
