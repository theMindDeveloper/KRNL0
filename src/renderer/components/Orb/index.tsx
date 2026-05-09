import { useState, useEffect } from 'react';

type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

export function Orb() {
  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [caption, setCaption] = useState<string | null>(null);

  // Push-to-talk on Space
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && orbState === 'idle') {
        e.preventDefault();
        setOrbState('listening');
        setCaption(null);
        // TODO (Week 5): call boundary.startListening()
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && orbState === 'listening') {
        e.preventDefault();
        setOrbState('thinking');
        setCaption('…');
        // TODO (Week 5): call boundary.stopListening() → transcript → brain.ask() → tts.speak()
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [orbState]);

  const bgColor =
    orbState === 'idle'      ? 'var(--paper-2)' :
    orbState === 'thinking'  ? 'var(--rust)'    :
    /* listening | speaking */ 'var(--acid)';

  const dotColor =
    orbState === 'idle' ? 'var(--acid)' : 'var(--paper)';

  return (
    <>
      {/* Caption above orb */}
      {caption !== null && (
        <div
          style={{
            position: 'fixed',
            bottom: 124,
            left: 22,
            maxWidth: 280,
            background: 'var(--paper-2)',
            border: '1px solid var(--paper-3)',
            borderRadius: 'var(--radius)',
            padding: '6px 12px',
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            color: 'var(--ink)',
          }}
        >
          {caption}
        </div>
      )}

      {/* Orb button — fixed bottom-left per FRONTEND REF */}
      <button
        style={{
          position: 'fixed',
          left: 22,
          bottom: 56,
          width: 'var(--orb-size)',
          height: 'var(--orb-size)',
          borderRadius: '50%',
          border: 'none',
          cursor: 'pointer',
          background: bgColor,
          transition: 'background 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        aria-label={`Voice assistant — ${orbState}. Press Space to talk.`}
        aria-live="polite"
      >
        <span
          style={{
            display: 'block',
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: dotColor,
            transition: 'background 0.2s ease',
          }}
        />
      </button>
    </>
  );
}
