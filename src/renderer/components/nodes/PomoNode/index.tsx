import { useEffect, useState, useMemo } from 'react';
import type { NodeProps } from '../types';
import type { PomoConfig, PomoState, EmbeddedPomoState } from './types';
import { defaultPomoConfig } from './types';
import { MotherFrame, MOTHER_WIDTH, MOTHER_TOTAL } from '../MotherFrame';
import { useBoardStore } from '../../../store/boardStore';
import type { TaskState } from '../TaskNode/types';
import { makeCommandHandler } from '../../Canvas/commandDispatch';

const TICK_MS = 500;

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

export function PomoNode({ node, onCommand, slotIndex = 1, slotTotal = MOTHER_TOTAL, onMoveLeft, onMoveRight }: NodeProps<PomoState, PomoConfig>) {
  const motherState = node.state;
  const cfg: PomoConfig = {
    ...defaultPomoConfig(),
    ...(node.config ?? {}),
  };
  const [, setTick] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  // Decision 9 Addendum (F13) — mother mirrors active task's pomo if any.
  // Lowest sequenceNumber wins for determinism. Falls back to mother's own
  // state when no task is running/break.
  const board = useBoardStore((s) => s.board);
  const activeTask = useMemo(() => {
    if (!board) return null;
    const tasks = board.nodes.filter((n) => n.kind === 'todo.task');
    const candidates = tasks
      .map((t) => ({ task: t, ts: t.state as TaskState }))
      .filter((x) => {
        const p = x.ts.pomo;
        return p && (p.status === 'running' || p.status === 'break');
      })
      .sort((a, b) => (a.ts.sequenceNumber ?? 0) - (b.ts.sequenceNumber ?? 0));
    return candidates[0]?.task ?? null;
  }, [board]);

  const displayedState: PomoState | EmbeddedPomoState = activeTask
    ? (activeTask.state as TaskState).pomo
    : motherState;
  const displayedLabel = activeTask
    ? (activeTask.state as TaskState).text
    : motherState.label;

  // Visual tick — state mutations go through onCommand (Decision #9)
  // NF1: setInterval at TICK_MS (500ms) drives the visual refresh.
  useEffect(() => {
    if (displayedState.status !== 'running' && displayedState.status !== 'break') return;
    const id = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => clearInterval(id);
  }, [displayedState.status]);

  const totalMs =
    displayedState.status === 'running'
      ? displayedState.durationMin * 60_000
      : displayedState.status === 'break'
        ? displayedState.breakMin * 60_000
        : displayedState.durationMin * 60_000;

  const elapsedMs =
    (displayedState.status === 'running' || displayedState.status === 'break') && displayedState.startedAt !== null
      ? Date.now() - Date.parse(displayedState.startedAt)
      : 0;
  const remainingMs = totalMs - elapsedMs;

  // F7 — auto-dispatch pomo.complete when timer hits zero. Only fires when
  // the displayed pomo is the mother's own (the task pomo runs its own
  // auto-complete inside TaskNode).
  useEffect(() => {
    if (!activeTask && motherState.status === 'running' && remainingMs <= 0) {
      onCommand('pomo.complete');
    }
  }, [activeTask, motherState.status, remainingMs, onCommand]);

  const sessionsTarget = cfg.longBreakEvery;
  const completedDots = displayedState.sessionsCompleted % sessionsTarget;
  const state = displayedState; // alias used by existing JSX below

  // F5 — context-driven primary button. When an active task is being mirrored
  // (Decision 9 Addendum F13), route controls to that task instead of the
  // mother — clicking PAUSE on the mirrored display should pause the task.
  const dispatchToActive = (motherCmd: string, taskCmd: string) => {
    if (activeTask) {
      const handler = makeCommandHandler(activeTask.id);
      handler(taskCmd);
    } else {
      onCommand(motherCmd);
    }
  };
  const handlePrimary = () => {
    if (state.status === 'idle' || state.status === 'done') {
      // Mother's own start; no equivalent on tasks (start belongs on the task card).
      onCommand('pomo.start');
    } else if (state.status === 'running') {
      dispatchToActive('pomo.cancel', 'task.cancelPomo');
    } else if (state.status === 'break') {
      dispatchToActive('pomo.skipBreak', 'task.skipBreak');
    }
  };
  // F4 — RESET always dispatches pomo.cancel (FSM guards the actual transition)
  const handleReset = () => dispatchToActive('pomo.cancel', 'task.cancelPomo');

  // F9/F10 — settings handlers
  const handleSettingNumber = (command: string, key: 'minutes' | 'count') => (value: number) => {
    if (motherState.status === 'running') return;
    if (!Number.isFinite(value) || value <= 0) return;
    onCommand(command, { [key]: value });
  };

  const buttonLabel = primaryButtonLabel(state.status);

  // F1 — liquid fill height tracks remaining time
  const remainingPct = calcRemainingPct(state.status, remainingMs, totalMs);

  const clockText = state.status === 'idle' || state.status === 'done'
    ? formatRemaining(state.durationMin * 60_000)
    : formatRemaining(remainingMs);
  const [mm, ss] = clockText.split(':') as [string, string];

  // F2 — bubble positions are stable across renders (NF2: pure CSS animation)
  const bubbles = useMemo(() => [0, 1, 2, 3].map((i) => ({
    left: 8 + i * 14,
    animationDuration: `${3.2 + (i % 2) * 1.4}s`,
    animationDelay: `${i * 0.7}s`,
  })), []);

  // F3 — colon blinks at 1 Hz ONLY while running
  const colonAnimation = state.status === 'running'
    ? 'pomo-blink 1s steps(2) infinite'
    : 'none';

  return (
    <MotherFrame slotIndex={slotIndex} slotTotal={slotTotal} width={MOTHER_WIDTH} onMoveLeft={onMoveLeft} onMoveRight={onMoveRight}>
      {/* NF2: Bubble keyframes are pure CSS — no JS drives them */}
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

      {/* Header — bullet + DEEP WORK · POMO.025 + gear (F9) */}
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
        <span style={{ color: 'var(--ink-3)' }}>
          {`· POMO.${String(cfg.defaultDurationMin).padStart(3, '0')}`}
        </span>
        {activeTask && (
          <span
            data-testid="pomo-active-task"
            style={{ color: 'var(--cyan)', marginLeft: 4 }}
          >
            ▸ TASK
          </span>
        )}
        <button
          type="button"
          data-testid="pomo-gear"
          onClick={() => setShowSettings((v) => !v)}
          aria-label="Pomodoro settings"
          aria-expanded={showSettings}
          style={{
            marginLeft: 'auto',
            background: 'transparent',
            border: 'none',
            color: showSettings ? 'var(--rust)' : 'var(--ink-3)',
            cursor: 'pointer',
            fontSize: 13,
            padding: '0 2px',
            lineHeight: 1,
          }}
        >
          ⚙
        </button>
      </div>

      {showSettings && (
        <PomoSettingsPanel
          cfg={cfg}
          disabled={motherState.status === 'running'}
          onChange={handleSettingNumber}
        />
      )}

      {/* Body — vapor tube + info */}
      <div style={{ padding: '18px 18px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div
          className="pomo-vapor"
          style={{ display: 'flex', gap: 16, alignItems: 'stretch', minHeight: 240 }}
        >
          {/* F2 — Vapor tube with six tick marks (25/20/15/10/05/00) */}
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
            {/* F1 — Liquid fill: height = remainingPct% */}
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
              {/* Meniscus — top glow on liquid surface */}
              <div style={{
                position: 'absolute',
                top: -3, left: 0, right: 0,
                height: 6,
                background: 'linear-gradient(180deg, var(--acid-glow), transparent)',
                filter: 'blur(2px)',
              }} />
            </div>

            {/* NF2 — Bubbles: pure CSS animation, positions memoised */}
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

            {/* F2 — Tick marks: 25 / 20 / 15 / 10 / 05 / 00 on tube right edge */}
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

          {/* Info column — big clock + phase label + reserve % */}
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
            {/* F3 — Clock display: MM:SS; colon blinks at 1 Hz ONLY while running */}
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
              {displayedLabel ? displayedLabel : 'deep work'} · phase 03
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

        {/* F6 — Session pips: highlight pip at index (sessionsCompleted % longBreakEvery) */}
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
          {/* F12 — prominent session counter; unlimited, persisted */}
          <span
            data-testid="pomo-session-counter"
            style={{
              marginLeft: 'auto',
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              fontWeight: 600,
              color: state.sessionsCompleted > 0 ? 'var(--rust)' : 'var(--ink-3)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            session {state.sessionsCompleted} / {sessionsTarget}
          </span>
        </div>

        {/* F4/F5 — Controls: RESET ghost + primary acid-filled */}
        <div
          className="pomo-controls"
          style={{ display: 'flex', gap: 6 }}
        >
          {/* F4 — RESET dispatches pomo.cancel */}
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
          {/* F5 — Primary: START / PAUSE / SKIP BREAK */}
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

// F9 — inline settings panel; lives inside the PomoNode body, no modal.
// Each numeric input commits on blur or Enter via the corresponding command.
function PomoSettingsPanel({
  cfg,
  disabled,
  onChange,
}: {
  cfg: PomoConfig;
  disabled: boolean;
  onChange: (command: string, key: 'minutes' | 'count') => (value: number) => void;
}) {
  const fieldStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 56px',
    alignItems: 'center',
    gap: 8,
    fontFamily: 'var(--font-mono)',
    fontSize: 10.5,
    color: 'var(--ink-3)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  };
  const inputStyle: React.CSSProperties = {
    background: 'var(--paper-2)',
    border: '1px solid var(--paper-3)',
    color: 'var(--ink)',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    padding: '4px 6px',
    borderRadius: 3,
    width: '100%',
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  };

  const commitOnEnterOrBlur =
    (handler: (value: number) => void) =>
    (e: React.KeyboardEvent<HTMLInputElement> | React.FocusEvent<HTMLInputElement>) => {
      if ('key' in e) {
        if (e.key !== 'Enter') return;
      }
      const v = Number((e.currentTarget as HTMLInputElement).value);
      handler(v);
    };

  return (
    <div
      data-testid="pomo-settings-panel"
      style={{
        padding: '10px 18px',
        borderBottom: '1px solid var(--paper-2)',
        display: 'grid',
        gap: 8,
        background: 'var(--paper)',
      }}
    >
      <div style={fieldStyle}>
        <span>session min</span>
        <input
          type="number"
          min={1}
          defaultValue={cfg.defaultDurationMin}
          disabled={disabled}
          data-testid="pomo-setting-session"
          style={inputStyle}
          onKeyDown={commitOnEnterOrBlur(onChange('pomo.setDuration', 'minutes'))}
          onBlur={commitOnEnterOrBlur(onChange('pomo.setDuration', 'minutes'))}
        />
      </div>
      <div style={fieldStyle}>
        <span>break min</span>
        <input
          type="number"
          min={1}
          defaultValue={cfg.defaultBreakMin}
          disabled={disabled}
          data-testid="pomo-setting-break"
          style={inputStyle}
          onKeyDown={commitOnEnterOrBlur(onChange('pomo.setBreak', 'minutes'))}
          onBlur={commitOnEnterOrBlur(onChange('pomo.setBreak', 'minutes'))}
        />
      </div>
      <div style={fieldStyle}>
        <span>long break min</span>
        <input
          type="number"
          min={1}
          defaultValue={cfg.longBreakMin}
          disabled={disabled}
          data-testid="pomo-setting-longBreak"
          style={inputStyle}
          onKeyDown={commitOnEnterOrBlur(onChange('pomo.setLongBreak', 'minutes'))}
          onBlur={commitOnEnterOrBlur(onChange('pomo.setLongBreak', 'minutes'))}
        />
      </div>
      <div style={fieldStyle}>
        <span>long break every</span>
        <input
          type="number"
          min={1}
          defaultValue={cfg.longBreakEvery}
          disabled={disabled}
          data-testid="pomo-setting-longBreakEvery"
          style={inputStyle}
          onKeyDown={commitOnEnterOrBlur(onChange('pomo.setLongBreakEvery', 'count'))}
          onBlur={commitOnEnterOrBlur(onChange('pomo.setLongBreakEvery', 'count'))}
        />
      </div>
    </div>
  );
}

export default PomoNode;
