// Minimal — just the time: big digits, a thin progress line while it runs, and
// one word (READY / FOCUS / PAUSED). The quietest face; it fits any window.

import type { TimerFaceProps } from './types';

export function Minimal({ m, s, elapsedPct, running }: TimerFaceProps) {
  const started = elapsedPct > 0;
  const word = running ? 'Focus' : started ? 'Paused' : 'Ready';
  return (
    <div data-testid="pomo-face-minimal" style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '10px 0 6px' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 48, lineHeight: 1, fontWeight: 300, letterSpacing: '-0.03em', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
        {m}<span style={{ color: running ? 'var(--rust)' : 'var(--ink-3)' }}>:</span>{s}
      </span>
      <span aria-hidden style={{ width: '60%', height: 3, borderRadius: 2, background: 'color-mix(in srgb, var(--ink) 12%, transparent)', overflow: 'hidden', visibility: started ? 'visible' : 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${Math.max(0, Math.min(100, elapsedPct))}%`, background: 'var(--acid)' }} />
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--face-label, 11px)', lineHeight: 1.2, color: running ? 'var(--acid-ink, var(--acid))' : 'var(--ink-3)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{word}</span>
    </div>
  );
}
