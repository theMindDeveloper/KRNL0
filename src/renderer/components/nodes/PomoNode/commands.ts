// Decision #9 / Decision #22 — Pomodoro FSM. Pure handlers: (state, args) => state.
// Time and id sources are injected so tests can pin them.

import type { PomoConfig, PomoSegmentKind, PomoSessionRecord, PomoState, TimerFace } from './types';
import { defaultPomoConfig, TIMER_FACES } from './types';
import { isLongBreakAfter } from './pomoRules';

export interface PomoEnv {
  now: () => number;
  uuid: () => string;
}

const defaultEnv: PomoEnv = {
  now: () => Date.now(),
  uuid: () => crypto.randomUUID(),
};

const toIso = (ms: number): string => new Date(ms).toISOString();

/** Observe mode — a free-text span carries the live category tag (a task span
 *  takes its colour from the task). */
const liveTag = (state: PomoState): { tag?: string } =>
  state.activeTaskId === null && state.tag ? { tag: state.tag } : {};

export const pomoStart = (
  state: PomoState,
  args: {
    label?: string;
    durationMin?: number;
    activeTaskId?: string | null;
  } = {},
  env: PomoEnv = defaultEnv,
): PomoState => {
  if (state.status !== 'idle' && state.status !== 'done') return state;
  return {
    ...state,
    status: 'running',
    startedAt: toIso(env.now()),
    label: args.label ?? state.label,
    durationMin: args.durationMin ?? state.durationMin,
    activeTaskId:
      args.activeTaskId !== undefined ? args.activeTaskId : state.activeTaskId,
  };
};

export const pomoPause = (
  state: PomoState,
  _args: object = {},
  env: PomoEnv = defaultEnv,
): PomoState => {
  if (state.status !== 'running' || state.startedAt === null) return state;
  const elapsedMs = env.now() - Date.parse(state.startedAt);
  return {
    ...state,
    status: 'paused',
    pausedAt: toIso(env.now()),
    pausedElapsedMs: elapsedMs,
  };
};

export const pomoResume = (
  state: PomoState,
  _args: object = {},
  env: PomoEnv = defaultEnv,
): PomoState => {
  // Back to work from a break: record the break span, open a fresh work span.
  if (state.status === 'break' && state.startedAt !== null) {
    const now = env.now();
    const rec: PomoSessionRecord = {
      id: env.uuid(),
      startedAt: state.startedAt,
      endedAt: toIso(now),
      durationMin: Math.max(0, Math.round((now - Date.parse(state.startedAt)) / 60_000)),
      label: state.label,
      completed: false,
      taskId: state.activeTaskId,
      kind: 'break',
    };
    return { ...state, status: 'running', startedAt: toIso(now), sessionWorkSec: 0, history: [...state.history, rec] };
  }
  if (state.status !== 'paused') return state;
  // Close the pre-pause work as its own span and open a fresh one at `now`, so
  // the Clock/Calendar draw the pause gap as a gap (not as work) and a pause
  // that crosses midnight stays on the right day. The worked time carries over
  // in `sessionWorkSec`, so the threshold still counts the whole pomodoro.
  const now = env.now();
  const history =
    state.startedAt !== null && state.pausedElapsedMs > 0
      ? [
          ...state.history,
          {
            id: env.uuid(),
            startedAt: state.startedAt,
            endedAt: state.pausedAt ?? toIso(Date.parse(state.startedAt) + state.pausedElapsedMs),
            durationMin: Math.max(0, Math.round(state.pausedElapsedMs / 60_000)),
            label: state.label,
            completed: false,
            taskId: state.activeTaskId,
            kind: 'work' as const,
            ...liveTag(state),
          },
        ]
      : state.history;
  return {
    ...state,
    status: 'running',
    startedAt: toIso(now),
    sessionWorkSec: (state.sessionWorkSec ?? 0) + state.pausedElapsedMs / 1000,
    history,
    pausedAt: null,
    pausedElapsedMs: 0,
  };
};

export const pomoCancel = (
  state: PomoState,
  _args: object = {},
  env: PomoEnv = defaultEnv,
): PomoState => {
  if (state.status !== 'running' && state.status !== 'paused') return state;
  if (state.startedAt === null) return state;
  // For a paused cancel, use pausedAt as the truthful endedAt (moment activity stopped).
  const endedAt =
    state.status === 'paused' && state.pausedAt !== null
      ? state.pausedAt
      : toIso(env.now());
  const record: PomoSessionRecord = {
    id: env.uuid(),
    startedAt: state.startedAt,
    endedAt,
    durationMin: state.durationMin,
    label: state.label,
    completed: false,
    taskId: state.activeTaskId,
    kind: 'work',
    ...liveTag(state),
  };
  return {
    ...state,
    status: 'idle',
    startedAt: null,
    pausedAt: null,
    pausedElapsedMs: 0,
    history: [...state.history, record],
  };
};

