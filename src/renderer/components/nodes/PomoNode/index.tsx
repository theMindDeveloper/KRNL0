import { useEffect, useState } from 'react';
import { NumberStepper } from '../../ui/NumberStepper';
import type { NodeProps } from '../types';
import type { PomoConfig, PomoState, TimerFace } from './types';
import { defaultPomoConfig } from './types';
import { MotherFrame, MOTHER_WIDTH, MOTHER_TOTAL } from '../MotherFrame';
import { useBoardStore } from '../../../store/boardStore';
import { useShallow } from 'zustand/react/shallow';
import type { TaskState, TaskKind } from '../TaskNode/types';
import { breakdownPomoTime } from '../../../store/pomoSchedule';
import { Ascii } from './variants/Ascii';
import { Lcd } from './variants/Lcd';
import { Blocks } from './variants/Blocks';
import { Vapor } from './variants/Vapor';

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
  if (status === 'running' || status === 'break' || status === 'paused') {
    return Math.max(0, Math.min(100, (remainingMs / totalMs) * 100));
  }
  return status === 'idle' ? 100 : 0;
}

/** Label for the primary action button (F5). */
export function primaryButtonLabel(status: PomoState['status']): string {
  switch (status) {
    case 'running': return 'PAUSE';
    case 'paused':  return 'RESUME';
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
  // Only runs while running or break — NOT while paused (frozen display).
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

  // A.4 — paused: elapsedMs reads from the frozen checkpoint
  const elapsedMs =
    state.status === 'paused'
      ? state.pausedElapsedMs
      : (state.status === 'running' || state.status === 'break') && state.startedAt !== null
        ? Date.now() - Date.parse(state.startedAt)
        : 0;
  const remainingMs = totalMs - elapsedMs;

  // F7 — auto-dispatch pomo.complete when timer hits zero
  useEffect(() => {
    if (state.status === 'running' && remainingMs <= 0) onCommand('pomo.complete');
  }, [state.status, remainingMs, onCommand]);

  const isTaskMode = state.activeTaskId !== null;

  // Decision 22 §4 + F10 + A.6 — derive plannedSessions from the active task's
  // plannedMin, and also read that task's pomoSessionsCompleted for the per-task counter.
  // Also expose kind for event-vs-focus rendering decisions.
  const { activeTaskPlannedMin, activeTaskPomoSessionsCompleted, activeTaskKind } = useBoardStore(
    useShallow((s) => {
      const id = state.activeTaskId;
      if (!id || !s.board) {
        return {
          activeTaskPlannedMin: null,
          activeTaskPomoSessionsCompleted: 0,
          activeTaskKind: 'focus' as TaskKind,
        };
      }
      const t = s.board.nodes.find((n) => n.id === id);
      if (!t) {
        return {
          activeTaskPlannedMin: null,
          activeTaskPomoSessionsCompleted: 0,
          activeTaskKind: 'focus' as TaskKind,
        };
      }
      const ts = t.state as TaskState;
      return {
        activeTaskPlannedMin: ts.plannedMin ?? null,
        activeTaskPomoSessionsCompleted: ts.pomoSessionsCompleted ?? 0,
        activeTaskKind: (ts.kind ?? 'focus') as TaskKind,
      };
    }),
  );

  const isEventTask = isTaskMode && activeTaskKind === 'event';

  const pipCount = isTaskMode && activeTaskPlannedMin
    ? (isEventTask
        ? 1
        : Math.max(1, Math.ceil(activeTaskPlannedMin / config.sessionMin)))
    : config.longBreakEvery;

  // Three-numbers breakdown for the active task (Decision 28 follow-up).
  // Computed from the current PomoConfig so it tracks gear edits live.
  // For events: workMin = plannedMin, breakMin = 0.
  const taskBreakdown = isTaskMode && activeTaskPlannedMin
    ? (isEventTask
        ? { workMin: activeTaskPlannedMin, breakMin: 0, effectiveMin: activeTaskPlannedMin }
        : breakdownPomoTime(activeTaskPlannedMin, 0, config))
    : null;

  // A.6 — when in task mode, use the per-task session counter
  const sessionsForDisplay = isTaskMode
    ? activeTaskPomoSessionsCompleted
    : state.sessionsCompleted;
  const completedDots = sessionsForDisplay % pipCount;

  // F5 — context-driven primary button (A.3)
  const handlePrimary = () => {
    if (state.status === 'idle' || state.status === 'done') onCommand('pomo.start');
    else if (state.status === 'running') onCommand('pomo.pause');
    else if (state.status === 'paused') onCommand('pomo.resume');
    else if (state.status === 'break') onCommand('pomo.skipBreak');
  };
  // F4 — RESET always dispatches pomo.cancel (FSM guards the actual transition)
  const handleReset = () => onCommand('pomo.cancel');

  const buttonLabel = primaryButtonLabel(state.status);

  // F1 — liquid fill height tracks remaining time
  const remainingPct = calcRemainingPct(state.status, remainingMs, totalMs);
  // Elapsed pct — used by Ring/Blocks/Ascii variants
  const elapsedPct = 100 - remainingPct;

  const clockText = state.status === 'idle' || state.status === 'done'
    ? formatRemaining(state.durationMin * 60_000)
    : formatRemaining(remainingMs);
  const [mm, ss] = clockText.split(':') as [string, string];

  // F3 — running flag for variants that animate a blinking colon
  const running = state.status === 'running';

  // PR4 — active face. When the user hasn't explicitly picked a face,
  // pick a default per theme: 'blocks' on light, 'vapor' on dark. The
  // user's explicit choice is preserved across theme toggles since we
  // only fall back when config.face is undefined.
  const themeIsDark =
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-theme') === 'dark';
  const defaultFace: TimerFace = themeIsDark ? 'vapor' : 'blocks';
  const activeFace: TimerFace = config.face ?? defaultFace;

  const headerLeft = isTaskMode
    ? `TASK · ${truncate(state.label || 'task', 18)}`
    : 'DEEP WORK';
  const headerRight = isTaskMode ? '· ACTIVE' : '· POMO.025';

  // A.2 — gear disabled while session is in-flight (running, paused, break)
  const gearDisabled = state.status !== 'idle' && state.status !== 'done';

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
    (val: number) => setDraftConfig((d) => ({ ...d, [key]: val }));

  // A.5 — pip cap: show at most 8 pips; append "+N more" when pipCount > 8
  const MAX_PIPS = 8;
  const visiblePipCount = Math.min(pipCount, MAX_PIPS);
  const overflowPips = pipCount > MAX_PIPS ? pipCount - MAX_PIPS : 0;

  return (
    <MotherFrame nodeId={node.id} slotIndex={slotIndex} slotTotal={slotTotal} width={MOTHER_WIDTH} position={node.position}>
      {/* vapor-rise and pomo-blink keyframes are globally defined in tokens.css (PR1/PR4) */}
      <style>{`
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
        .pomo-gear-btn:hover:not(:disabled) {
          color: var(--acid);
          border-color: var(--acid);
        }
        .pomo-gear-btn:disabled {
          opacity: 0.35;
          cursor: not-allowed;
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

      `}</style>

      {/* Header — title + bullet + gear (A.1: gear is last flex child = right side) */}
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
        {/* A.1 — spacer pushes gear to the right */}
        <span style={{ flex: 1 }} />
        {/* A.2 — Decision 22 F9 — Gear icon, disabled while session in-flight */}
        <button
          type="button"
          className="pomo-gear-btn"
          data-testid="pomo-gear"
          aria-label={gearOpen ? 'Close settings' : 'Open settings'}
          title={gearDisabled ? 'Stop session to edit settings' : undefined}
          disabled={gearDisabled}
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
          ] as Array<[Exclude<keyof PomoConfig, 'face'>, string]>).map(([key, label]) => (
            <div key={key} className="pomo-settings-row">
              <span className="pomo-settings-label">{label}</span>
              <NumberStepper
                value={draftConfig[key] as number}
                onChange={updateDraft(key)}
                min={1}
                max={key === 'longBreakEvery' ? 12 : 120}
                testId={`pomo-settings-${key}`}
              />
            </div>
          ))}

          {/* PR4 — face picker: 5 segmented buttons, one per variant */}
          <div
            className="pomo-settings-row"
            style={{ marginTop: 8, borderTop: '1px dashed var(--paper-3)', paddingTop: 10 }}
          >
            <span className="pomo-settings-label">Timer face</span>
          </div>
          <div
            data-testid="pomo-face-picker"
            style={{ display: 'flex', gap: 4, marginBottom: 4 }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {(['ascii', 'lcd', 'blocks', 'vapor'] as const).map((face) => {
              const isActive = (config.face ?? defaultFace) === face;
              return (
                <button
                  key={face}
                  type="button"
                  data-testid={`pomo-face-${face}`}
                  aria-pressed={isActive}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCommand('pomo.setFace', { face });
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  style={{
                    flex: 1,
                    padding: '5px 2px',
                    background: isActive ? 'var(--rust)' : 'transparent',
                    color: isActive ? 'var(--paper)' : 'var(--ink-3)',
                    border: `1px solid ${isActive ? 'var(--rust)' : 'var(--paper-3)'}`,
                    borderRadius: 4,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    cursor: 'pointer',
                    letterSpacing: '0.02em',
                    textTransform: 'uppercase',
                    transition: 'background 0.12s, color 0.12s, border-color 0.12s',
                  }}
                >
                  {face}
                </button>
              );
            })}
          </div>

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
                background: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-fg)',
                border: 'none',
                borderRadius: 5,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                boxShadow: '0 0 0 1px var(--btn-primary-ring)',
              }}
            >
              SAVE
            </button>
          </div>
        </div>
      ) : (
        <div style={{ padding: '18px 18px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* PR4 — timer face switch: swap inner face without touching outer chrome */}
          {activeFace === 'ascii' && (
            <Ascii m={mm} s={ss} elapsedPct={elapsedPct} remainingPct={remainingPct} running={running} />
          )}
          {activeFace === 'lcd' && (
            <Lcd m={mm} s={ss} elapsedPct={elapsedPct} remainingPct={remainingPct} running={running} />
          )}
          {activeFace === 'blocks' && (
            <Blocks m={mm} s={ss} elapsedPct={elapsedPct} remainingPct={remainingPct} running={running} />
          )}
          {activeFace === 'vapor' && (
            <Vapor m={mm} s={ss} elapsedPct={elapsedPct} remainingPct={remainingPct} running={running} />
          )}

          <div
            className="pomo-pips"
            data-testid="pomo-pips"
            style={{ display: 'flex', gap: 8, justifyContent: 'flex-start', alignItems: 'center', flexWrap: 'nowrap', marginTop: 10 }}
          >
            {/* A.5 — render at most 8 pips */}
            {Array.from({ length: visiblePipCount }).map((_, i) => {
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
                    flexShrink: 0,
                  }}
                />
              );
            })}
            {/* A.5 — overflow indicator */}
            {overflowPips > 0 && (
              <span
                data-testid="pomo-pips-overflow"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9.5,
                  color: 'var(--ink-3)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  flexShrink: 0,
                }}
              >
                +{overflowPips} more
              </span>
            )}
            <span style={{
              marginLeft: 'auto',
              fontFamily: 'var(--font-mono)',
              fontSize: 9.5,
              color: 'var(--ink-3)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}>
              session {sessionsForDisplay} / {pipCount}
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
                background: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-fg)',
                border: 'none',
                borderRadius: 5,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                boxShadow: '0 0 0 1px var(--btn-primary-ring)',
              }}
            >
              {buttonLabel}
            </button>
          </div>

          {/* Three-numbers breakdown — work / break / total — for the active task.
              Hidden in free-pomo mode (no active task). Updates live as PomoConfig changes. */}
          {taskBreakdown !== null && (
            <div
              data-testid="pomo-breakdown"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-mono)',
                fontSize: 9.5,
                color: 'var(--ink-3)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginTop: 4,
                paddingTop: 8,
                borderTop: '1px dashed var(--paper-3)',
              }}
            >
              <span data-testid="pomo-breakdown-work">
                <span style={{ color: 'var(--ink-4)' }}>WORK </span>
                <span style={{ color: 'var(--ink-2)' }}>{taskBreakdown.workMin}m</span>
              </span>
              <span data-testid="pomo-breakdown-break">
                <span style={{ color: 'var(--ink-4)' }}>BREAK </span>
                <span style={{ color: 'var(--ink-2)' }}>{taskBreakdown.breakMin}m</span>
              </span>
              <span data-testid="pomo-breakdown-total">
                <span style={{ color: 'var(--ink-4)' }}>TOTAL </span>
                <span style={{ color: 'var(--acid)' }}>{taskBreakdown.effectiveMin}m</span>
              </span>
            </div>
          )}
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
