import { useState, useEffect } from 'react';

type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

export function Orb() {
  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [caption, setCaption] = useState<string | null>(null);

  // Push-to-talk on Space — never intercept when user is typing
  useEffect(() => {
    const isTypingTarget = (t: EventTarget | null): boolean => {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable) return true;
      // xterm.js focuses a hidden helper textarea; if focus ever falls back
      // to the body (timing race with RF), check the active element too.
      const active = document.activeElement as HTMLElement | null;
      if (active?.closest('.term-body') || active?.closest('.xterm')) return true;
      return false;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.code === 'Space' && orbState === 'idle') {
        e.preventDefault();
        setOrbState('listening');
        setCaption(null);
        // TODO (Week 5): call boundary.startListening()
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
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

  // Orb visual state
  const bgColor =
    orbState === 'idle'      ? 'var(--paper-2)'  :
    orbState === 'thinking'  ? 'var(--rust)'      :
    /* listening | speaking */ 'var(--acid)';

  const orbFilter =
    orbState === 'idle'
      ? 'drop-shadow(0 0 18px rgba(201,241,88,.55))'
      : orbState === 'listening'
        ? 'drop-shadow(0 0 28px rgba(201,241,88,1))'
        : orbState === 'thinking'
          ? 'drop-shadow(0 0 24px rgba(180,140,240,.9))'
          : /* speaking */ 'drop-shadow(0 0 18px rgba(201,241,88,.7))';

  const orbAnimation =
    orbState === 'idle' ? 'ai-float 6s ease infinite' : 'none';

  const dotColor =
    orbState === 'idle' ? 'var(--acid)' : 'var(--paper)';

  const showRings = orbState === 'listening' || orbState === 'speaking';

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
      <div
        style={{
          position: 'fixed',
          left: 22,
          bottom: 56,
          width: 'var(--orb-size)',
          height: 'var(--orb-size)',
        }}
      >
        {/* Pulse rings — visible when listening or speaking */}
        {showRings && (
          <>
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                border: '1.5px solid var(--acid)',
                borderRadius: '50%',
                animation: 'ai-ring 1.6s ease-out infinite',
                pointerEvents: 'none',
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                border: '1.5px solid var(--acid)',
                borderRadius: '50%',
                animation: 'ai-ring 1.6s ease-out infinite',
                animationDelay: '0.5s',
                pointerEvents: 'none',
              }}
            />
          </>
        )}

        {/* Main orb circle */}
        <button
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            border: 'none',
            cursor: 'pointer',
            background: bgColor,
            filter: orbFilter,
            animation: orbAnimation,
            transition: 'background 0.2s ease, filter 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label={`Voice assistant — ${orbState}. Press Space to talk.`}
          aria-live="polite"
        >
          {/* Center dot */}
          <span
            style={{
              display: 'block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: dotColor,
              transition: 'background 0.2s ease',
            }}
          />
        </button>
      </div>
    </>
  );
}