/**
 * Complete the running session. Decision 22 §7: branch break length
 * on `(sessionsCompleted + 1) % longBreakEvery === 0`. The kernel passes
 * the live PomoConfig so the FSM stays pure (no global reads).
 */
export const pomoComplete = (
  state: PomoState,
  args: { config?: PomoConfig; skipBreak?: boolean } = {},
  env: PomoEnv = defaultEnv,
): PomoState => {
  if (state.status !== 'running' || state.startedAt === null) return state;
  const now = env.now();
  if ((state.sessionWorkSec ?? 0) * 1000 + now - Date.parse(state.startedAt) < state.durationMin * 60_000) {
    return state;
  }
  const config = args.config ?? defaultPomoConfig();
  const nextSessions = state.sessionsCompleted + 1;
  const record: PomoSessionRecord = {
    id: env.uuid(),
    startedAt: state.startedAt,
    endedAt: toIso(now),
    durationMin: state.durationMin,
    label: state.label,
    completed: true,
    taskId: state.activeTaskId,
    kind: 'work',
    ...liveTag(state),
  };
  // Event-task path (Decision 28 + follow-up): single big session, no break.
  // Caller signals via skipBreak=true. FSM transitions to 'done' (idle-like)
  // so the START button reappears and no break countdown runs.
  if (args.skipBreak) {
    return {
      ...state,
      status: 'done',
      startedAt: null,
      sessionsCompleted: nextSessions,
      history: [...state.history, record],
    };
  }
  const isLong = isLongBreakAfter(state.sessionsCompleted, config);
  const breakMin = isLong ? config.longBreakMin : config.shortBreakMin;
  return {
    ...state,
    status: 'break',
    startedAt: toIso(now),
    sessionsCompleted: nextSessions,
    breakMin,
    history: [...state.history, record],
  };
};

export const pomoSkipBreak = (state: PomoState): PomoState => {
  if (state.status !== 'break') return state;
  return { ...state, status: 'idle', startedAt: null };
};

export const pomoEndBreak = (
  state: PomoState,
  _args: object = {},
  env: PomoEnv = defaultEnv,
): PomoState => {
  if (state.status !== 'break' || state.startedAt === null) return state;
  if (env.now() - Date.parse(state.startedAt) < state.breakMin * 60_000) return state;
  return { ...state, status: 'idle', startedAt: null };
};

// ─────────────────────────────────────────────────────────────────────────────
// Issue #166 — observer-model verbs. The pomo timer draws REALITY: each
// contiguous work/break span is recorded as a kind-tagged segment. There is no
// pre-declared session plan. `completed` on a work record means full-vs-partial
// (threshold reached), NOT include-vs-exclude.
//
// Slice 1 is additive: these coexist with the legacy decision-22 verbs above
// while the node UI / renderers / CLI are migrated off the planner model. The
// `sessionWorkSec` accumulator survives pause gaps so the threshold is correct
// across a paused-and-resumed pomodoro.
// ─────────────────────────────────────────────────────────────────────────────

/** Minutes spanned by [startIso, nowMs], rounded, never negative. */
const spanMin = (startIso: string, nowMs: number): number =>
  Math.max(0, Math.round((nowMs - Date.parse(startIso)) / 60_000));

/** Close the in-flight WORK span into a record. `completed` = threshold reached. */
function recordWorkSpan(
  state: PomoState,
  endMs: number,
  completed: boolean,
  env: PomoEnv,
): PomoSessionRecord {
  return {
    id: env.uuid(),
    startedAt: state.startedAt as string,
    endedAt: toIso(endMs),
    durationMin: spanMin(state.startedAt as string, endMs),
    label: state.label,
    completed,
    taskId: state.activeTaskId,
    kind: 'work',
    ...liveTag(state),
  };
}

/** True iff the current pomodoro has reached its session-length threshold. */
function reachedThreshold(state: PomoState, workedSec: number): boolean {
  return workedSec >= state.durationMin * 60;
}

/**
 * Issue #166 — switch from work to break. Records the in-flight work span
 * (completed iff threshold reached), then opens an open-ended break span.
 * Valid from running or paused; no-op otherwise.
 */
