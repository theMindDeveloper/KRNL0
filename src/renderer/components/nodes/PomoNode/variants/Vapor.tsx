// TimerVapor — vertical glass-tube pill with acid liquid draining (PR4 face variant 5).
// Design source: frontendref/LifeOS Whiteboard.html lines 3019-3049 (TimerVapor)
// and the .pomo-vapor CSS rules (lines 2175-2270).
//
// Extracted from the existing PomoNode body (was the sole default face before PR4).
// Bubbles rise via the vapor-rise keyframe defined in tokens.css.
// Respects prefers-reduced-motion: bubbles are paused when motion is reduced.

import { useMemo } from 'react';
import type { TimerFaceProps } from './types';

interface BubbleConfig {
  left: number;
  animationDuration: string;
  animationDelay: string;
}

export function Vapor({ m, s, remainingPct }: TimerFaceProps) {
  // F2 — bubble positions are stable across renders (useMemo with no deps).
  const bubbles: BubbleConfig[] = useMemo(
    () =>
      [0, 1, 2, 3].map((i) => ({
        left: 8 + i * 14,
        animationDuration: `${3.2 + (i % 2) * 1.4}s`,
        animationDelay: `${i * 0.7}s`,
      })),
    [],
  );

  return (
    <div
      className="pomo-vapor"
      style={{
        width: '100%',
        display: 'flex',
        gap: 14,
        alignItems: 'stretch',
        minHeight: 200,
      }}
    >
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .pomo-vapor .pomo-bubble { animation-play-state: paused !important; }
        }
      `}</style>

      {/* Glass tube */}
      <div
        className="tube"
        style={{
          position: 'relative',
          width: 64,
          flexShrink: 0,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.04), rgba(0,0,0,0.12))',
          border: '1.5px solid var(--ink-3)',
          borderRadius: 32,
          overflow: 'hidden',
          boxShadow: 'inset 2px 0 0 rgba(255,255,255,0.04), inset -2px 0 0 rgba(0,0,0,0.12)',
        }}
      >
        {/* Liquid fill — rises from the bottom, height = remainingPct */}
        <div
          className="liquid"
          data-testid="pomo-liquid"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: `${remainingPct}%`,
            background: 'linear-gradient(180deg, var(--acid-glow) 0%, var(--acid) 40%, var(--spine) 100%)',
            transition: 'height 0.6s linear',
            boxShadow: '0 0 24px var(--acid), inset 0 -8px 16px rgba(0,0,0,0.25)',
          }}
        >
          {/* Meniscus glow at the top of the liquid */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: -3,
              left: 0,
              right: 0,
              height: 6,
              background: 'linear-gradient(180deg, var(--acid-glow), transparent)',
              filter: 'blur(2px)',
            }}
          />
        </div>

        {/* Rising bubbles */}
        <div
          className="bubbles"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            overflow: 'hidden',
          }}
        >
          {bubbles.map((b, i) => (
            <span
              key={i}
              className="pomo-bubble"
              style={{
                position: 'absolute',
                bottom: 0,
                left: b.left,
                width: 6,
                height: 6,
                background: 'rgba(255,255,255,0.5)',
                borderRadius: '50%',
                animationName: 'vapor-rise',
                animationTimingFunction: 'linear',
                animationIterationCount: 'infinite',
                animationDuration: b.animationDuration,
                animationDelay: b.animationDelay,
              }}
            />
          ))}
        </div>

        {/* Minute tick marks along the right edge */}
        <div
          className="ticks"
          data-testid="pomo-ticks"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            right: 6,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '8px 0',
            fontFamily: 'var(--font-mono)',
            fontSize: 7.5,
            color: 'var(--ink-3)',
            letterSpacing: '0.06em',
            pointerEvents: 'none',
          }}
        >
          <span>25</span>
          <span>20</span>
          <span>15</span>
          <span>10</span>
          <span>05</span>
          <span>00</span>
        </div>
      </div>

      {/* Info panel — clock + label + reserve % */}
      <div
        className="info"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 6,
          fontFamily: 'var(--font-mono)',
        }}
      >
        <div
          className="num"
          style={{
            fontSize: 44,
            letterSpacing: '-0.04em',
            color: 'var(--ink)',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
            fontWeight: 300,
          }}
        >
          {m}
          <span className="colon" style={{ color: 'var(--rust)' }}>:</span>
          {s}
        </div>

        <div
          className="label"
          style={{
            fontSize: 9.5,
            color: 'var(--ink-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          deep work · phase 03
        </div>

        <div
          className="pct"
          style={{
            fontSize: 11,
            color: 'var(--acid)',
            marginTop: 4,
            textShadow: '0 0 8px rgba(201,241,88,0.45)',
          }}
        >
          {Math.round(remainingPct)}% reserve
        </div>
      </div>
    </div>
  );
}
