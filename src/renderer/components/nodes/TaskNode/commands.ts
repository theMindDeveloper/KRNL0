// Decision #20 — TaskNode FSM. Each handler is pure: (state, args?) => state.
// Time and id sources are injected so tests can pin them; the kernel passes
// real Date.now and crypto.randomUUID at runtime.

import type { TaskState } from './types';

export interface TaskEnv {
  uuid: () => string;
  now: () => string;    // ISO 8601 — used by taskStartPomo
  nowMs: () => number;  // epoch ms — used by taskFlushPomo
}

export const defaultTaskEnv: TaskEnv = {
  uuid: () => crypto.randomUUID(),
  now: () => new Date().toISOString(),
  nowMs: () => Date.now(),
};

// task.toggle — flip done state.
export const taskToggle = (state: TaskState): TaskState => ({
  ...state,
  done: !state.done,
});

// task.edit — update the task text (trims; no-op on empty).
export const taskEdit = (
  state: TaskState,
  args: { text: string },
): TaskState => {
  const trimmed = args.text.trim();
  if (!trimmed) return state;
  return { ...state, text: trimmed };
};

// task.incrementPomo — record one completed pomodoro session.
export const taskIncrementPomo = (state: TaskState): TaskState => ({
  ...state,
  pomoSessionsCompleted: state.pomoSessionsCompleted + 1,
});

// task.activate — no-op signal used by edges to mark this node as the
// "active" task; currently just returns state unchanged. Kept here so
// commandDispatch has a no-op result to return (rather than null).
export const taskActivate = (state: TaskState): TaskState => state;

// task.startPomo — mark this task as the active pomo task.
export const taskStartPomo = (
  state: TaskState,
  args: { durationMin?: number },
  env: TaskEnv = defaultTaskEnv,
): TaskState => ({
  ...state,
  pomoStartedAt: env.now(),
  pomoTargetMin: args.durationMin ?? state.durationMin,
});

// task.flushPomo — accumulate elapsed time and clear the running marker.
export const taskFlushPomo = (
  state: TaskState,
  _args: Record<string, unknown>,
  env: TaskEnv = defaultTaskEnv,
): TaskState => {
  if (state.pomoStartedAt === null) return state;
  const elapsed = env.nowMs() - Date.parse(state.pomoStartedAt);
  return {
    ...state,
    pomoElapsedMs: state.pomoElapsedMs + elapsed,
    pomoStartedAt: null,
  };
};

// task.resetPomo — clear all accumulated pomo progress on this task.
export const taskResetPomo = (state: TaskState): TaskState => ({
  ...state,
  pomoElapsedMs: 0,
  pomoStartedAt: null,
  pomoTargetMin: 0,
});

// task.setDuration — update the estimated duration (blocked while pomo is running).
export const taskSetDuration = (
  state: TaskState,
  args: { durationMin: number },
): TaskState => {
  if (state.pomoStartedAt !== null) return state; // guard: blocked while running
  const min = Math.max(1, Math.min(480, Math.round(args.durationMin)));
  return { ...state, durationMin: min, eta: `~${min} min` };
};
