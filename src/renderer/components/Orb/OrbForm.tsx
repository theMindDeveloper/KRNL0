import { useState, type FormEvent } from 'react';
import { useOrbStore } from '../../store/useOrbStore';

export function OrbForm() {
  const [input, setInput] = useState('');
  const addMessage = useOrbStore((s) => s.addMessage);
  const micActive = useOrbStore((s) => s.micActive);
  const setMicActive = useOrbStore((s) => s.setMicActive);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    addMessage({ role: 'user', content: text, timestamp: Date.now() });
    setInput('');
    // TODO Week 5: dispatch text as sys command / AI call
    console.log('[orb] form submitted:', text);
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '10px 12px',
        borderTop: '1px solid rgba(201, 241, 88, 0.15)',
        background: 'rgba(0, 0, 0, 0.2)',
      }}
    >
      <span style={{ color: 'var(--acid)', fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: 12 }}>›</span>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Ask or command…"
        style={{
          flex: 1,
          background: 'transparent',
          border: 0,
          outline: 0,
          color: 'var(--ink)',
          fontFamily: 'var(--font-mono)',
          fontSize: 12.5,
          padding: '4px 0',
        }}
      />
      <button
        type="button"
        onClick={() => setMicActive(!micActive)}
        style={{
          background: micActive ? 'var(--acid)' : 'rgba(201, 241, 88, 0.08)',
          border: `1px solid ${micActive ? 'var(--acid)' : 'rgba(201, 241, 88, 0.2)'}`,
          color: micActive ? 'var(--paper)' : 'var(--acid)',
          width: 26,
          height: 26,
          borderRadius: '50%',
          cursor: 'pointer',
          fontSize: 12,
          display: 'grid',
          placeItems: 'center',
          boxShadow: micActive ? '0 0 12px var(--acid)' : 'none',
          transition: 'all 0.15s',
          flexShrink: 0,
        }}
        aria-label={micActive ? 'Stop mic' : 'Start mic'}
      >
        🎤
      </button>
      <button
        type="submit"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--acid)',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          cursor: 'pointer',
          padding: '2px 6px',
          borderRadius: 3,
          display: input.trim() ? 'block' : 'none',
        }}
      >
        ↵
      </button>
    </form>
  );
}
