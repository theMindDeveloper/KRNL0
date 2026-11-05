// #207 — throw away the running session without recording it.
// A small trash icon next to STOP: press and HOLD (0.9 s) — a rust fill grows
// while you hold; letting go early cancels. No second click, no dialog.

import { useEffect, useRef, useState } from 'react';

const HOLD_MS = 900;

export function DiscardButton({ onDiscard }: { onDiscard: () => void }): JSX.Element {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = (): void => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  useEffect(() => cancel, []);
  const start = (): void => {
    setHolding(true);
    timer.current = setTimeout(() => { timer.current = null; setHolding(false); onDiscard(); }, HOLD_MS);
  };
  return (
    <button
      type="button"
      data-testid="pomo-discard"
      aria-label="Hold to discard this session (not saved)"
      title="Hold to discard — nothing is recorded"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !holding) { e.preventDefault(); start(); } }}
      onKeyUp={cancel}
      style={{
        position: 'relative', overflow: 'hidden', flex: '0 0 auto', height: 38, width: 38, padding: 0, borderRadius: 8, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        border: `1px solid ${holding ? 'var(--rust)' : 'var(--paper-3)'}`, background: 'transparent',
        color: holding ? 'var(--rust)' : 'var(--ink-3)',
      }}
    >
      {/* hold progress — a CSS transition, no per-frame JS */}
      <span aria-hidden style={{
        position: 'absolute', left: 0, bottom: 0, width: '100%', height: holding ? '100%' : '0%',
        background: 'color-mix(in srgb, var(--rust) 28%, transparent)',
        transition: holding ? `height ${HOLD_MS}ms linear` : 'height 120ms ease-out',
      }} />
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ position: 'relative' }}>
        <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
      </svg>
    </button>
  );
}
