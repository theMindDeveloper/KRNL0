// TimerRing — radial SVG ring + double-layer drain clock (PR4 face variant 1).
// Design source: frontendref/LifeOS Whiteboard.html lines 2939-2957 (TimerRing)
// and the .pomo-ring-wrap / .pomo-clock / .pomo-clock-inner CSS rules.
//
// The fill layer uses a CSS mask-image driven by --fill, creating a liquid-fill
// wipe from the bottom as elapsed time increases.
// The colon testids (pomo-clock, pomo-colon) must stay here because Ring is the
// default face — the existing A4 test asserts on both testids without setting
// a face on the node config.

import type { TimerFaceProps } from './types';

const R = 92;
const C = 2 * Math.PI * R;

export function Ring({ m, s, elapsedPct, remainingPct, running }: TimerFaceProps) {
  const dashOffset = C * (1 - remainingPct / 100);
  const colonAnimation = running ? 'pomo-blink 1s steps(2) infinite' : 'none';

  return (
    <div
      className="pomo-ring-wrap"
      style={{
        position: 'relative',
        width: 220,
        height: 220,
        display: 'grid',
        placeItems: 'center',
        margin: '4px 0',
      }}
    >
      <svg
        className="pomo-ring"
        viewBox="0 0 200 200"
        style={{
          position: 'absolute',
          inset: 0,
          transform: 'rotate(-90deg)',
          pointerEvents: 'none',
          width: '100%',
          height: '100%',
        }}
      >
        <circle
          className="track"
          cx="100"
          cy="100"
          r={R}
          fill="none"
          strokeWidth="3"
          stroke="var(--paper-3)"
        />
        <circle
          className="progress"
          cx="100"
          cy="100"
          r={R}
          fill="none"
          strokeWidth="3"
          stroke="var(--rust)"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={dashOffset}
          style={{
            transition: 'stroke-dashoffset 0.6s linear',
            filter: 'drop-shadow(0 0 4px rgba(200,85,61,0.4))',
          }}
        />
      </svg>

      <div className="pomo-clock-inner" style={{ position: 'relative', zIndex: 1 }}>
        <div
          className="pomo-clock"
          data-testid="pomo-clock"
          style={{
            position: 'relative',
            fontFamily: 'var(--font-mono)',
            fontSize: 64,
            fontWeight: 300,
            color: 'var(--ink-4)',
            letterSpacing: '-0.04em',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
            display: 'inline-block',
            margin: '4px 0 2px',
            isolation: 'isolate',
            // CSS custom property for the liquid fill level
            ['--fill' as string]: `${elapsedPct}%`,
          }}
        >
          {/* Base layer — faint ink color */}
          <span
            className="layer base"
            style={{ display: 'inline-block' }}
          >
            {m}
            <span
              className="colon"
              data-testid="pomo-colon"
              data-running={running}
              style={{
                color: 'var(--rust)',
                animation: colonAnimation,
              }}
            >
              :
            </span>
            {s}
          </span>

          {/* Fill layer — masked from bottom, acid green liquid wipe */}
          <span
            className="layer fill"
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'inline-block',
              color: 'var(--spine-hot)',
              pointerEvents: 'none',
              WebkitMaskImage: `linear-gradient(to top, #000 0%, #000 ${elapsedPct}%, transparent calc(${elapsedPct}% + 0.4%))`,
              maskImage: `linear-gradient(to top, #000 0%, #000 ${elapsedPct}%, transparent calc(${elapsedPct}% + 0.4%))`,
              textShadow: '0 0 14px rgba(126, 162, 43, 0.55), 0 0 4px rgba(201, 241, 88, 0.45)',
              transition: 'mask-image 0.6s linear, -webkit-mask-image 0.6s linear',
            }}
          >
            {m}<span style={{ color: 'inherit', animation: 'none' }}>:</span>{s}
          </span>

          {/* Meniscus pseudo-element equivalent — rendered as a positioned div */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: '-4%',
              right: '-4%',
              height: 2,
              bottom: `${elapsedPct}%`,
              background: 'linear-gradient(to right, transparent 0%, rgba(201,241,88,0.0) 4%, var(--acid) 30%, var(--acid-glow) 50%, var(--acid) 70%, rgba(201,241,88,0.0) 96%, transparent 100%)',
              filter: 'drop-shadow(0 0 6px var(--acid))',
              pointerEvents: 'none',
              opacity: 0.9,
              transform: 'translateY(50%)',
              transition: 'bottom 0.6s linear',
            }}
          />
        </div>
      </div>
    </div>
  );
}
