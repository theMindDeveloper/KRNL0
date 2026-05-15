// TimerVapor — CSS glass tube, flat open top, rounded sealed bottom.
// Info (clock + reserve %) sits below the tube; pips and controls follow naturally.

import { useMemo } from 'react';
import type { TimerFaceProps } from './types';

interface BubbleConfig {
  left: number;
  animationDuration: string;
  animationDelay: string;
}

export function Vapor({ m, s, remainingPct }: TimerFaceProps) {
  const bubbles: BubbleConfig[] = useMemo(
    () =>
      [0, 1, 2, 3].map((i) => ({
        left: 12 + i * 16,
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
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .pomo-vapor .pomo-bubble { animation-play-state: paused !important; }
        }
      `}</style>

      {/* Glass tube — flat top, rounded bottom */}
      <div
        className="tube"
        style={{
          position: 'relative',
          width: 88,
          height: 200,
          flexShrink: 0,
          background: 'linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(0,0,0,0.18) 100%)',
          border: '1.5px solid var(--ink-3)',
          borderRadius: '3px 3px 44px 44px',
          overflow: 'hidden',
          boxShadow:
            'inset 3px 0 0 rgba(255,255,255,0.05), inset -3px 0 0 rgba(0,0,0,0.18), 0 12px 32px rgba(0,0,0,0.35)',
        }}
      >
        {/* Liquid fill */}
        <div
          className="liquid"
          data-testid="pomo-liquid"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: `${remainingPct}%`,
            background:
              'linear-gradient(180deg, var(--acid-glow) 0%, var(--acid) 40%, var(--spine) 100%)',
            transition: 'height 0.6s linear',
            boxShadow: '0 0 28px var(--acid), inset 0 -8px 16px rgba(0,0,0,0.25)',
          }}
        >
          {/* Meniscus */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: -4,
              left: 0,
              right: 0,
              height: 7,
              background: 'linear-gradient(180deg, var(--acid-glow), transparent)',
              filter: 'blur(3px)',
            }}
          />
        </div>

        {/* Rising bubbles */}
        <div
          className="bubbles"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}
        >
          {bubbles.map((b, i) => (
            <span
              key={i}
              className="pomo-bubble"
              style={{
                position: 'absolute',
                bottom: 0,
                left: b.left,
                width: 5,
                height: 5,
                background: 'rgba(255,255,255,0.55)',
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

        {/* Glass reflection strip */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 0,
            left: 9,
            width: 13,
            bottom: '12%',
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 50%, transparent 100%)',
            borderRadius: '0 0 6px 6px',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />

        {/* Tick marks */}
        <div
          className="ticks"
          data-testid="pomo-ticks"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            right: 9,
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

      {/* Info below tube */}
      <div
        className="info"
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
          fontFamily: 'var(--font-mono)',
        }}
      >
        <div
          style={{
            fontSize: 42,
            letterSpacing: '-0.04em',
            color: 'var(--ink)',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
            fontWeight: 300,
          }}
        >
          {m}
          <span style={{ color: 'var(--rust)' }}>:</span>
          {s}
        </div>

        <div
          style={{
            fontSize: 9.5,
            color: 'var(--ink-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          deep work · phase 03
        </div>

        <div style={{ fontSize: 11, color: 'var(--acid)', textShadow: '0 0 8px rgba(201,241,88,0.4)' }}>
          {Math.round(remainingPct)}% reserve
        </div>
      </div>
    </div>
  );
}
