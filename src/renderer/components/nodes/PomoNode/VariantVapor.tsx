import { useMemo } from 'react';
import type { PomoState } from './types';

interface VariantVaporProps {
  state: PomoState;
  remainingPct: number;
  clockText: string;
  colonAnimation: string;
}

export function VariantVapor({ state, remainingPct, clockText, colonAnimation }: VariantVaporProps) {
  const [mm, ss] = clockText.split(':') as [string, string];

  const bubbles = useMemo(() => [0, 1, 2, 3].map((i) => ({
    left: 8 + i * 14,
    animationDuration: `${3.2 + (i % 2) * 1.4}s`,
    animationDelay: `${i * 0.7}s`,
  })), []);

  return (
    <>
      <style>{`
        @keyframes vapor-rise {
          0%   { transform: translateY(0) scale(1); opacity: 0; }
          10%  { opacity: 0.8; }
          90%  { opacity: 0.4; }
          100% { transform: translateY(-220px) scale(0.5); opacity: 0; }
        }
        .pomo-bubble {
          position: absolute;
          bottom: 0;
          width: 6px;
          height: 6px;
          background: rgba(255,255,255,0.5);
          border-radius: 50%;
          animation: vapor-rise linear infinite;
        }
      `}</style>

      <div
        className="pomo-vapor"
        style={{ display: 'flex', gap: 16, alignItems: 'stretch', minHeight: 240 }}
      >
        {/* Vapor tube */}
        <div
          className="tube"
          style={{
            position: 'relative',
            width: 64,
            flexShrink: 0,
            background: 'rgba(0,0,0,0.5)',
            border: '1.5px solid var(--paper-3)',
            borderRadius: 32,
            overflow: 'hidden',
            boxShadow: 'inset 2px 0 0 rgba(255,255,255,0.04), inset -2px 0 0 rgba(0,0,0,0.12)',
          }}
        >
          {/* Liquid fill */}
          <div
            className="liquid"
            data-testid="pomo-liquid"
            style={{
              position: 'absolute',
              left: 0, right: 0, bottom: 0,
              height: `${remainingPct}%`,
              background: 'linear-gradient(180deg, var(--acid-glow) 0%, var(--acid) 40%, var(--spine) 100%)',
              transition: 'height 0.6s linear',
              boxShadow: '0 0 24px var(--acid), inset 0 -8px 16px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{
              position: 'absolute',
              top: -3, left: 0, right: 0,
              height: 6,
              background: 'linear-gradient(180deg, var(--acid-glow), transparent)',
              filter: 'blur(2px)',
            }} />
          </div>

          {/* Bubbles */}
          <div
            className="bubbles"
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}
          >
            {bubbles.map((b, i) => (
              <span
                key={i}
                className="pomo-bubble"
                style={{
                  left: b.left,
                  animationDuration: b.animationDuration,
                  animationDelay: b.animationDelay,
                }}
              />
            ))}
          </div>

          {/* Tick marks */}
          <div
            className="ticks"
            data-testid="pomo-ticks"
            style={{
              position: 'absolute',
              top: 0, bottom: 0, right: 6,
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

        {/* Info column */}
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
            data-testid="pomo-clock"
            style={{
              fontSize: 44,
              letterSpacing: '-0.04em',
              color: 'var(--ink)',
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1,
              fontWeight: 300,
            }}
          >
            {mm}
            <span
              className="colon"
              data-testid="pomo-colon"
              data-running={state.status === 'running'}
              style={{
                color: 'var(--rust)',
                animation: colonAnimation,
              }}
            >:</span>
            {ss}
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
            {state.label ? state.label : 'deep work'} · phase 03
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
            {state.status === 'idle' ? 'ready' : `${Math.round(remainingPct)}% reserve`}
          </div>
        </div>
      </div>
    </>
  );
}
