import { useEffect, useState } from 'react';
import type { NodeProps } from '../types';
import type { PomoConfig, PomoState } from './types';
import { MotherFrame, MOTHER_WIDTH, MOTHER_TOTAL } from '../MotherFrame';

const TICK_MS = 500;
const SLOT_INDEX = 1;

function formatRemaining(ms: number): string {
  const safe = Math.max(0, ms);
  const totalSec = Math.ceil(safe / 1000);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
}

export function PomoNode({ node, onCommand }: NodeProps<PomoState, PomoConfig>) {
  const { state, config } = node;
  const [, setTick] = useState(0);

  // Visual tick — state mutations go through onCommand (Decision #9)
  useEffect(() => {
    if (state.status !== 'running' && state.status !== 'break') return;
    const id = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => clearInterval(id);
  }, [state.status]);

  const totalMs =
    state.status === 'running'
      ? state.durationMin * 60_000
      : state.status === 'break'
        ? state.breakMin * 60_000
        : state.durationMin * 60_000;

  const elapsedMs =
    (state.status === 'running' || state.status === 'break') && state.startedAt !== null
      ? Date.now() - Date.parse(state.startedAt)
      : 0;
  const remainingMs = totalMs - elapsedMs;

  useEffect(() => {
    if (state.status === 'running' && remainingMs <= 0) onCommand('pomo.complete');
  }, [state.status, remainingMs, onCommand]);

  const sessionsTarget = config?.longBreakEvery ?? 4;
  const completedDots = state.sessionsCompleted % sessionsTarget;

  const handlePrimary = () => {
    if (state.status === 'idle' || state.status === 'done') onCommand('pomo.start');
    else if (state.status === 'running') onCommand('pomo.cancel');
    else if (state.status === 'break') onCommand('pomo.skipBreak');
  };
  const handleReset = () => onCommand('pomo.cancel');

  const buttonLabel =
    state.status === 'running' ? 'PAUSE' : state.status === 'break' ? 'SKIP BREAK' : 'START';

  // Vapor reservoir percentage of remaining time (drains over session)
  const remainingPct = state.status === 'running' || state.status === 'break'
    ? Math.max(0, Math.min(100, (remainingMs / totalMs) * 100))
    : state.status === 'idle' ? 100 : 0;

  const clockText = state.status === 'idle' || state.status === 'done'
    ? formatRemaining(state.durationMin * 60_000)
    : formatRemaining(remainingMs);
  const [mm, ss] = clockText.split(':');

  return (
    <MotherFrame slotIndex={SLOT_INDEX} slotTotal={MOTHER_TOTAL} width={MOTHER_WIDTH}>
      {/* Bubble keyframes scoped to this node */}
      <style>{`
        @keyframes vapor-rise {
          0%   { transform: translateY(0) scale(1); opacity: 0; }
          10%  { opacity: 0.8; }
          90%  { opacity: 0.4; }
          100% { transform: translateY(-220px) scale(0.5); opacity: 0; }
        }
        @keyframes pomo-blink { 50% { opacity: 0.3; } }
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

      {/* Header — bullet + DEEP WORK · POMO.025 */}
      <div
        style={{
          padding: '7px 12px 6px',
          borderBottom: '1px solid var(--paper-2)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: state.status === 'running' ? 'var(--rust)' : 'var(--ink-4)',
        }} />
        <span style={{ color: 'var(--ink-2)', fontWeight: 500 }}>DEEP WORK</span>
        <span style={{ color: 'var(--ink-3)' }}>· POMO.025</span>
      </div>

      {/* Body — vapor tube + info */}
      <div style={{ padding: '18px 18px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', minHeight: 240 }}>
          {/* Vapor tube */}
          <div
            style={{
              position: 'relative',
              width: 70,
              flexShrink: 0,
              background: 'rgba(0,0,0,0.5)',
              border: '1.5px solid var(--paper-3)',
              borderRadius: 35,
              overflow: 'hidden',
              boxShadow: 'inset 2px 0 0 rgba(255,255,255,0.04), inset -2px 0 0 rgba(0,0,0,0.12)',
            }}
          >
            {/* Liquid fill */}
            <div
              style={{
                position: 'absolute',
                left: 0, right: 0, bottom: 0,
                height: `${remainingPct}%`,
                background: 'linear-gradient(180deg, var(--acid-glow) 0%, var(--acid) 40%, #6e8a1f 100%)',
                transition: 'height 0.6s linear',
                boxShadow: '0 0 24px var(--acid), inset 0 -8px 16px rgba(0,0,0,0.25)',
              }}
            >
              {/* Meniscus on top */}
              <div style={{
                position: 'absolute',
                top: -3, left: 0, right: 0,
                height: 6,
                background: 'linear-gradient(180deg, var(--acid-glow), transparent)',
                filter: 'blur(2px)',
              }} />
            </div>

            {/* Bubbles */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className="pomo-bubble"
                  style={{
                    left: 8 + i * 14,
                    animationDuration: `${3.2 + (i % 2) * 1.4}s`,
                    animationDelay: `${i * 0.7}s`,
                  }}
                />
              ))}
            </div>

            {/* Tick marks on the right side of tube */}
            <div
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
              <span>25</span><span>20</span><span>15</span><span>10</span><span>05</span><span>00</span>
            </div>
          </div>

          {/* Info column */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: 6,
              fontFamily: 'var(--font-mono)',
            }}
          >
            <div style={{
              fontSize: 44,
              letterSpacing: '-0.04em',
              color: 'var(--ink)',
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1,
              fontWeight: 300,
            }}>
              {mm}<span style={{ color: 'var(--rust)', animation: 'pomo-blink 1s steps(2) infinite' }}>:</span>{ss}
            </div>
            <div style={{
              fontSize: 9.5,
              color: 'var(--ink-3)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}>
              deep work · phase 03
            </div>
            <div style={{
              fontSize: 11,
              color: 'var(--acid)',
              marginTop: 4,
              textShadow: '0 0 8px rgba(201,241,88,0.45)',
            }}>
              {state.status === 'idle' ? 'ready' : `${Math.round(remainingPct)}% reserve`}
            </div>
          </div>
        </div>

        {/* Session pips */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-start' }}>
          {Array.from({ length: sessionsTarget }).map((_, i) => {
            const done = i < completedDots;
            const active = i === completedDots && state.status === 'running';
            return (
              <span
                key={i}
                style={{
                  width: 9, height: 9, borderRadius: '50%',
                  border: '1.5px solid',
                  borderColor: done || active ? 'var(--rust)' : 'var(--ink-4)',
                  background: done ? 'var(--rust)' : 'transparent',
                  boxShadow: active ? '0 0 0 3px rgba(200, 85, 61, 0.16)' : 'none',
                  position: 'relative',
                }}
              />
            );
          })}
          <span style={{
            marginLeft: 'auto',
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            color: 'var(--ink-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}>
            session {state.sessionsCompleted} / {sessionsTarget}
          </span>
        </div>

        {/* Controls — RESET + PAUSE/START */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={handleReset}
            style={{
              flex: 1,
              padding: '10px 8px',
              background: 'transparent',
              color: 'var(--ink-2)',
              border: '1px solid var(--paper-3)',
              borderRadius: 5,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              cursor: 'pointer',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            RESET
          </button>
          <button
            type="button"
            onClick={handlePrimary}
            style={{
              flex: 1,
              padding: '10px 8px',
              background: 'var(--acid)',
              color: 'var(--paper)',
              border: 'none',
              borderRadius: 5,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              cursor: 'pointer',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            {buttonLabel}
          </button>
        </div>
      </div>
    </MotherFrame>
  );
}

export default PomoNode;
