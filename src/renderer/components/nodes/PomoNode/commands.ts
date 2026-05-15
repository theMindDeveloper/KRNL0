// Decision #9 / Decision #22 — Pomodoro FSM. Pure handlers: (state, args) => state.
// Time and id sources are injected so tests can pin them.

import type { PomoConfig, PomoSessionRecord, PomoState, TimerFace } from './types';
import { defaultPomoConfig } from './types';

export interface PomoEnv {
  now: () => number;
  uuid: () => string;
}

const defaultEnv: PomoEnv = {
  now: () => Date.now(),
  uuid: () => crypto.randomUUID(),
};

const toIso = (ms: number): string => new Date(ms).toISOString();

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
  if (state.status !== 'paused') return state;
  const startedAt = toIso(env.now() - state.pausedElapsedMs);
  return {
    ...state,
    status: 'running',
    startedAt,
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
  args: { config?: PomoConfig } = {},
  env: PomoEnv = defaultEnv,
): PomoState => {
  if (state.status !== 'running' || state.startedAt === null) return state;
  const now = env.now();
  if (now - Date.parse(state.startedAt) < state.durationMin * 60_000) return state;
  const config = args.config ?? defaultPomoConfig();
  const nextSessions = state.sessionsCompleted + 1;
  const isLong = nextSessions % config.longBreakEvery === 0;
  const breakMin = isLong ? config.longBreakMin : config.shortBreakMin;
  const record: PomoSessionRecord = {
    id: env.uuid(),
    startedAt: state.startedAt,
    endedAt: toIso(now),
    durationMin: state.durationMin,
    label: state.label,
    completed: true,
    taskId: state.activeTaskId,
  };
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

export const pomoSetLabel = (state: PomoState, args: { label: string }): PomoState => {
  return { ...state, label: args.label };
};

export const pomoSetDuration = (state: PomoState, args: { minutes: number }): PomoState => {
  if (state.status === 'running') return state;
  return { ...state, durationMin: args.minutes };
};

/**
 * Decision 22 §1 — write a new canonical PomoConfig. No-op if the proposed
 * config is structurally identical to the current one.
 */
export const pomoSetConfig = (
  config: PomoConfig | null,
  args: { config: Partial<PomoConfig> },
): PomoConfig => {
  const current = config ?? defaultPomoConfig();
  const next: PomoConfig = {
    sessionMin: clampPositive(args.config.sessionMin, current.sessionMin),
    shortBreakMin: clampPositive(args.config.shortBreakMin, current.shortBreakMin),
    longBreakMin: clampPositive(args.config.longBreakMin, current.longBreakMin),
    longBreakEvery: clampPositive(args.config.longBreakEvery, current.longBreakEvery),
  };
  // PR4 — preserve face selection across SAVE; face is optional so only copy when set
  if (current.face !== undefined) next.face = current.face;
  return next;
};

/**
 * Decision 22 §5 — clear the active task without changing FSM status.
 * Used when the user opens the gear panel or otherwise asks for default mode.
 */
export const pomoClearActiveTask = (state: PomoState): PomoState => {
  if (state.activeTaskId === null) return state;
  return { ...state, activeTaskId: null, label: '' };
};

const VALID_FACES: ReadonlyArray<TimerFace> = ['ring', 'ascii', 'lcd', 'blocks', 'vapor'];

/**
 * PR4 — set the timer face variant on the PomoConfig.
 * No-op if the requested face is unknown or unchanged.
 */
export const pomoSetFace = (
  config: PomoConfig | null,
  args: { face: TimerFace },
): PomoConfig => {
  const current = config ?? defaultPomoConfig();
  if (!VALID_FACES.includes(args.face)) return current;
  return { ...current, face: args.face };
};

function clampPositive(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.round(value));
}
