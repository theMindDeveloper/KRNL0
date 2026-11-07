import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SettingsIcon } from '../../ui/SettingsIcons';
import { NumberStepper } from '../../ui/NumberStepper';
import type { NodeProps } from '../types';
import type { PomoConfig, PomoState, TimerFace } from './types';
import { TIMER_FACES } from './types';
import { defaultPomoConfig, OBSERVE_SPAN_MIN } from './types';
import { MotherFrame, MOTHER_WIDTH, MOTHER_TOTAL, MotherFrameStationContext } from '../MotherFrame';
import { useBoardStore } from '../../../store/boardStore';
import { useShallow } from 'zustand/react/shallow';
import type { TaskState } from '../TaskNode/types';
import { Ascii } from './variants/Ascii';
import { Lcd } from './variants/Lcd';
import { Blocks } from './variants/Blocks';
import { FaceFit, compactLevelFor } from './FaceFit';
import { Vapor } from './variants/Vapor';
import { Vu } from './variants/Vu';
import { Outline } from './variants/Outline';
import { Mac } from './variants/Mac';
import { useFrameTheme } from '../../../themes/useFrameTheme';
import { AppSelect } from '../../ui/AppSelect';
import { boardTagLibrary, spanTagFor } from '../../../store/spanTags';
import { PomoTimeLinks } from './PomoTimeLinks';
import { DiscardButton } from './DiscardButton';
import { PlannedNowChip } from './PlannedNowChip';
import { SpanLabeler } from './SpanLabeler';
import { decodeTargets, encodeTargets, spanTaskTargets, startOfLocalDayMs } from './taskTargets';
import { DoingPicker, type DoingChoice } from './DoingPicker';
import { SpanLog } from './SpanLog';
import { useEasyMode } from '../../../store/uiMode';
import { ObserveDash } from './ObserveDash';
import { useAwayGap } from './useAwayGap';
import { Switch } from '../../ui/Switch';
import { calcRemainingPct, primaryButtonLabel, primaryTooltip, pipState } from './display';
import { formatRemaining, isObserve, isPromptDone, pomoClock, stopCommand, todayCycles } from './derive';
import { setPocketAway } from '../../../pocket/pocketAway';

const TICK_MS = 500;

