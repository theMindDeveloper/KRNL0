import { useOrbStore } from '../../store/useOrbStore';

export function OrbHistory() {
  const messages = useOrbStore((s) => s.messages);

  if (messages.length === 0) {
    return (
      <div style={{ padding: '14px', fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>
        <div style={{ fontSize: 14, color: 'var(--ink)', marginBottom: 12, fontFamily: 'var(--font-sans)' }}>
          Hey — I'm krnl.
        </div>
        <div style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
          Ask me anything, or pick a suggestion below.
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        fontSize: 12.5,
        color: 'var(--ink-2)',
        minHeight: 80,
        maxHeight: 340,
        fontFamily: 'var(--font-mono)',
      }}
    >
      {messages.map((msg, i) => (
        <div
          key={i}
          style={{
            lineHeight: 1.5,
            color: msg.role === 'user' ? 'var(--ink-3)' : 'var(--ink)',
            textAlign: msg.role === 'user' ? 'right' : 'left',
          }}
        >
          {msg.content}
        </div>
      ))}
    </div>
  );
}
