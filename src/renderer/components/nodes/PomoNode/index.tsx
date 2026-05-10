import { useEffect, useState } from 'react';
import type { NodeProps } from '../types';
import type { PomoConfig, PomoState } from './types';
import { MotherFrame, MOTHER_WIDTH, MOTHER_TOTAL } from '../MotherFrame';
import { VariantVapor } from './VariantVapor';
import { VariantRing } from './VariantRing';
import { VariantAscii } from './VariantAscii';
import { VariantLcd } from './VariantLcd';
import { VariantBlocks } from './VariantBlocks';

const TICK_MS = 500;
const SLOT_INDEX = 1;

function formatRemaining(ms: number): string {
  const safe = Math.max(0, ms);
  const totalSec = Math.ceil(safe / 1000);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
}

/** Derive the pct of remaining time (0–100), used for liquid fill height (F1). */
export function calcRemainingPct(
  status: PomoState['status'],
  remainingMs: number,
  totalMs: number,
): number {
  if (status === 'running' || status === 'break') {
    return Math.max(0, Math.min(100, (remainingMs / totalMs) * 100));
  }
  return status === 'idle' ? 100 : 0;
}

/** Label for the primary action button (F5). */
export function primaryButtonLabel(status: PomoState['status']): string {
  switch (status) {
    case 'running': return 'PAUSE';
    case 'break':   return 'SKIP BREAK';
    case 'done':    return 'START';
    default:        return 'START'; // 'idle'
  }
}

/** Pip state for session pip at index i (F6). */
export function pipState(
  i: number,
  completedDots: number,
  status: PomoState['status'],
): 'done' | 'active' | 'empty' {
  if (i < completedDots) return 'done';
  if (i === completedDots && status === 'running') return 'active';
  return 'empty';
}

export function PomoNode({ node, onCommand }: NodeProps<PomoState, PomoConfig>) {
  const { state, config } = node;
  const [, setTick] = useState(0);

  const variant = config?.variant ?? 'vapor';

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

  // Auto-dispatch pomo.complete when timer hits zero
  useEffect(() => {
    if (state.status === 'running' && remainingMs <= 0) onCommand('pomo.complete');
  }, [state.status, remainingMs, onCommand]);

  const sessionsTarget = config?.longBreakEvery ?? 4;
  const completedDots = state.sessionsCompleted % sessionsTarget;

  // Primary button handler
  const handlePrimary = () => {
    if (state.status === 'idle' || state.status === 'done') onCommand('pomo.start');
    else if (state.status === 'running') onCommand('pomo.cancel');
    else if (state.status === 'break') onCommand('pomo.skipBreak');
  };
  const handleReset = () => onCommand('pomo.cancel');

  const buttonLabel = primaryButtonLabel(state.status);

  const remainingPct = calcRemainingPct(state.status, remainingMs, totalMs);

  const clockText = state.status === 'idle' || state.status === 'done'
    ? formatRemaining(state.durationMin * 60_000)
    : formatRemaining(remainingMs);

  const colonAnimation = state.status === 'running'
    ? 'pomo-blink 1s steps(2) infinite'
    : 'none';

  const variantProps = {
    state,
    remainingPct,
    clockText,
    colonAnimation,
  };

  return (
    <MotherFrame slotIndex={SLOT_INDEX} slotTotal={MOTHER_TOTAL} width={MOTHER_WIDTH}>
      <style>{`
        @keyframes pomo-blink { 50% { opacity: 0.3; } }
        @keyframes blink { 50% { opacity: 0.3; } }
      `}</style>

      {/* Header */}
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

      {/* Body */}
      <div style={{ padding: '18px 18px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Variant display */}
        {variant === 'vapor'  && <VariantVapor  {...variantProps} />}
        {variant === 'ring'   && <VariantRing   {...variantProps} />}
        {variant === 'ascii'  && <VariantAscii  {...variantProps} />}
        {variant === 'lcd'    && <VariantLcd    state={state} clockText={clockText} colonAnimation={colonAnimation} />}
        {variant === 'blocks' && <VariantBlocks {...variantProps} />}

        {/* Session pips */}
        <div
          className="pomo-pips"
          data-testid="pomo-pips"
          style={{ display: 'flex', gap: 8, justifyContent: 'flex-start' }}
        >
          {Array.from({ length: sessionsTarget }).map((_, i) => {
            const ps = pipState(i, completedDots, state.status);
            return (
              <span
                key={i}
                className={`pip ${ps}`}
                data-pip-index={i}
                data-pip-state={ps}
                style={{
                  width: 9, height: 9, borderRadius: '50%',
                  border: '1.5px solid',
                  borderColor: ps !== 'empty' ? 'var(--rust)' : 'var(--ink-4)',
                  background: ps === 'done' ? 'var(--rust)' : 'transparent',
                  boxShadow: ps === 'active' ? '0 0 0 3px rgba(200, 85, 61, 0.16)' : 'none',
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

        {/* Controls */}
        <div
          className="pomo-controls"
          style={{ display: 'flex', gap: 6 }}
        >
          <button
            type="button"
            data-testid="pomo-reset"
            onClick={handleReset}
            className="pomo-btn ghost"
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
            data-testid="pomo-primary"
            onClick={handlePrimary}
            className="pomo-btn"
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
