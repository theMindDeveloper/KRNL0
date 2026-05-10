import { useEffect, useState } from 'react';
import type { NodeProps } from '../types';
import type { PomoConfig, PomoState } from './types';

const TICK_MS = 500;
const SLOT_INDEX = 1;
const SLOT_TOTAL = 4;

const PILL_HEIGHT = 200;
const PILL_FILL_MAX = 196; // fill area (200 - 4px breathing room from rounded ends)

function formatRemaining(ms: number): string {
  const safe = Math.max(0, ms);
  const totalSec = Math.ceil(safe / 1000);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
}

const slotTagStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 9,
  color: 'var(--ink-3)',
  textTransform: 'uppercase',
  letterSpacing: '0.18em',
  marginBottom: 6,
  paddingLeft: 2,
};

const cornerStyle = (corner: 'tl' | 'tr' | 'bl' | 'br'): React.CSSProperties => {
  const base: React.CSSProperties = {
    position: 'absolute',
    width: 8,
    height: 8,
    opacity: 0.35,
    pointerEvents: 'none',
  };
  if (corner === 'tl') return { ...base, top: -1, left: -1, borderTop: '1px solid var(--ink-3)', borderLeft: '1px solid var(--ink-3)' };
  if (corner === 'tr') return { ...base, top: -1, right: -1, borderTop: '1px solid var(--ink-3)', borderRight: '1px solid var(--ink-3)' };
  if (corner === 'bl') return { ...base, bottom: -1, left: -1, borderBottom: '1px solid var(--ink-3)', borderLeft: '1px solid var(--ink-3)' };
  return { ...base, bottom: -1, right: -1, borderBottom: '1px solid var(--ink-3)', borderRight: '1px solid var(--ink-3)' };
};

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
  const completedDots = state.sessionsCompleted % sessionsTarget;

  // Progress: 1 = full battery (time remaining), 0 = empty (time elapsed)
  const progress =
    state.status === 'running' || state.status === 'break'
      ? Math.max(0, Math.min(1, remainingMs / totalMs))
      : 0;

  const fillHeight = Math.round(progress * PILL_FILL_MAX);

  const reservePercent = Math.round((remainingMs / totalMs) * 100);

  // Derived display values
  const headerBulletColor =
    state.status === 'running' ? 'var(--rust)' : 'var(--ink-3)';

  const clockColor = state.status === 'running' ? 'var(--rust)' : 'var(--ink-3)';

  const headerLabel = state.label.trim().toUpperCase() || 'DEEP WORK';
  const pomoDurationTag = `POMO.${state.durationMin.toString().padStart(3, '0')}`;

  const phaseNum = (completedDots + 1).toString().padStart(2, '0');
  const phaseLabel = `${headerLabel} · PHASE ${phaseNum}`;

  // ▲ RUN text — reflects current status
  const runLabel =
    state.status === 'running'
      ? '▲ RUN'
      : state.status === 'break'
        ? '▲ BREAK'
        : state.status === 'done'
          ? '▲ DONE'
          : '▲ IDLE';

  // PAUSE/START/SKIP BREAK button
  const pauseButtonLabel =
    state.status === 'running'
      ? 'PAUSE'
      : state.status === 'break'
        ? 'SKIP BREAK'
        : 'START';

  const handleReset = () => {
    onCommand('pomo.cancel');
  };

  const handlePause = () => {
    if (state.status === 'idle' || state.status === 'done') {
      onCommand('pomo.start');
    } else if (state.status === 'running') {
      onCommand('pomo.cancel');
    } else if (state.status === 'break') {
      onCommand('pomo.skipBreak');
    }
  };

  const clockDisplay =
    state.status === 'idle' || state.status === 'done'
      ? formatRemaining(state.durationMin * 60_000)
      : formatRemaining(remainingMs);

  return (
    <div style={{ position: 'relative' }}>
      {/* Slot tag above node */}
      <div style={slotTagStyle}>
        {String(SLOT_INDEX).padStart(2, '0')} · SPINE · {String(SLOT_TOTAL).padStart(2, '0')}
      </div>

      {/* Node card */}
      <div
        style={{
          position: 'relative',
          width: 320,
          border: '1px solid var(--paper-3)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--node-bg)',
          boxShadow: 'var(--shadow-1)',
          overflow: 'hidden',
        }}
      >
        {/* Corner brackets */}
        <span style={cornerStyle('tl')} />
        <span style={cornerStyle('tr')} />
        <span style={cornerStyle('bl')} />
        <span style={cornerStyle('br')} />

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
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span style={{ color: headerBulletColor }}>●</span>
          <span>{headerLabel} · {pomoDurationTag}</span>
        </div>

        {/* Body: 2 columns */}
        <div
          style={{
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'row',
            gap: 16,
            alignItems: 'flex-start',
          }}
        >
          {/* LEFT: vertical pill battery */}
          <div
            style={{
              width: 60,
              height: PILL_HEIGHT,
              borderRadius: 30,
              border: '1px solid var(--paper-3)',
              position: 'relative',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            {/* Fill from bottom up */}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: fillHeight,
                background: 'var(--acid)',
                transition: 'height 0.5s linear',
              }}
            />
          </div>

          {/* RIGHT: clock + meta */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start',
              gap: 6,
            }}
          >
            {/* Big clock */}
            <div
              style={{
                fontSize: 36,
                fontFamily: 'var(--font-mono)',
                fontWeight: 300,
                color: clockColor,
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1,
              }}
            >
              {clockDisplay}
            </div>

            {/* Phase label */}
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: 'var(--ink-3)',
                textTransform: 'uppercase',
                letterSpacing: '0.18em',
              }}
            >
              {phaseLabel}
            </div>

            {/* Reserve / ready */}
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--acid)',
              }}
            >
              {state.status === 'idle' ? 'ready' : `${reservePercent}% reserve`}
            </div>

            {/* Session dots + run label row */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 8,
              }}
            >
              <div style={{ display: 'flex', gap: 4 }}>
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

              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  color: 'var(--ink-3)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {runLabel}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom button row */}
        <div
          style={{
            padding: '0 16px 14px',
            display: 'flex',
            gap: 6,
          }}
        >
          {/* RESET button */}
          <button
            type="button"
            onClick={handleReset}
            style={{
              flex: 1,
              padding: '6px 10px',
              background: 'transparent',
              border: '1px solid var(--paper-3)',
              borderRadius: 'var(--radius)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--ink-2)',
              cursor: 'pointer',
            }}
          >
            RESET
          </button>

          {/* PAUSE / START / SKIP BREAK button — 60% width */}
          <button
            type="button"
            onClick={handlePause}
            style={{
              flex: '0 0 60%',
              padding: '6px 10px',
              background: 'var(--acid)',
              border: '1px solid var(--paper-3)',
              borderRadius: 'var(--radius)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--paper)',
              cursor: 'pointer',
            }}
          >
            {pauseButtonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