export const pomoBreak = (
  state: PomoState,
  _args: object = {},
  env: PomoEnv = defaultEnv,
): PomoState => {
  const now = env.now();
  if (state.status === 'running' && state.startedAt !== null) {
    const workedSec = state.sessionWorkSec + (now - Date.parse(state.startedAt)) / 1000;
    const reached = reachedThreshold(state, workedSec);
    return {
      ...state,
      status: 'break',
      startedAt: toIso(now),
      pausedAt: null,
      pausedElapsedMs: 0,
      sessionWorkSec: 0,
      sessionsCompleted: state.sessionsCompleted + (reached ? 1 : 0),
      history: [...state.history, recordWorkSpan(state, now, reached, env)],
    };
  }
  if (state.status === 'paused' && state.startedAt !== null) {
    const workedSec = state.sessionWorkSec + state.pausedElapsedMs / 1000;
    const reached = reachedThreshold(state, workedSec);
    const endIso = state.pausedAt ?? toIso(now);
    const rec: PomoSessionRecord = {
      id: env.uuid(),
      startedAt: state.startedAt,
      endedAt: endIso,
      durationMin: Math.max(0, Math.round(state.pausedElapsedMs / 60_000)),
      label: state.label,
      completed: reached,
      taskId: state.activeTaskId,
      kind: 'work',
      ...liveTag(state),
    };
    return {
      ...state,
      status: 'break',
      startedAt: toIso(now),
      pausedAt: null,
      pausedElapsedMs: 0,
      sessionWorkSec: 0,
      sessionsCompleted: state.sessionsCompleted + (reached ? 1 : 0),
      history: [...state.history, rec],
    };
  }
  return state;
};

/**
 * Issue #166 — "Extend" from the "Are you done?" prompt. Closes the current
 * work span as a completed pomodoro (the prompt only appears at threshold),
 * re-arms `sessionWorkSec`, and opens a fresh work span with no gap — the two
 * spans render as one continuous arc. No-op unless running.
 */
export const pomoExtend = (
  state: PomoState,
  _args: object = {},
  env: PomoEnv = defaultEnv,
): PomoState => {
  if (state.status !== 'running' || state.startedAt === null) return state;
  const now = env.now();
  return {
    ...state,
    startedAt: toIso(now),
    sessionWorkSec: 0,
    sessionsCompleted: state.sessionsCompleted + 1,
    history: [...state.history, recordWorkSpan(state, now, true, env)],
  };
};

/**
 * Issue #166 — stop the timer entirely → idle. Records the final in-flight
 * span: a work span (completed iff threshold reached) from running/paused, or
 * a break span from break. No-op when idle.
 */
export const pomoStop = (
  state: PomoState,
  _args: object = {},
  env: PomoEnv = defaultEnv,
): PomoState => {
  const now = env.now();
  const toIdle = {
    status: 'idle' as const,
    startedAt: null,
    pausedAt: null,
    pausedElapsedMs: 0,
    sessionWorkSec: 0,
  };
  if (state.status === 'running' && state.startedAt !== null) {
    const workedSec = state.sessionWorkSec + (now - Date.parse(state.startedAt)) / 1000;
    const reached = reachedThreshold(state, workedSec);
    return {
      ...state,
      ...toIdle,
      sessionsCompleted: state.sessionsCompleted + (reached ? 1 : 0),
      history: [...state.history, recordWorkSpan(state, now, reached, env)],
    };
  }
  if (state.status === 'break' && state.startedAt !== null) {
    const rec: PomoSessionRecord = {
      id: env.uuid(),
      startedAt: state.startedAt,
      endedAt: toIso(now),
      durationMin: spanMin(state.startedAt, now),
      label: state.label,
      completed: false,
      taskId: state.activeTaskId,
      kind: 'break',
    };
    return { ...state, ...toIdle, history: [...state.history, rec] };
  }
  if (state.status === 'paused' && state.startedAt !== null) {
    const workedSec = state.sessionWorkSec + state.pausedElapsedMs / 1000;
    const reached = reachedThreshold(state, workedSec);
    const endIso = state.pausedAt ?? toIso(now);
    const rec: PomoSessionRecord = {
      id: env.uuid(),
      startedAt: state.startedAt,
      endedAt: endIso,
      durationMin: Math.max(0, Math.round(state.pausedElapsedMs / 60_000)),
      label: state.label,
      completed: reached,
      taskId: state.activeTaskId,
      kind: 'work',
      ...liveTag(state),
    };
    return {
      ...state,
      ...toIdle,
      sessionsCompleted: state.sessionsCompleted + (reached ? 1 : 0),
      history: [...state.history, rec],
    };
  }
  return state;
};