/** "18:02" — local wall-clock time of an epoch ms. */
const clockHM = (ms: number): string => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
/** "15h 12m" / "42m". */
const spanText = (ms: number): string => {
  const min = Math.round(ms / 60_000);
  return min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`;
};

export function PomoNode({
  node,
  onCommand,
  slotIndex = 1,
  slotTotal = MOTHER_TOTAL,
}: NodeProps<PomoState, PomoConfig>) {
  const { state } = node;
  const config = node.config ?? defaultPomoConfig();
  const [, setTick] = useState(0);

  // Station mode mounts this inside a resizable panel that's typically much
  // shorter than the canvas 540×540. Tighten paddings and gaps when the
  // MotherFrameStationContext is true so the timer + pips + cycle counter +
  // controls all fit without spilling past the panel's overflow:hidden edge.
  const inStation = useContext(MotherFrameStationContext);
  const bodyPadding = inStation ? '10px 14px 12px' : '18px 18px 16px';
  // A short station slot sheds secondary rows before the face shrinks, so the
  // time and START always show: 1 = no "log past time", 2 = no cycles strip,
  // 3 = no session dots. Set from the slot's height only (no feedback loop).
  // A callback ref: the body remounts when the span log opens and closes.
  const [bodyEl, setBodyEl] = useState<HTMLDivElement | null>(null);
  const [compact, setCompact] = useState(0);
  useLayoutEffect(() => {
    const el = bodyEl;
    if (!inStation || !el || typeof ResizeObserver === 'undefined') { setCompact(0); return; }
    const measure = (): void => {
      const h = el.clientHeight;
      setCompact(compactLevelFor(h));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [inStation, bodyEl]);
  const bodyGap = inStation ? 8 : 14;

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

  // Issue #166 — observer model. Running counts DOWN toward the session
  // threshold (durationMin); break counts UP, open-ended. `sessionWorkSec`
  // carries accumulated work across pause gaps so the threshold is correct.
  // An Observe span leaves the day-long OBSERVE_SPAN_MIN in state until the
  // next Start; Pomodoro mode shows the configured session length meanwhile.
  // derive.ts holds these rules so the pocket window (Decision 37) shares them.
  const clock = pomoClock(state, config, Date.now());
  const { sessionMin, thresholdMs, liveWorkMs, remainingMs, breakElapsedMs } = clock;
  // The "Are you done?" prompt fires once the work threshold is reached. The
  // timer keeps running (arc keeps growing) — NO auto-break, NO auto-stop.
  // Observe mode: no threshold, so no prompt — the timer just counts up.
  // Easy mode is always Observe and never asks, names or links anything.
  const easy = useEasyMode();
  const observe = isObserve(config, easy);
  // Time the app couldn't see (sleep / closed app) is asked about, not booked.
  const { gap: away, dismiss: dismissAway } = useAwayGap(state.status, state.startedAt);
  const promptDone = isPromptDone(observe, away !== null, state.status, clock);
  // The pocket window shows "open KRNL0" instead of controls while this is asked (pocket F11).
  useEffect(() => { setPocketAway(away !== null); }, [away]);

  // Issue #166 slice 5 — OS notification when threshold is first reached.
  // Fires once per transition false→true; uses Web Notification API (works
  // natively in Electron's renderer without extra IPC).
  const prevPromptDone = useRef(false);
  useEffect(() => {
    if (promptDone && !prevPromptDone.current) {
      prevPromptDone.current = true;
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('Pomodoro done?', {
          body: `${state.label || 'Session'} · EXTEND · BREAK · STOP`,
          silent: false,
        });
      } else if (typeof Notification !== 'undefined' && Notification.permission !== 'denied') {
        void Notification.requestPermission().then((perm) => {
          if (perm === 'granted') {
            new Notification('Pomodoro done?', {
              body: `${state.label || 'Session'} · EXTEND · BREAK · STOP`,
              silent: false,
            });
          }
        });
      }
    }
    if (!promptDone) prevPromptDone.current = false;
  }, [promptDone, state.label]);

  // totalMs kept for the face fill pct (work threshold; break shows full).
  const totalMs = thresholdMs;

  // Easy mode has no task links (easy-mode D3): a link left over from
  // Advanced is not shown, and the next START drops it.
  const isTaskMode = !easy && state.activeTaskId !== null;

  // Plan vs reality — pips count the pomo's own completed sessions within the
  // long-break cycle. The tagged task's estimate no longer sets a session
  // quota: the pomo observes, it doesn't plan.
  const pipCount = config.longBreakEvery;
  const sessionsForDisplay = state.sessionsCompleted;
  const completedDots = sessionsForDisplay % pipCount;

  // Tasks the session can be tagged with (what was this time spent on?):
  // open tasks, then tasks done today (#204 — ticking a task done must not
  // make it impossible to keep counting time toward it). Same list builder
  // as the Calendar's retag list.
  const tagOptionKeys = useBoardStore(
    // #207 — any done task can still collect time (pickers show the newest
    // few and search finds the rest).
    useShallow((s) => encodeTargets(spanTaskTargets(s.board?.nodes))),
  );
  const tagOptions = useMemo(() => decodeTargets(tagOptionKeys), [tagOptionKeys]);

  // Today's pomo cycle counter — counts COMPLETED sessions whose endedAt
  // falls on the local date today. A full cycle = `longBreakEvery` sessions
  // (e.g. 4 default), so `cyclesToday = floor(sessionsToday / longBreakEvery)`.
  // Distinct from the per-task pip counter (which is per-task progress).
  const { cyclesToday, sessionsToday, progressToNext } = todayCycles(state.history, config.longBreakEvery, Date.now());

  // Issue #166 — observer-model controls (dispatch the new verbs).
  const handlePrimary = () => {
    if (state.status === 'idle' || state.status === 'done') onCommand('pomo.start');
    else if (state.status === 'running') onCommand('pomo.pause');
    else if (state.status === 'paused') onCommand('pomo.resume');
    else if (state.status === 'break') onCommand('pomo.stop'); // end break → idle
  };
  const handleBreak = () => onCommand('pomo.break');
  // One Stop button: records the session so far, or discards it when
  // "Count stopped sessions" is off in the Pomo settings.
  const handleStop = () => onCommand(stopCommand(observe, config));

  // Observe mode — "what was this?" whenever a work span closes (Stop or
  // Break) untagged: free text + a tag (ADR 0016). A span already tagged with
  // a task needs no question. The row sits above the controls, so the timer
  // stays usable while it is open.
  const lastRec = state.history[state.history.length - 1];
  const prevHistoryLen = useRef(state.history.length);
  const [askId, setAskId] = useState<string | null>(null);
  useEffect(() => {
    const grew = state.history.length > prevHistoryLen.current;
    prevHistoryLen.current = state.history.length;
    // Only unnamed spans are asked about; a continued name/task carries over.
    if (observe && !easy && grew && lastRec && lastRec.kind === 'work' && !lastRec.taskId && !lastRec.label) setAskId(lastRec.id);
  }, [observe, easy, state.history.length, lastRec]);
  const askRec = askId ? state.history.find((r) => r.id === askId) : undefined;
  const tagLibrary = useBoardStore((s) => boardTagLibrary(s.board));
  // Observe mode — what is being recorded (carried across breaks and stops),
  // what Continue resumes, and recent names to pick from instead.
  const doing: DoingChoice | null = !observe || easy ? null
    : state.activeTaskId ? { label: state.label || 'task', tag: null, taskId: state.activeTaskId }
    : state.label ? { label: state.label, tag: state.tag ?? null, taskId: null } : null;
  const continueName = doing?.label ?? '';
  const recents: DoingChoice[] = [];
  if (observe) {
    const seen = new Set<string>();
    for (let i = state.history.length - 1; i >= 0 && recents.length < 8; i--) {
      const r = state.history[i]!;
      if (r.kind === 'break' || (!r.taskId && !r.label)) continue;
      const key = r.taskId ?? `${r.label}|${r.tag ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      recents.push({ label: r.label || 'task', tag: r.taskId ? null : r.tag ?? null, taskId: r.taskId ?? null });
    }
  }
  const guessCategory = (text: string) => spanTagFor(useBoardStore.getState().board, text);
  const taskName = (id: string) => {
    const n = useBoardStore.getState().board?.nodes.find((x) => x.id === id);
    return n ? (n.state as TaskState).text : undefined;
  };
  // Span log view (every recorded span of a day, with delete).
  const [logOpen, setLogOpen] = useState(false);

  const handleExtend = () => onCommand('pomo.extend');

  const buttonLabel = primaryButtonLabel(state.status);

  const ghostBtnStyle: React.CSSProperties = {
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
  };
  const primaryBtnStyle: React.CSSProperties = {
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
  };
  const iconBtnStyle: React.CSSProperties = {
    ...ghostBtnStyle,
    flex: '0 0 42px',
    padding: 0,
    height: 38,
    display: 'grid',
    placeItems: 'center',
  };
  const primaryIconBtnStyle: React.CSSProperties = {
    ...primaryBtnStyle,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 38,
    padding: '0 12px',
  };
  const stopTitle = config.countStopped === false
    ? 'Stop — end and discard this session (change in Pomo settings)'
    : 'Stop — end and record this session';

  // F1 — liquid fill height tracks remaining time
  // Faces only render in Pomodoro mode; their scale is the session length.
  // Observe mode shows a plain count-up of the current span instead.
  const observedMs = state.status === 'break' ? breakElapsedMs : liveWorkMs;
  const faceTotalMin = sessionMin;
  const remainingPct = calcRemainingPct(state.status, remainingMs, totalMs);
  // Elapsed pct — used by Ring/Blocks/Ascii variants
  const elapsedPct = 100 - remainingPct;

  const clockText = state.status === 'idle' || state.status === 'done'
    ? formatRemaining(sessionMin * 60_000)
    : state.status === 'break'
      ? formatRemaining(breakElapsedMs) // break counts UP, open-ended
      : formatRemaining(remainingMs);
  const [mm, ss] = clockText.split(':') as [string, string];

  // F3 — running flag for variants that animate a blinking colon
  const running = state.status === 'running';

  // PR4 — active face. When the user hasn't explicitly picked a face,
  // pick a default per theme: 'blocks' on light, 'vapor' on dark. The
  // user's explicit choice is preserved across theme toggles since we
  // only fall back when config.face is undefined.
  // ADR 0009 F7 — a frame style may name its own default face; the user's
  // explicit config.face still always wins.
  const { mode: frameMode, manifest: frameManifest } = useFrameTheme();
  const themeIsDark = frameMode === 'dark';
  const defaultFace: TimerFace = frameManifest.components.pomo.face ?? (themeIsDark ? 'vapor' : 'blocks');
  const activeFace: TimerFace = config.face ?? defaultFace;

  const headerLeft = isTaskMode
    ? `ON · ${truncate(state.label || 'task', 18)}`
    : observe ? 'TIME LOG' : 'DEEP WORK';
  const headerRight = observe
    ? (state.status === 'break' ? '· BREAK' : '')
    : isTaskMode ? '· TAGGED' : `· POMO.${String(sessionMin).padStart(3, '0')}`;

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
    // Mode is set live by its own toggle — don't let a stale draft revert it.
    const { mode: _mode, ...rest } = draftConfig;
    void _mode;
    onCommand('pomo.setConfig', { config: rest });
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
      <div className="krnl-node-header"
        style={{
          padding: '7px 12px 6px',
          borderBottom: '1px solid var(--paper-2)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
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
            color: isTaskMode ? 'var(--acid-ink, var(--acid))' : 'var(--ink-2)',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {headerLeft}
        </span>
        {/* The session code gives way first: one line, never wrapped. */}
        <span style={{ color: 'var(--ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{headerRight}</span>
        {/* A.1 — spacer pushes gear to the right */}
        <span style={{ flex: 1 }} />
        {/* Span log — every recorded span, to find and delete misclicks. */}
        <button
          type="button"
          className="pomo-gear-btn"
          data-testid="pomo-log-toggle"
          aria-pressed={logOpen}
          title={logOpen ? 'Back to the timer' : 'Recorded spans — see and delete them'}
          onClick={(e) => { e.stopPropagation(); setGearOpen(false); setLogOpen((o) => !o); }}
          onMouseDown={(e) => e.stopPropagation()}
          style={{ fontSize: 11, width: 'auto', padding: '0 5px', ...(logOpen ? { color: 'var(--acid-ink, var(--acid))', borderColor: 'var(--acid-ink, var(--acid))' } : {}) }}
        >
          {logOpen ? <SettingsIcon name="close" size={12} /> : <SettingsIcon name="menu" size={12} />}
        </button>
        {/* Mode switch — Pomodoro rhythm, or just observe where the time goes.
            Locked while a span is in flight, like the gear. Hidden in Easy mode. */}
        {!easy && <div
          role="group"
          aria-label="Pomo mode"
          // Never shrinks: the title on the left gives way instead.
          style={{ display: 'flex', border: '1px solid var(--paper-3)', borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {(['pomodoro', 'observe'] as const).map((m) => {
            const active = (config.mode ?? 'pomodoro') === m;
            return (
              <button
                key={m}
                type="button"
                data-testid={`pomo-mode-${m}`}
                aria-pressed={active}
                disabled={gearDisabled && !active}
                title={gearDisabled
                  ? 'Stop the current span to switch mode'
                  : m === 'observe'
                    ? 'Observe — Start, Break, Stop. No session length or pips; tag what you did when a span ends.'
                    : 'Pomodoro — sessions, breaks, pips'}
                onClick={(e) => { e.stopPropagation(); if (!active) onCommand('pomo.setConfig', { config: { mode: m } }); }}
                style={{
                  padding: '2px 7px',
                  flexShrink: 0,
                  // rust-deep: the paper-coloured label stays readable in light mode.
                  background: active ? 'var(--rust-deep, var(--rust))' : 'transparent',
                  color: active ? 'var(--paper)' : 'var(--ink-3)',
                  border: 'none',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  letterSpacing: '0.01em',
                  whiteSpace: 'nowrap',
                  cursor: gearDisabled ? 'not-allowed' : 'pointer',
                  opacity: gearDisabled && !active ? 0.4 : 1,
                }}
              >
                {m === 'pomodoro' ? 'POMO' : 'OBSERVE'}
              </button>
            );
          })}
        </div>}
        {/* A.2 — Decision 22 F9 — Gear icon, disabled while session in-flight.
            Observe (and Easy) has no session settings, so no gear there. */}
        {!observe && <button
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
          {gearOpen ? <SettingsIcon name="close" size={12} /> : <SettingsIcon name="settings" size={12} />}
        </button>}
      </div>

      {/* Body — either settings panel OR vapor tube */}
      {gearOpen && !observe ? (
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
            fontSize: 11,
            color: 'var(--ink-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            paddingBottom: 8,
            borderBottom: '1px dashed var(--paper-3)',
          }}>
            settings
          </div>

          {!observe && ([
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

          {/* Does Stop record the session so far? (one Stop button either way) */}
          {!observe && <div className="pomo-settings-row">
            <span className="pomo-settings-label" title="On: Stop records the work so far. Off: Stop discards the session.">Count stopped sessions</span>
            <Switch
              checked={config.countStopped !== false}
              testId="pomo-settings-countStopped"
              onChange={(on) => onCommand('pomo.setConfig', { config: { countStopped: on } })}
            />
          </div>}

          {!observe && (<>
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
            {(['auto', ...TIMER_FACES] as const).map((face) => {
              // 'auto' = no saved face: the frame style picks (ADR 0009 F7).
              const isActive = face === 'auto' ? config.face === undefined : config.face === face;
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
                    background: isActive ? 'var(--rust-deep, var(--rust))' : 'transparent',
                    color: isActive ? 'var(--paper)' : 'var(--ink-3)',
                    border: `1px solid ${isActive ? 'var(--rust-deep, var(--rust))' : 'var(--paper-3)'}`,
                    borderRadius: 4,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
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

          </>)}
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
      ) : logOpen ? (
        <div style={{ padding: bodyPadding }}>
          <SpanLog
            history={state.history}
            library={tagLibrary}
            taskName={taskName}
            onDelete={(id) => onCommand('pomo.deleteSegment', { id })}
            {...(easy ? {} : { onName: (id: string) => { setAskId(id); setLogOpen(false); } })}
          />
          {/* DEV-only (#180) — record a finished 30-min span ending now, to try
              the "log this span" flow without waiting. Not in production builds. */}
          {import.meta.env.DEV && (
            <button
              type="button"
              data-testid="pomo-dev-demo"
              onClick={() => { onCommand('pomo.devSeedSegment', { kind: 'work', minutes: 30, agoMin: 0, label: '' }); setLogOpen(false); }}
              onMouseDown={(e) => e.stopPropagation()}
              style={{ marginTop: 8, width: '100%', padding: '5px', background: 'transparent', border: '1px dashed var(--ink-4)', borderRadius: 4, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em' }}
            >
              dev · + 30 min demo span
            </button>
          )}
        </div>
      ) : (
        <div ref={setBodyEl} style={{ padding: bodyPadding, display: 'flex', flexDirection: 'column', gap: bodyGap, ...(inStation ? { flex: '1 1 auto', minHeight: 0 } : {}) }}>
          {/* PR4 — timer face switch: swap inner face without touching outer chrome.
              In a station slot the face is fitted to the room left, so the
              controls below it (START, task) are never cut off. */}
          <FaceWrap fit={inStation}>
          {observe ? (
            <ObserveDash state={state} liveMs={observedMs} library={tagLibrary} nowMs={Date.now()} plain={easy} />
          ) : (<>
          {activeFace === 'ascii' && (
            <Ascii m={mm} s={ss} elapsedPct={elapsedPct} remainingPct={remainingPct} total={faceTotalMin} running={running} />
          )}
          {activeFace === 'lcd' && (
            <Lcd m={mm} s={ss} elapsedPct={elapsedPct} remainingPct={remainingPct} total={faceTotalMin} running={running} />
          )}
          {activeFace === 'blocks' && (
            <Blocks m={mm} s={ss} elapsedPct={elapsedPct} remainingPct={remainingPct} total={faceTotalMin} running={running} />
          )}
          {activeFace === 'vapor' && (
            <Vapor m={mm} s={ss} elapsedPct={elapsedPct} remainingPct={remainingPct} total={faceTotalMin} running={running} />
          )}
          {activeFace === 'vu' && (
            <Vu m={mm} s={ss} elapsedPct={elapsedPct} remainingPct={remainingPct} total={faceTotalMin} running={running} />
          )}
          {activeFace === 'outline' && (
            <Outline m={mm} s={ss} elapsedPct={elapsedPct} remainingPct={remainingPct} total={faceTotalMin} running={running} />
          )}
          {activeFace === 'mac' && (
            <Mac m={mm} s={ss} elapsedPct={elapsedPct} remainingPct={remainingPct} total={faceTotalMin} running={running} />
          )}
          </>)}
          </FaceWrap>

          {/* Today's full-cycle counter — distinct visual from the session pips
              (squares + numeric badge + acid glow) so it reads as "achievement"
              not "in-progress session". Always rendered so the user gets a
              live count even at 0 cycles. Tooltip carries the breakdown. */}
          {observe ? null : (<>
          {compact < 2 && <CycleCounter
            cyclesToday={cyclesToday}
            sessionsToday={sessionsToday}
            progressToNext={progressToNext}
            longBreakEvery={config.longBreakEvery}
          />}

          {compact < 3 && <div
            className="pomo-pips"
            data-testid="pomo-pips"
            style={{ display: 'flex', gap: 4, justifyContent: 'flex-start', alignItems: 'center', flexWrap: 'nowrap', marginTop: 10 }}
          >
            {/* Pips — reality readout only. Filled = completed session, no
                pre-planned break lines. Issue #166: plan stripped, keep reality. */}
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
                    boxShadow: ps === 'active' ? '0 0 0 3px color-mix(in srgb, var(--rust) 16%, transparent)' : 'none',
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
                  fontSize: 11,
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
              fontSize: 11,
              color: 'var(--ink-3)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}>
              session {sessionsForDisplay} / {pipCount}
            </span>
          </div>}
          </>)}

          {/* Issue #166 — observer-model controls. Every control carries a
              hover tooltip (#6) explaining exactly what it does:
                STOP  = record this session & end (kept work counts)
                RESET = discard, record NOTHING (#2 — only mid-session)
                BREAK = switch to a break (records the work so far)
                PAUSE = step away; away-time is excluded from the record
                EXTEND= keep going, count this pomodoro, start a fresh span
                SKIP BREAK = record the break up to now → ready for next session
              At the work threshold a prompt offers EXTEND / BREAK / STOP.
              RESET is intentionally absent when idle/done (nothing to reset). */}
          {/* Plan vs reality — what is this time being spent on? The tag is
              only a label on the recorded spans; changing it never resets
              the timer, and recorded spans can be retagged later from the
              Calendar/Clock. Starting untagged suggests the task planned now. */}
          {/* Observe mode — pick what you're doing (recent, a task, or new);
              Start / Continue / Back to work record it. */}
          {observe && !easy && !askRec && (
            <DoingPicker
              caption={state.status === 'running' ? 'doing' : 'next'}
              current={doing}
              recents={recents}
              tasks={tagOptions}
              library={tagLibrary}
              onPick={(c) => c.taskId
                ? onCommand('pomo.tag', { taskId: c.taskId })
                : onCommand('pomo.setLiveLabel', { label: c.label, ...(c.tag ? { tag: c.tag } : {}) })}
              onClear={() => onCommand('pomo.tag', { taskId: null })}
            />
          )}
          {!observe && (
          <label
            data-testid="pomo-tag"
            title="Link a task: time recorded from now counts toward that task (and its category). It never controls the timer."
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 8px',
              border: `1px solid ${isTaskMode ? 'var(--acid)' : 'var(--paper-3)'}`,
              borderRadius: 5,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: '0.06em',
              color: 'var(--ink-3)',
            }}
          >
            <span aria-hidden style={{ color: isTaskMode ? 'var(--acid-ink, var(--acid))' : 'var(--ink-3)', lineHeight: 0 }}><SettingsIcon name={isTaskMode ? 'finished' : 'box'} size={12} /></span>
            <span>TASK</span>
            <AppSelect
              ariaLabel="Link this session to a task"
              testId="pomo-tag-select"
              value={state.activeTaskId ?? ''}
              onChange={(v) => onCommand('pomo.tag', { taskId: v === '' ? null : v })}
              options={[
                { value: '', label: 'no task (optional)' },
                ...(state.activeTaskId !== null && !tagOptions.some((o) => o.id === state.activeTaskId)
                  ? [{ value: state.activeTaskId, label: state.label || 'task' }]
                  : []),
                // The running session can only be on an open task (a done one is reopened first).
                ...tagOptions.filter((o) => !o.done).map((o) => ({ value: o.id, label: truncate(o.text, 28) })),
              ]}
              style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', fontSize: 11, padding: '2px 0' }}
            />
          </label>
          )}

          {askRec && (
            <SpanLabeler
              key={askRec.id}
              minutes={Math.round((Date.parse(askRec.endedAt) - Date.parse(askRec.startedAt)) / 60_000)}
              initialText={askRec.label}
              tasks={tagOptions}
              library={tagLibrary}
              guess={guessCategory}
              onSave={(l) => {
                onCommand('pomo.retagSegment', 'taskId' in l
                  ? { id: askRec.id, taskId: l.taskId }
                  : { id: askRec.id, taskId: null, label: l.text, ...(l.tag ? { tag: l.tag } : {}) });
                // The latest span's label becomes what's being done now, so
                // continuing doesn't ask again. Renaming an older span from the log doesn't.
                const latestWork = [...state.history].reverse().find((r) => r.kind === 'work');
                if (latestWork?.id === askRec.id) {
                  if ('taskId' in l) onCommand('pomo.tag', { taskId: l.taskId });
                  else onCommand('pomo.setLiveLabel', { label: l.text, ...(l.tag ? { tag: l.tag } : {}) });
                }
                setAskId(null);
              }}
              onSkip={() => setAskId(null)}
              onAddCategory={(label) => onCommand('pomo.addCategory', { label })}
            />
          )}

          {/* time-model F5 (#207): suggest the task planned for now; one click, never silent. */}
          {!away && <PlannedNowChip state={state} easy={easy} onCommand={onCommand} />}

          {/* Observe mode: Start → (Break ⇄ Back to work) → Stop. Work and
              breaks are both recorded spans; there is no pause. */}
          {away ? (
            <div
              data-testid="pomo-away"
              className="pomo-controls"
              style={{
                display: 'flex', flexDirection: 'column', gap: 6, padding: '8px',
                border: '1px solid var(--rust)', borderRadius: 6,
                background: 'color-mix(in srgb, var(--rust) 8%, transparent)',
              }}
            >
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--ink)', textAlign: 'center', letterSpacing: '0.04em' }}>
                AWAY {clockHM(away.fromMs)}–{clockHM(away.toMs)} · {spanText(away.toMs - away.fromMs)}
              </span>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--ink-3)', textAlign: 'center' }}>
                The {state.status === 'break' ? 'break' : 'timer'} kept running. Count that time?
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" data-testid="pomo-away-keep" onClick={dismissAway} style={ghostBtnStyle} title="Keep the whole span as recorded">
                  COUNT IT
                </button>
                <button
                  type="button"
                  data-testid="pomo-away-stop"
                  onClick={() => { onCommand('pomo.stop', { atMs: away.fromMs }); dismissAway(); }}
                  style={primaryBtnStyle}
                  title="Record the span up to when you left, and stop"
                >
                  STOP AT {clockHM(away.fromMs)}
                </button>
              </div>
            </div>
          ) : observe && state.status !== 'paused' ? (
            <div className="pomo-controls" style={{ display: 'flex', gap: 6 }}>
              {state.status === 'running' && (
                <button type="button" data-testid="pomo-break" onClick={handleBreak} className="pomo-btn ghost" style={{ ...ghostBtnStyle, height: 38 }} title="Break — records the work so far, then times your break">
                  BREAK
                </button>
              )}
              {/* After a break or a stop: carry on with what you were doing, or
                  start something new (asked about when it ends). */}
              {state.status === 'break' && continueName && (
                <button
                  type="button"
                  data-testid="pomo-new"
                  onClick={() => { onCommand('pomo.tag', { taskId: null }); onCommand('pomo.resume'); }}
                  className="pomo-btn ghost"
                  style={{ ...ghostBtnStyle, flex: '0 0 auto', height: 38, padding: '0 12px' }}
                  title="Start something new — you'll be asked what it was when it ends"
                >
                  NEW
                </button>
              )}
              {state.status === 'break' && (
                <button
                  type="button"
                  data-testid="pomo-resume"
                  onClick={() => onCommand('pomo.resume')}
                  className="pomo-btn ghost"
                  style={{ ...ghostBtnStyle, height: 38, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={continueName ? `Back to "${continueName}" — records the break` : 'Back to work — records the break, starts a new work span'}
                >
                  {continueName ? `BACK TO ${truncate(continueName, 14)}` : 'BACK TO WORK'}
                </button>
              )}
              {(state.status === 'idle' || state.status === 'done') && continueName && (
                <button
                  type="button"
                  data-testid="pomo-new"
                  onClick={() => { onCommand('pomo.tag', { taskId: null }); onCommand('pomo.start'); }}
                  className="pomo-btn ghost"
                  style={{ ...ghostBtnStyle, flex: '0 0 auto', height: 38, padding: '0 14px' }}
                  title="Start something new — you'll be asked what it was when it ends"
                >
                  NEW
                </button>
              )}
              <button
                type="button"
                data-testid="pomo-primary"
                onClick={state.status === 'running' || state.status === 'break' ? handleStop : handlePrimary}
                className="pomo-btn"
                style={{ ...primaryIconBtnStyle, flex: 1, minWidth: 0 }}
                title={state.status === 'idle' || state.status === 'done'
                  ? continueName ? `Continue "${continueName}"` : 'Start observing'
                  : 'Stop — record this span and end'}
              >
                <PomoIcon kind={state.status === 'idle' || state.status === 'done' ? 'play' : 'stop'} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {state.status === 'idle' || state.status === 'done'
                    ? continueName ? `CONTINUE ${truncate(continueName, 18)}` : 'START'
                    : 'STOP'}
                </span>
              </button>
              {(state.status === 'running' || state.status === 'break') && (
                <DiscardButton onDiscard={() => onCommand('pomo.discard')} />
              )}
            </div>
          ) : promptDone ? (
            <div
              data-testid="pomo-prompt"
              className="pomo-controls"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                padding: '8px',
                border: '1px solid var(--acid)',
                borderRadius: 6,
                background: 'color-mix(in srgb, var(--acid) 8%, transparent)',
              }}
            >
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--acid-ink, var(--acid))',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                textAlign: 'center',
              }}>
                Are you done?
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" data-testid="pomo-extend" onClick={handleExtend} style={ghostBtnStyle} title="Keep going — count this pomodoro and start a fresh span">EXTEND</button>
                <button type="button" data-testid="pomo-break" onClick={handleBreak} style={ghostBtnStyle} title="Take a break — records the work so far, then times your break">BREAK</button>
                <button type="button" data-testid="pomo-primary" onClick={handleStop} style={primaryBtnStyle} title="Stop — record this session and end">STOP</button>
              </div>
            </div>
          ) : (
            <div className="pomo-controls" style={{ display: 'flex', gap: 6 }}>
              {(state.status === 'running' || state.status === 'paused') && (
                <button type="button" data-testid="pomo-stop" aria-label="Stop" onClick={handleStop} className="pomo-btn ghost" style={iconBtnStyle} title={stopTitle}>
                  <PomoIcon kind="stop" />
                </button>
              )}
              {state.status === 'running' && (
                <button type="button" data-testid="pomo-break" aria-label="Break" onClick={handleBreak} className="pomo-btn ghost" style={iconBtnStyle} title="Break — records the work so far, then times your break">
                  <PomoIcon kind="break" />
                </button>
              )}
              <button
                type="button"
                data-testid="pomo-primary"
                onClick={state.status === 'break' ? handleStop : handlePrimary}
                className="pomo-btn"
                style={primaryIconBtnStyle}
                title={primaryTooltip(state.status)}
              >
                <PomoIcon kind={state.status === 'running' ? 'pause' : state.status === 'break' ? 'skip' : 'play'} />
                {buttonLabel}
              </button>
            </div>
          )}
          {/* #207 — fix recorded time where it happens: stop at the real time, or add forgotten time. */}
          {compact < 1 && <PomoTimeLinks state={state} />}

        </div>
      )}
    </MotherFrame>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

// CycleCounter — today's completed pomodoro cycles, visually distinct from
// the small per-session pips. Compact single-line strip: numeric badge +
// filled diamonds for completed cycles + thin progress bar toward the next.
//
// Designed to add minimum vertical height (~24px) so it fits in the narrow
// station-view pomo cell without pushing other content off the bottom.
// Diamonds are capped at MAX; extras are summarised as "+N".
function CycleCounter({
  cyclesToday,
  sessionsToday,
  progressToNext,
  longBreakEvery,
}: {
  cyclesToday: number;
  sessionsToday: number;
  progressToNext: number;
  longBreakEvery: number;
}) {
  const MAX_DIAMONDS = 6;
  const visibleDiamonds = Math.min(cyclesToday, MAX_DIAMONDS);
  const overflow = cyclesToday > MAX_DIAMONDS ? cyclesToday - MAX_DIAMONDS : 0;
  const hasAny = cyclesToday > 0;
  const cellColor = hasAny ? 'var(--acid)' : 'var(--ink-4)';

  return (
    <div
      data-testid="pomo-cycles-today"
      data-cycles={cyclesToday}
      data-sessions={sessionsToday}
      title={`${cyclesToday} cycle${cyclesToday === 1 ? '' : 's'} today · ${sessionsToday} sessions · ${progressToNext}/${longBreakEvery} toward next`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        padding: '3px 8px',
        background: hasAny
          ? 'linear-gradient(90deg, color-mix(in srgb, var(--acid) 10%, transparent), color-mix(in srgb, var(--acid) 2%, transparent) 60%)'
          : 'var(--paper-2)',
        border: `1px solid ${hasAny ? 'color-mix(in srgb, var(--acid) 40%, transparent)' : 'var(--paper-3)'}`,
        borderRadius: 4,
        boxShadow: hasAny ? '0 0 8px color-mix(in srgb, var(--acid) 14%, transparent) inset' : 'none',
      }}
    >
      {/* Numeric badge */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, flexShrink: 0 }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--ink-3)',
          }}
        >
          ×
        </span>
        <span
          data-testid="pomo-cycles-today-count"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 14,
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 700,
            lineHeight: 1,
            // acid-ink: lime text is unreadable on a light pomo.
            color: hasAny ? 'var(--acid-ink, var(--acid))' : cellColor,
          }}
        >
          {cyclesToday}
        </span>
      </div>

      {/* Diamonds + progress bar — flex:1 so it absorbs slack */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
        {Array.from({ length: visibleDiamonds }).map((_, i) => (
          <span
            key={i}
            data-testid="pomo-cycle-diamond"
            style={{
              width: 7,
              height: 7,
              background: 'var(--acid)',
              transform: 'rotate(45deg)',
              boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--acid-ink, var(--acid)) 60%, transparent)',
              flexShrink: 0,
            }}
          />
        ))}
        {overflow > 0 && (
          <span
            data-testid="pomo-cycles-overflow"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 8.5,
              color: 'var(--acid-ink, var(--acid))',
              letterSpacing: '0.06em',
              marginLeft: 1,
            }}
          >
            +{overflow}
          </span>
        )}
        {longBreakEvery > 0 && (
          <span
            data-testid="pomo-cycle-progress"
            data-progress={progressToNext}
            data-of={longBreakEvery}
            style={{
              flexShrink: 0,
              marginLeft: visibleDiamonds > 0 || overflow > 0 ? 4 : 0,
              display: 'inline-block',
              width: 28,
              height: 3,
              borderRadius: 1.5,
              background: 'var(--paper-3)',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <span
              style={{
                position: 'absolute',
                inset: 0,
                width: `${(progressToNext / longBreakEvery) * 100}%`,
                background: 'var(--acid)',
                opacity: progressToNext > 0 ? 0.85 : 0,
              }}
            />
          </span>
        )}
      </div>

      {/* Single-line label — flexShrink:0 keeps it readable even when crowded */}
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--ink-3)',
          letterSpacing: '0.02em',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        cycles today
      </span>
    </div>
  );
}

