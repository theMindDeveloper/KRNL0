// #207 — throw away the session that is running, without recording it.
// A small trash icon next to STOP; first click arms it ("Discard?"), the
// second within 3 s does it. Out of the way, hard to hit by accident.

import { useEffect, useState } from 'react';

export function DiscardButton({ onDiscard }: { onDiscard: () => void }): JSX.Element {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(id);
  }, [armed]);
  return (
    <button
      type="button"
      data-testid="pomo-discard"
      aria-label={armed ? 'Click again to discard this session' : 'Discard this session (not saved)'}
      title={armed ? 'Click again to discard — nothing is recorded' : "Discard — don't save this session"}
      onClick={() => { if (armed) { setArmed(false); onDiscard(); } else setArmed(true); }}
      style={{
        flex: '0 0 auto', height: 38, minWidth: 38, padding: armed ? '0 10px' : 0, borderRadius: 8, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        border: `1px solid ${armed ? 'var(--rust)' : 'var(--paper-3)'}`,
        background: armed ? 'color-mix(in srgb, var(--rust) 14%, transparent)' : 'transparent',
        color: armed ? 'var(--rust)' : 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
      </svg>
      {armed && 'DISCARD?'}
    </button>
  );
}