/**
 * #12 — delete a recorded segment by id. Removes it from history so it vanishes
 * from the Clock, Calendar AND analytics (pomoSource reads history live). No-op
 * if the id isn't present. Goes through a normal history-pushed store mutation
 * so the delete stays undoable.
 */
export const pomoDeleteSegment = (state: PomoState, args: { id: string }): PomoState => {
  if (!args?.id) return state;
  const next = state.history.filter((r) => r.id !== args.id);
  if (next.length === state.history.length) return state;
  return { ...state, history: next };
};

/**
 * #2/#6 — RESET: abandon the in-flight span and snap to idle WITHOUT writing a
 * history record. This is the "I don't want to count this" escape hatch, distinct
 * from STOP (pomoStop, which records) and from PAUSE (which excludes away-time but
 * keeps the session). No-op when already idle/done.
 */
export const pomoDiscard = (state: PomoState): PomoState => {
  if (state.status === 'idle' || state.status === 'done') return state;
  return {
    ...state,
    status: 'idle',
    startedAt: null,
    pausedAt: null,
    pausedElapsedMs: 0,
    sessionWorkSec: 0,
  };
};

/** Spans shorter than this are misclicks (Start then Stop right away). */
export const BLIP_MS = 10_000;

/**
 * Observe mode — drop spans `next` added that are shorter than BLIP_MS, so a
 * misclicked Start/Stop doesn't leave an unclickable sliver on the Calendar.
 */
export const pomoDropBlips = (prev: PomoState, next: PomoState): PomoState => {
  const before = new Set(prev.history.map((r) => r.id));
  const history = next.history.filter(
    (r) => before.has(r.id) || Date.parse(r.endedAt) - Date.parse(r.startedAt) >= BLIP_MS,
  );
  return history.length === next.history.length ? next : { ...next, history };
};

export const pomoSetLabel =(state: PomoState, args: { label: string }): PomoState => {
  return { ...state, label: args.label };
};

export const pomoSetDuration = (state: PomoState, args: { minutes: number }): PomoState => {
  if (state.status === 'running') return state;
  return { ...state, durationMin: args.minutes };
};

/**
 * Decision 22 §1 — write a new canonical PomoConfig. No-op if the proposed
 * config is structurally identical to the current one.
 *
 * IMPORTANT (2026-05-18 bug fix): mother-node configs piggyback non-pomo
 * fields like `stationSlot` and `stationHidden` on the same config object
 * (see MotherNodeConfig in src/shared/types/board.ts). Rebuilding the object
 * from scratch dropped those fields — after a gear SAVE the pomo lost its
 * stationSlot and StationCell could no longer resolve it, so the pomo card
 * vanished from station view. Spread `current` first so any extra fields
 * (stationSlot, stationHidden, future flags) ride through untouched.
 */
export const pomoSetConfig = (
  config: PomoConfig | null,
  args: { config: Partial<PomoConfig> },
): PomoConfig => {
  const current = config ?? defaultPomoConfig();
  return {
    ...current,
    sessionMin: clampPositive(args.config.sessionMin, current.sessionMin),
    shortBreakMin: clampPositive(args.config.shortBreakMin, current.shortBreakMin),
    longBreakMin: clampPositive(args.config.longBreakMin, current.longBreakMin),
    longBreakEvery: clampPositive(args.config.longBreakEvery, current.longBreakEvery),
    ...(typeof args.config.countStopped === 'boolean' ? { countStopped: args.config.countStopped } : {}),
    ...(args.config.mode === 'pomodoro' || args.config.mode === 'observe' ? { mode: args.config.mode } : {}),
  };
};

/**
 * Decision 22 §5 — clear the active task and snap the timer back to its
 * configured defaults. Without resetting durationMin/breakMin, a stale per-
 * task session length (e.g. 15-min) would linger after the task is deleted
 * or unloaded, making the pomo node read "task-shaped" with no task attached.
 * Passing the live PomoConfig is required for the snap-to-default behavior;
 * omitting it preserves the current durations (legacy call sites).
 */
/**
 * Plan vs reality — tag what the pomo is observing. Sets the task id stamped
 * onto spans recorded from now on (and onto the in-flight span when it
 * closes). Never touches the timer itself: no cancel, no duration change.
 */
