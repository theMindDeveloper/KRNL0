// TimerAscii — terminal-style block-bar timer (PR4 face variant 2).
// Design source: frontendref/LifeOS Whiteboard.html lines 2960-2977 (TimerAscii)
// and the .pomo-ascii-frame CSS rules.
//
// Renders in the --term-bg dark panel with acid-green filled blocks and
// a blinking colon. Respects prefers-reduced-motion for the colon blink.

import type { TimerFaceProps } from './types';

const BAR_LENGTH = 24;

export function Ascii({ m, s, elapsedPct, remainingPct, running }: TimerFaceProps) {
  const filled = Math.round((remainingPct / 100) * BAR_LENGTH);
  const colonAnimation = running ? 'pomo-blink 1s steps(2) infinite' : 'none';

  return (
    <div
      className="pomo-ascii-frame"
      style={{
        width: '100%',
        background: 'var(--term-bg)',
        color: 'var(--term-fg)',
        border: '1px solid #2a241c',
        borderRadius: 6,
        padding: '14px 14px 12px',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        lineHeight: 1.55,
        position: 'relative',
        boxShadow: 'inset 0 0 24px rgba(0,0,0,0.45)',
      }}
    >
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .pomo-ascii-frame .colon { animation: none !important; }
        }
      `}</style>

      <div
        className="head"
        style={{
          color: 'var(--term-dim)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          fontSize: 9.5,
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <span>krnl0 · pomodoro</span>
        <span
          className="live"
          style={{ color: running ? 'var(--term-acid)' : 'var(--term-dim)' }}
        >
          {running ? '● LIVE' : '○ HALT'}
        </span>
      </div>

      <div
        className="big"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 38,
          fontWeight: 600,
          letterSpacing: '-0.03em',
          color: 'var(--term-acid)',
          fontVariantNumeric: 'tabular-nums',
          textShadow: '0 0 12px rgba(201,241,88,0.45)',
          lineHeight: 1,
          margin: '4px 0 8px',
        }}
      >
        {m}
        <span
          className="colon"
          style={{
            color: 'var(--term-rust)',
            animation: colonAnimation,
          }}
        >
          :
        </span>
        {s}
      </div>

      <div
        className="bar"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          letterSpacing: '0.06em',
          color: 'var(--term-acid)',
          whiteSpace: 'pre',
        }}
      >
        [
        <span style={{ color: 'var(--term-acid)' }}>{'█'.repeat(filled)}</span>
        <span className="empty" style={{ color: 'var(--term-dim)' }}>
          {'░'.repeat(BAR_LENGTH - filled)}
        </span>
        ]
      </div>

      <div
        className="legend"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 6,
          fontSize: 9.5,
          color: 'var(--term-dim)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        <span>{Math.round(elapsedPct)}% elapsed</span>
        <span className="pct" style={{ color: 'var(--term-rust)' }}>
          {Math.round(remainingPct)}% left
        </span>
      </div>
    </div>
  );
}