export default PomoNode;

function PomoIcon({ kind }: { kind: 'play' | 'pause' | 'stop' | 'break' | 'skip' }) {
  const p = { width: 15, height: 15, viewBox: '0 0 16 16', 'aria-hidden': true } as const;
  switch (kind) {
    case 'play':  return <svg {...p} fill="currentColor"><path d="M4.5 2.5v11l9-5.5z" /></svg>;
    case 'pause': return <svg {...p} fill="currentColor"><rect x="3.5" y="2.5" width="3.2" height="11" rx="1" /><rect x="9.3" y="2.5" width="3.2" height="11" rx="1" /></svg>;
    case 'stop':  return <svg {...p} fill="currentColor"><rect x="3" y="3" width="10" height="10" rx="2" /></svg>;
    case 'skip':  return <svg {...p} fill="currentColor"><path d="M3 2.5v11l7.5-5.5z" /><rect x="11" y="2.5" width="2.4" height="11" rx="0.8" /></svg>;
    case 'break': return (
      <svg {...p} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 6.5h9v3.5a3.5 3.5 0 0 1-3.5 3.5H6a3.5 3.5 0 0 1-3.5-3.5z" /><path d="M11.5 7.5h1a1.8 1.8 0 0 1 0 3.6h-1.2" /><path d="M5.5 1.5v2.5M8.5 1.5v2.5" />
      </svg>
    );
  }
}

/** The face, fitted to the room left in a station slot; as-is elsewhere. */
function FaceWrap({ fit, children }: { fit: boolean; children: React.ReactNode }) {
  return fit ? <FaceFit>{children}</FaceFit> : <>{children}</>;
}
