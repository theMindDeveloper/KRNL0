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

export const pomoComplete = (state: PomoState, _args: object = {}, env: PomoEnv = defaultEnv): PomoState => {
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
  return {
    ...state,
    status: 'break',
    startedAt: toIso(now),
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
