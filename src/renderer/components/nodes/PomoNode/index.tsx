import { useEffect, useState, useMemo } from 'react';
import type { ChangeEvent } from 'react';
import type { NodeProps } from '../types';
import type { PomoConfig, PomoState } from './types';
import { defaultPomoConfig } from './types';
import { MotherFrame, MOTHER_WIDTH, MOTHER_TOTAL } from '../MotherFrame';
import { useBoardStore } from '../../../store/boardStore';
import type { TaskState } from '../TaskNode/types';

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

/** Pip state for session pip at index i (F6 + Decision 22 derived plannedSessions). */
export function pipState(
  i: number,
  completedDots: number,
  status: PomoState['status'],
): 'done' | 'active' | 'empty' {
  if (i < completedDots) return 'done';
  if (i === completedDots && status === 'running') return 'active';
  return 'empty';
}

export function PomoNode({
  node,
  onCommand,
  slotIndex = 1,
  slotTotal = MOTHER_TOTAL,
  onMoveLeft,
  onMoveRight,
}: NodeProps<PomoState, PomoConfig>) {
  const { state } = node;
  const config = node.config ?? defaultPomoConfig();
  const [, setTick] = useState(0);

  // Gear panel local UI state (Decision 22 F9).
  const [gearOpen, setGearOpen] = useState(false);
  const [draftConfig, setDraftConfig] = useState<PomoConfig>(config);

  useEffect(() => {
    if (!gearOpen) setDraftConfig(config);
  }, [config, gearOpen]);

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

  // F7 — auto-dispatch pomo.complete when timer hits zero
  useEffect(() => {
    if (state.status === 'running' && remainingMs <= 0) onCommand('pomo.complete');
  }, [state.status, remainingMs, onCommand]);

  const isTaskMode = state.activeTaskId !== null;

  // Decision 22 §4 + F10 — derive plannedSessions from the active task's
  // plannedMin. Single-value selector; identity is stable across unrelated
  // store updates so this does NOT cause re-renders on viewport saves etc.
  const activeTaskPlannedMin = useBoardStore((s) => {
    const id = state.activeTaskId;
    if (!id || !s.board) return null;
    const t = s.board.nodes.find((n) => n.id === id);
    return t ? (t.state as TaskState).plannedMin : null;
  });

  const pipCount = isTaskMode && activeTaskPlannedMin
    ? Math.max(1, Math.ceil(activeTaskPlannedMin / config.sessionMin))
    : config.longBreakEvery;
  const completedDots = state.sessionsCompleted % pipCount;

  // F5 — context-driven primary button
  const handlePrimary = () => {
    if (state.status === 'idle' || state.status === 'done') onCommand('pomo.start');
    else if (state.status === 'running') onCommand('pomo.cancel');
    else if (state.status === 'break') onCommand('pomo.skipBreak');
  };
  // F4 — RESET always dispatches pomo.cancel (FSM guards the actual transition)
  const handleReset = () => onCommand('pomo.cancel');

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

  const headerLeft = isTaskMode
    ? `TASK · ${truncate(state.label || 'task', 18)}`
    : 'DEEP WORK';
  const headerRight = isTaskMode ? '· ACTIVE' : '· POMO.025';

  const openGear = () => {
    setDraftConfig(config);
    setGearOpen(true);
  };
  const closeGear = () => setGearOpen(false);

  // Decision 22 F11 — close + clear active task.
  const closeGearAndClearActive = () => {
    setGearOpen(false);
    if (isTaskMode) onCommand('pomo.clearActiveTask');
  };

  const saveGear = () => {
    onCommand('pomo.setConfig', { config: draftConfig });
    setGearOpen(false);
  };

  const updateDraft = (key: keyof PomoConfig) =>
    (e: ChangeEvent<HTMLInputElement>) => {
      const raw = Number(e.target.value);
      const clamped = Number.isFinite(raw) ? Math.max(1, Math.round(raw)) : draftConfig[key];
      setDraftConfig((d) => ({ ...d, [key]: clamped }));
    };

  return (
    <MotherFrame slotIndex={slotIndex} slotTotal={slotTotal} width={MOTHER_WIDTH} onMoveLeft={onMoveLeft} onMoveRight={onMoveRight}>
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
        .pomo-gear-btn {
          background: transparent;
          border: 1px solid var(--paper-3);
          color: var(--ink-3);
          width: 18px;
          height: 18px;
          border-radius: 4px;
          cursor: pointer;
          display: grid;
          place-items: center;
          padding: 0;
          line-height: 1;
        }
        .pomo-gear-btn:hover {
          color: var(--acid);
          border-color: var(--acid);
        }
        .pomo-settings-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 6px 0;
        }
        .pomo-settings-label {
          font-family: var(--font-mono);
          font-size: 10.5px;
          color: var(--ink-2);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .pomo-settings-input {
          width: 56px;
          padding: 4px 6px;
          background: var(--paper);
          border: 1px solid var(--paper-3);
          border-radius: 4px;
          font-family: var(--font-mono);
          font-size: 12px;
          color: var(--ink);
          text-align: right;
          outline: none;
        }
        .pomo-settings-input:focus {
          border-color: var(--acid);
        }
      `}</style>

      {/* Header — gear + bullet + DEEP WORK / TASK */}
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
        {/* Decision 22 F9 — Gear icon */}
        <button
          type="button"
          className="pomo-gear-btn"
          data-testid="pomo-gear"
          aria-label={gearOpen ? 'Close settings' : 'Open settings'}
          onClick={(e) => {
            e.stopPropagation();
            if (gearOpen) closeGearAndClearActive();
            else openGear();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          style={{ fontSize: 11 }}
        >
          {gearOpen ? '✕' : '⚙'}
        </button>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: state.status === 'running'
            ? (isTaskMode ? 'var(--acid)' : 'var(--rust)')
            : 'var(--ink-4)',
        }} />
        <span
          data-testid="pomo-header-label"
          style={{
            color: isTaskMode ? 'var(--acid)' : 'var(--ink-2)',
            fontWeight: 500,
          }}
        >
          {headerLeft}
        </span>
        <span style={{ color: 'var(--ink-3)' }}>{headerRight}</span>
      </div>

      {/* Body — either settings panel OR vapor tube */}
      {gearOpen ? (
        <div
          data-testid="pomo-settings-panel"
          style={{
            padding: '14px 16px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            minHeight: 240,
          }}
        >
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            color: 'var(--ink-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            paddingBottom: 8,
            borderBottom: '1px dashed var(--paper-3)',
          }}>
            settings
          </div>

          {([
            ['sessionMin', 'Session (min)'],
            ['shortBreakMin', 'Short break (min)'],
            ['longBreakMin', 'Long break (min)'],
            ['longBreakEvery', 'Long break every'],
          ] as Array<[keyof PomoConfig, string]>).map(([key, label]) => (
            <div key={key} className="pomo-settings-row">
              <span className="pomo-settings-label">{label}</span>
              <input
                type="number"
                min={1}
                className="pomo-settings-input"
                data-testid={`pomo-settings-${key}`}
                value={draftConfig[key]}
                onChange={updateDraft(key)}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
          ))}

          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <button
              type="button"
              data-testid="pomo-settings-cancel"
              onClick={(e) => { e.stopPropagation(); closeGear(); }}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                flex: 1,
                padding: '8px',
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
              CANCEL
            </button>
            <button
              type="button"
              data-testid="pomo-settings-save"
              onClick={(e) => { e.stopPropagation(); saveGear(); }}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                flex: 1,
                padding: '8px',
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
              SAVE
            </button>
          </div>
        </div>
      ) : (
        <div style={{ padding: '18px 18px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                {isTaskMode
                  ? `${truncate(state.label || 'task', 18)} · phase ${String(state.sessionsCompleted + 1).padStart(2, '0')}`
                  : `${state.label || 'deep work'} · phase 03`}
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

          <div
            className="pomo-pips"
            data-testid="pomo-pips"
            style={{ display: 'flex', gap: 8, justifyContent: 'flex-start' }}
          >
            {Array.from({ length: pipCount }).map((_, i) => {
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
              session {state.sessionsCompleted} / {pipCount}
            </span>
          </div>

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
      )}
    </MotherFrame>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

export default PomoNode;