export const pomoSetTag = (
  state: PomoState,
  args: { taskId: string | null; label?: string },
): PomoState => {
  const label = args.taskId === null ? '' : (args.label ?? state.label);
  if (state.activeTaskId === args.taskId && state.label === label && !state.tag) return state;
  return { ...state, activeTaskId: args.taskId, label, tag: null };
};

/**
 * Observe mode — name what is being recorded now (free text + category).
 * Spans recorded from now on carry it, so continuing after a break or a
 * stop doesn't ask "what was this?" again.
 */
export const pomoSetLiveLabel = (state: PomoState, args: { label: string; tag?: string | null }): PomoState => {
  const label = args.label.trim();
  return { ...state, activeTaskId: null, label, tag: label ? (args.tag ?? null) : null };
};

/**
 * Retag an already-recorded span (fix "what was this time spent on" later).
 * A task wins; with no task, `label` is free text ("emails") and `tag` its
 * tag id. Untagging (no task, no label) clears both.
 */
export const pomoRetagSegment = (
  state: PomoState,
  args: { id: string; taskId: string | null; label?: string; tag?: string | null },
): PomoState => {
  let changed = false;
  const history = state.history.map((r) => {
    if (r.id !== args.id) return r;
    changed = true;
    const { tag: _old, ...rest } = r;
    void _old;
    if (args.taskId !== null) return { ...rest, taskId: args.taskId, label: args.label ?? r.label };
    const label = (args.label ?? '').trim();
    return { ...rest, taskId: null, label, ...(label && args.tag ? { tag: args.tag } : {}) };
  });
  return changed ? { ...state, history } : state;
};

export const pomoClearActiveTask = (
  state: PomoState,
  config?: PomoConfig,
): PomoState => {
  const noop =
    state.activeTaskId === null &&
    state.label === '' &&
    (config === undefined ||
      (state.durationMin === config.sessionMin &&
        state.breakMin === config.shortBreakMin));
  if (noop) return state;
  return {
    ...state,
    activeTaskId: null,
    label: '',
    ...(config ? { durationMin: config.sessionMin, breakMin: config.shortBreakMin } : {}),
  };
};

const VALID_FACES: ReadonlyArray<TimerFace> = TIMER_FACES;

/**
 * PR4 — set the timer face variant on the PomoConfig.
 * No-op if the requested face is unknown or unchanged.
 * ADR 0009 — 'auto' clears the saved face so the frame style's default applies.
 */
export const pomoSetFace = (
  config: PomoConfig | null,
  args: { face: TimerFace | 'auto' },
): PomoConfig => {
  const current = config ?? defaultPomoConfig();
  if (args.face === 'auto') {
    const { face: _drop, ...rest } = current;
    void _drop;
    return rest;
  }
  if (!VALID_FACES.includes(args.face)) return current;
  return { ...current, face: args.face };
};

function clampPositive(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.round(value));
}

// ─────────────────────────────────────────────────────────────────────────────
// DEV-ONLY (#180 visualization testing). Not wired into production UI — the
// PomoNode only renders the dev panel under import.meta.env.DEV. These let you
// inspect how tracked-reality work/break segments paint on the Clock + Calendar
// without waiting out a real session.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Append a synthetic tracked segment to history, ending "now" and spanning
 * back `minutes`. `kind` picks work vs break. Lets you eyeball the reality
 * wash/wedge instantly. Dev tool only.
 */
export const pomoDevSeedSegment = (
  state: PomoState,
  args: { kind?: PomoSegmentKind; minutes?: number; agoMin?: number; label?: string } = {},
  env: PomoEnv = defaultEnv,
): PomoState => {
  const kind: PomoSegmentKind = args.kind === 'break' ? 'break' : 'work';
  const minutes = Math.max(1, Math.round(args.minutes ?? 25));
  const agoMin = Math.max(0, Math.round(args.agoMin ?? 0));
  const endMs = env.now() - agoMin * 60_000;
  const startMs = endMs - minutes * 60_000;
  const rec: PomoSessionRecord = {
    id: env.uuid(),
    startedAt: toIso(startMs),
    endedAt: toIso(endMs),
    durationMin: minutes,
    label: args.label ?? 'DEV',
    completed: kind === 'work',
    taskId: null,
    kind,
  };
  return { ...state, history: [...state.history, rec] };
};

/** Remove all DEV-seeded segments (label === 'DEV'). Dev tool only. */
export const pomoDevClearSeeded = (state: PomoState): PomoState => ({
  ...state,
  history: state.history.filter((r) => r.label !== 'DEV'),
});
