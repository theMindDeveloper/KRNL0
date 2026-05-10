import { useEffect, useState } from 'react';
import type { NodeProps } from '../types';
import type { PomoConfig, PomoState } from './types';

const TICK_MS = 500;

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

  const accent = state.status === 'break' ? 'var(--ink-3)' : 'var(--rust)';

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
      <div style={{ padding: '14px 16px' }}>
        <div
          style={{
            fontSize: 64,
            fontFamily: 'var(--font-mono)',
            fontWeight: 300,
            color: accent,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.02em',
          }}
        >
          {formatRemaining(remainingMs)}
        </div>
        <div
          style={{
            fontSize: 10.5,
            color: 'var(--ink-3)',
            marginTop: 4,
            fontFamily: 'var(--font-mono)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          SESSION {state.sessionsCompleted} / {sessionsTarget}
        </div>
        <button
          type="button"
          onClick={handlePrimary}
          style={{
            marginTop: 12,
            width: '100%',
            padding: '6px 10px',
            background: 'transparent',
            border: '1px solid var(--paper-3)',
            borderRadius: 'var(--radius-md)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            letterSpacing: '0.04em',
            color: 'var(--ink-1)',
            cursor: 'pointer',
          }}
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
