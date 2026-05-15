// TimerBlocks — 25 vertical bars, one per elapsed minute (PR4 face variant 4).
// Design source: frontendref/LifeOS Whiteboard.html lines 2998-3016 (TimerBlocks)
// and the .pomo-blocks CSS rules (lines 2121-2172).
//
// Bar states:
//   past (i < minsElapsed): rust-colored, tall (95% height)
//   current (i === minsElapsed): acid-colored, tallest (100%), blinking
//   future (i > minsElapsed): ink-4, short (22% height)
//
// The current bar's blink animation respects prefers-reduced-motion.

import type { TimerFaceProps } from './types';

const TOTAL_BARS = 25;

export function Blocks({ m, s, elapsedPct }: TimerFaceProps) {
  const minsElapsed = Math.floor((elapsedPct / 100) * TOTAL_BARS);

  return (
    <div
      className="pomo-blocks"
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 12,
      }}
    >
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .pomo-blocks .stack span.now { animation: none !important; }
        }
      `}</style>

      {/* Bar stack */}
      <div
        className="stack"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(25, 1fr)',
          gap: 2,
          height: 110,
          alignItems: 'end',
          padding: 6,
          background: 'var(--paper-2)',
          border: '1px solid var(--paper-3)',
          borderRadius: 4,
        }}
      >
        {Array.from({ length: TOTAL_BARS }, (_, i) => {
          const isPast = i < minsElapsed;
          const isNow = i === minsElapsed;

          let barStyle: React.CSSProperties;
          if (isPast) {
            barStyle = {
              display: 'block',
              background: 'var(--rust)',
              borderRadius: 1,
              height: '95%',
              transition: 'background 0.2s, height 0.4s ease',
            };
          } else if (isNow) {
            barStyle = {
              display: 'block',
              background: 'var(--acid)',
              borderRadius: 1,
              height: '100%',
              boxShadow: '0 0 10px var(--acid)',
              animation: 'pomo-blink 1.4s ease infinite',
              transition: 'background 0.2s, height 0.4s ease',
            };
          } else {
            barStyle = {
              display: 'block',
              background: 'var(--ink-4)',
              borderRadius: 1,
              height: '22%',
              transition: 'background 0.2s, height 0.4s ease',
            };
          }

          return (
            <span
              key={i}
              className={isNow ? 'now' : isPast ? 'on' : ''}
              style={barStyle}
            />
          );
        })}
      </div>

      {/* Read-out: time + minute counter */}
      <div
        className="read"
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 12,
          fontFamily: 'var(--font-mono)',
        }}
      >
        <span
          className="num"
          style={{
            fontSize: 32,
            letterSpacing: '-0.03em',
            color: 'var(--ink)',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
          }}
        >
          {m}
          <span
            className="colon"
            style={{
              color: 'var(--rust)',
            }}
          >
            :
          </span>
          {s}
        </span>
        <span
          className="label"
          style={{
            marginLeft: 'auto',
            fontSize: 9.5,
            color: 'var(--ink-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          min {minsElapsed + 1} / {TOTAL_BARS}
        </span>
      </div>
    </div>
  );
}
