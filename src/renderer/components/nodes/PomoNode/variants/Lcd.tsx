// TimerLcd — seven-segment look with scanline overlay + ghost digits (PR4 face variant 3).
// Design source: frontendref/LifeOS Whiteboard.html lines 2980-2995 (TimerLcd)
// and the .pomo-lcd CSS rules (lines 2047-2118).
//
// The panel::before scanline is approximated here as a div overlay since React
// inline styles don't support pseudo-elements. The ghost "88:88" sits absolutely
// positioned behind the live digits at 4% opacity.
//
// Blinking LED and colon respect prefers-reduced-motion.

import type { TimerFaceProps } from './types';

export function Lcd({ m, s, running }: TimerFaceProps) {
  const colonAnimation = running ? 'pomo-blink 1s steps(2) infinite' : 'none';
  const ledAnimation = running ? 'pomo-blink 1.4s ease infinite' : 'none';

  return (
    <div
      className="pomo-lcd"
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 10,
      }}
    >
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .pomo-lcd .colon,
          .pomo-lcd .led { animation: none !important; }
        }
      `}</style>

      {/* Panel — dark background with scanline overlay */}
      <div
        className="panel"
        style={{
          background: 'linear-gradient(180deg, #1c1a14 0%, #0c0b08 100%)',
          border: '1px solid #2a241c',
          borderRadius: 8,
          padding: '22px 18px 18px',
          position: 'relative',
          boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.04), inset 0 -2px 6px rgba(0,0,0,0.6)',
          overflow: 'hidden',
        }}
      >
        {/* Scanline overlay (replaces ::before pseudo-element) */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.0) 0, rgba(255,255,255,0.0) 2px, rgba(0,0,0,0.18) 2px, rgba(0,0,0,0.18) 3px)',
            pointerEvents: 'none',
            opacity: 0.7,
            zIndex: 1,
          }}
        />

        {/* Digits block — ghost "88:88" underneath live digits */}
        <div
          className="digits"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 700,
            fontSize: 78,
            letterSpacing: '-0.06em',
            color: 'var(--rust)',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 0.85,
            textAlign: 'center',
            textShadow: '0 0 4px rgba(232, 122, 95, 0.55), 0 0 18px rgba(232, 122, 95, 0.4)',
            position: 'relative',
            zIndex: 2,
          }}
        >
          {/* Ghost digits — absolute overlay at ~4% opacity */}
          <span
            className="ghost"
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              color: 'rgba(255,255,255,0.04)',
              textShadow: 'none',
              pointerEvents: 'none',
            }}
          >
            88<span style={{ color: 'rgba(255,255,255,0.04)' }}>:</span>88
          </span>

          {/* Live time */}
          {m}
          <span
            className="colon"
            style={{
              color: 'var(--acid)',
              animation: colonAnimation,
            }}
          >
            :
          </span>
          {s}
        </div>
      </div>

      {/* Meta row — LED status indicator + cycle label */}
      <div
        className="meta-row"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontFamily: 'var(--font-mono)',
          fontSize: 9.5,
          color: 'var(--ink-3)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          padding: '8px 4px 0',
        }}
      >
        <span>
          <span
            className="led"
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              background: 'var(--rust)',
              borderRadius: '50%',
              marginRight: 6,
              boxShadow: '0 0 8px var(--rust)',
              animation: ledAnimation,
              verticalAlign: '-1px',
            }}
          />
          {running ? 'recording focus' : 'standby'}
        </span>
        <span>25 min cycle</span>
      </div>
    </div>
  );
}
