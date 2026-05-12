// Decision #9 — Pomodoro FSM. Each handler is pure: (state, args) => state.
// Time and id sources are injected so tests can pin them; the kernel passes
// real `Date.now` and `crypto.randomUUID` at runtime.

import type { PomoSessionRecord, PomoState } from './types';

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
  args: { label?: string; durationMin?: number } = {},
  env: PomoEnv = defaultEnv,
): PomoState => {
  if (state.status !== 'idle' && state.status !== 'done') return state;
  return {
    ...state,
    status: 'running',
    startedAt: toIso(env.now()),
    label: args.label ?? state.label,
    durationMin: args.durationMin ?? state.durationMin,
  };
};

export const pomoCancel = (state: PomoState, _args: object = {}, env: PomoEnv = defaultEnv): PomoState => {
  if (state.status !== 'running' || state.startedAt === null) return state;
  const record: PomoSessionRecord = {
    id: env.uuid(),
    startedAt: state.startedAt,
    endedAt: toIso(env.now()),
    durationMin: state.durationMin,
    label: state.label,
    completed: false,
  };
  return {
    ...state,
    status: 'idle',
    startedAt: null,
    history: [...state.history, record],
  };
};

// Decision 9 Addendum (2026-05-12) — long-break branching.
// At completion time, decide whether the next break is long or short:
//   isLongBreak = (sessionsCompleted + 1) % longBreakEvery === 0
// The chosen duration is written into the resulting state's `breakMin` so
// pomoEndBreak can compare against it without re-deriving (avoids off-by-one
// risk when sessionsCompleted has already incremented).
export interface PomoBreakCfg {
  breakMin: number;
  longBreakMin: number;
  longBreakEvery: number;
}

export const pomoComplete = (
  state: PomoState,
  _args: object = {},
  env: PomoEnv = defaultEnv,
  cfg?: PomoBreakCfg,
): PomoState => {
  if (state.status !== 'running' || state.startedAt === null) return state;
  const now = env.now();
  if (now - Date.parse(state.startedAt) < state.durationMin * 60_000) return state;
  const record: PomoSessionRecord = {
    id: env.uuid(),
    startedAt: state.startedAt,
    endedAt: toIso(now),
    durationMin: state.durationMin,
    label: state.label,
    completed: true,
  };
  const effectiveCfg: PomoBreakCfg = cfg ?? {
    breakMin: state.breakMin,
    longBreakMin: state.breakMin,
    longBreakEvery: 4,
  };
  const isLongBreak =
    (state.sessionsCompleted + 1) % effectiveCfg.longBreakEvery === 0;
  const nextBreakMin = isLongBreak ? effectiveCfg.longBreakMin : effectiveCfg.breakMin;
  return {
    ...state,
    status: 'break',
    startedAt: toIso(now),
    breakMin: nextBreakMin,
    sessionsCompleted: state.sessionsCompleted + 1,
    history: [...state.history, record],
  };
};

export const pomoSkipBreak = (state: PomoState): PomoState => {
  if (state.status !== 'break') return state;
  return { ...state, status: 'idle', startedAt: null };
};

export const pomoEndBreak = (state: PomoState, _args: object = {}, env: PomoEnv = defaultEnv): PomoState => {
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
