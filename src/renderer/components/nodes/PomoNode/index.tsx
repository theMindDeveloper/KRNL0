import { useEffect, useState } from 'react';
import type { NodeProps } from '../types';
import type { PomoConfig, PomoState } from './types';

const TICK_MS = 500;
const RING_RADIUS = 68;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

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

  // Visual tick only — state mutations go through onCommand (Decision #9).
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

  // When a running session reaches zero, request completion. The kernel
  // validates the precondition and writes; the tick itself never writes.
  useEffect(() => {
    if (state.status === 'running' && remainingMs <= 0) {
      onCommand('pomo.complete');
    }
  }, [state.status, remainingMs, onCommand]);

  const sessionsTarget = config?.longBreakEvery ?? 4;

  const handlePrimary = () => {
    if (state.status === 'idle' || state.status === 'done') {
      onCommand('pomo.start');
    } else if (state.status === 'running') {
      onCommand('pomo.cancel');
    } else if (state.status === 'break') {
      onCommand('pomo.skipBreak');
    }
  };

  const buttonLabel =
    state.status === 'running' ? 'CANCEL' : state.status === 'break' ? 'SKIP BREAK' : 'START';

  // Ring stroke color
  const ringStroke =
    state.status === 'running'
      ? 'var(--rust)'
      : state.status === 'break'
        ? 'var(--ink-3)'
        : 'transparent';

  // Clock text color
  const clockColor =
    state.status === 'running' ? 'var(--rust)' : 'var(--ink-3)';

  // Progress: 1 = full ring, 0 = empty
  const progress =
    state.status === 'running' || state.status === 'break'
      ? Math.max(0, Math.min(1, remainingMs / totalMs))
      : 0;

  const strokeDashoffset = CIRCUMFERENCE * (1 - progress);

  // Session dots — filled = completed in current longBreak cycle
  const completedDots = state.sessionsCompleted % sessionsTarget;

  return (
    <div
      style={{
        width: 240,
        border: '1px solid var(--paper-3)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--node-bg)',
        boxShadow: 'var(--shadow-1)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '7px 10px 6px',
          borderBottom: '1px solid var(--paper-3)',
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          color: 'var(--ink-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        ▙ POMO{state.status === 'break' ? ' · BREAK' : ''}
      </div>

      {/* Body */}
      <div
        style={{
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        {/* Ring + clock — 160×160 relative container, centered in 240px node */}
        <div
          style={{
            position: 'relative',
            width: 160,
            height: 160,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg
            width={160}
            height={160}
            style={{ position: 'absolute', top: 0, left: 0 }}
          >
            {/* Track circle */}
            <circle
              cx={80}
              cy={80}
              r={RING_RADIUS}
              stroke="var(--paper-3)"
              strokeWidth={3}
              fill="none"
              opacity={0.5}
            />
            {/* Progress circle */}
            <circle
              cx={80}
              cy={80}
              r={RING_RADIUS}
              stroke={ringStroke}
              strokeWidth={3}
              fill="none"
              strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              transform="rotate(-90 80 80)"
              style={{ transition: 'stroke-dashoffset 0.5s linear' }}
            />
          </svg>

          {/* Clock text — absolutely centered over SVG */}
          <span
            style={{
              position: 'relative',
              zIndex: 1,
              fontSize: 64,
              fontFamily: 'var(--font-mono)',
              fontWeight: 300,
              color: clockColor,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.02em',
              lineHeight: 1,
            }}
          >
            {formatRemaining(remainingMs)}
          </span>
        </div>

        {/* Session dots */}
        <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
          {Array.from({ length: sessionsTarget }).map((_, i) => (
            <div
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: i < completedDots ? 'var(--acid)' : 'var(--paper-3)',
              }}
            />
          ))}
        </div>

        {/* Session count label */}
        <div
          style={{
            fontSize: 10.5,
            color: 'var(--ink-3)',
            marginTop: 6,
            fontFamily: 'var(--font-mono)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          SESSION {state.sessionsCompleted} / {sessionsTarget}
        </div>

        {/* Action button */}
        <button
          type="button"
          onClick={handlePrimary}
          style={{
            marginTop: 12,
            width: '100%',
            padding: '6px 10px',
            background: 'transparent',
            border: '1px solid var(--paper-3)',
            borderRadius: 'var(--radius)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            letterSpacing: '0.04em',
            color: 'var(--ink-2)',
            cursor: 'pointer',
          }}
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
