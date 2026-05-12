import { useEffect, useState } from 'react';
import type { NodeProps } from '../types';
import type { TaskConfig, TaskState } from './types';
import { defaultTaskConfig } from './types';
import { defaultEmbeddedPomo, defaultPomoConfig } from '../PomoNode/types';

const TICK_MS = 500;

function formatRemaining(ms: number): string {
  const safe = Math.max(0, ms);
  const totalSec = Math.ceil(safe / 1000);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
}

// TaskNode — child task card spawned when a todo item is added.
// No slot tag, no corner brackets (those are mother-only, Decision #8).
// Handles are added by the rfAdapters HOC — DO NOT import Handle here.
export function TaskNode({ node, onCommand }: NodeProps<TaskState, TaskConfig>) {
  const { state } = node;
  // config read but not used for display — kept for future extension
  const _config = (node.config as TaskConfig | null) ?? defaultTaskConfig();
  void _config;

  // Decision 9 Addendum — defensive default. Boards saved before this commit
  // have no `pomo` block; the migration in handlers.ts backfills on load, but
  // an in-memory addNode path that hasn't been re-routed yet would crash here.
  const pomo = state.pomo ?? defaultEmbeddedPomo(defaultPomoConfig(), state.text);
  const pomoStatus = pomo.status;

  // Tick — drives mini-timer redraws while running/break
  const [, setTick] = useState(0);
  useEffect(() => {
    if (pomoStatus !== 'running' && pomoStatus !== 'break') return;
    const id = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => clearInterval(id);
  }, [pomoStatus]);

  // F11 — auto-complete when the embedded timer hits zero
  const totalMs =
    pomoStatus === 'running'
      ? pomo.durationMin * 60_000
      : pomoStatus === 'break'
        ? pomo.breakMin * 60_000
        : pomo.durationMin * 60_000;
  const elapsedMs =
    (pomoStatus === 'running' || pomoStatus === 'break') && pomo.startedAt
      ? Date.now() - Date.parse(pomo.startedAt)
      : 0;
  const remainingMs = totalMs - elapsedMs;
  useEffect(() => {
    if (pomoStatus === 'running' && remainingMs <= 0) onCommand('task.completePomo');
  }, [pomoStatus, remainingMs, onCommand]);

  const seqNum = String(state.sequenceNumber ?? 1).padStart(2, '0');
  const layer = state.layer ?? 0;
  const eta = state.eta ?? `~${state.durationMin}M`;
  const tag = state.tag ?? '';

  // F9/F10 — button label + command vary by status
  let pomoBtnLabel = '+ pomo';
  let pomoBtnCommand = 'task.startPomo';
  if (pomoStatus === 'running') {
    pomoBtnLabel = 'pause';
    pomoBtnCommand = 'task.cancelPomo';
  } else if (pomoStatus === 'break') {
    pomoBtnLabel = 'skip break';
    pomoBtnCommand = 'task.skipBreak';
  }

  const showMiniTimer = pomoStatus === 'running' || pomoStatus === 'break';
  const miniTimerText = formatRemaining(remainingMs);

  return (
    // data-done attribute drives the "done" class semantics tested by Gherkin F4
    <div
      data-testid="task-node-root"
      data-done={state.done ? 'true' : undefined}
      data-pomo-status={pomoStatus}
      className={state.done ? 'done' : ''}
      style={{
        width: 220,
        border: '1px solid var(--paper-3)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--node-bg)',
        boxShadow: 'var(--shadow-1)',
        overflow: 'hidden',
      }}
    >
      {/* Header row */}
      <div
        style={{
          padding: '6px 10px 5px',
          borderBottom: '1px solid var(--paper-3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
        }}
      >
        {/* F1: "task · #NN L{layer}" */}
        <span
          data-testid="task-header"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            color: 'var(--ink-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          <span style={{ color: 'var(--cyan)' }}>●</span>
          {` task · #${seqNum} L${layer}`}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* F10 — mini timer visible only while running/break */}
          {showMiniTimer && (
            <span
              data-testid="task-mini-timer"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: pomoStatus === 'running' ? 'var(--rust)' : 'var(--acid)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {miniTimerText}
            </span>
          )}

          {/* F2 (contract change) / NF3 — pomo control button; hidden when done */}
          {!state.done && (
            <button
              type="button"
              className="task-pomo-btn"
              data-testid="task-pomo-btn"
              data-pomo-command={pomoBtnCommand}
              onClick={() => onCommand(pomoBtnCommand)}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 8.5,
                color: 'var(--cyan)',
                border: '1px solid var(--cyan)',
                borderRadius: 3,
                padding: '2px 5px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                opacity: 0.85,
                cursor: 'pointer',
                background: 'transparent',
              }}
            >
              {pomoBtnLabel}
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '8px 10px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* F3: checkbox + title row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
          <button
            type="button"
            className="task-check"
            onClick={() => onCommand('task.toggle')}
            style={{
              flexShrink: 0,
              width: 15,
              height: 15,
              border: `1.5px solid ${state.done ? 'var(--ink)' : 'var(--ink-4)'}`,
              borderRadius: 3,
              background: state.done ? 'var(--ink)' : 'transparent',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              padding: 0,
              marginTop: 2,
              transition: 'all 0.12s',
            }}
            aria-label={state.done ? 'Mark undone' : 'Mark done'}
          >
            {state.done && (
              <span style={{ fontSize: 11, color: 'var(--acid)', fontWeight: 700, lineHeight: 1 }}>✓</span>
            )}
          </button>

          {/* F4: done text styling */}
          <span
            className="task-text"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              lineHeight: 1.4,
              color: state.done ? 'var(--ink-4)' : 'var(--ink)',
              textDecoration: state.done ? 'line-through' : 'none',
              textDecorationColor: 'var(--ink-4)',
              flex: 1,
            }}
          >
            {state.text}
          </span>
        </div>

        {/* F5: footer — tag + ETA + per-task session count (Addendum F11) */}
        <div
          className="task-foot"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            color: 'var(--ink-4)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            paddingTop: 4,
            borderTop: '1px dashed var(--paper-3)',
          }}
        >
          <span className="task-tag">{tag}</span>
          <span
            className="task-pomo-count"
            data-testid="task-pomo-count"
            style={{ color: pomo.sessionsCompleted > 0 ? 'var(--rust)' : 'var(--ink-4)' }}
          >
            {pomo.sessionsCompleted}🍅
          </span>
          <span className="task-eta">{eta}</span>
        </div>
      </div>
    </div>
  );
}
