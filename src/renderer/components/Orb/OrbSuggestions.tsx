import { useOrbStore } from '../../store/useOrbStore';

export function OrbSuggestions() {
  const suggestions = useOrbStore((s) => s.suggestions);
  const addMessage = useOrbStore((s) => s.addMessage);

  const handleSuggestion = (text: string) => {
    addMessage({ role: 'user', content: text, timestamp: Date.now() });
    // TODO Week 5: dispatch to AI brain
    console.log('[orb] suggestion submitted:', text);
  };

  return (
    <div style={{ padding: '0 14px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {suggestions.map((s, i) => (
        <button
          key={i}
          type="button"
          onClick={() => handleSuggestion(s)}
          style={{
            background: 'rgba(201, 241, 88, 0.06)',
            border: '1px solid rgba(201, 241, 88, 0.15)',
            color: 'var(--ink-2)',
            textAlign: 'left',
            padding: '8px 10px',
            borderRadius: 6,
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
            fontSize: 11.5,
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(201, 241, 88, 0.12)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(201, 241, 88, 0.4)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(201, 241, 88, 0.06)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(201, 241, 88, 0.15)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink-2)';
          }}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
