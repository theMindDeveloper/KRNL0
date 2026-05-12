// Decision #20 — TaskNode FSM. Each handler is pure: (state, args?) => state.
// Time and id sources are injected so tests can pin them; the kernel passes
// real Date.now and crypto.randomUUID at runtime.

import type { TaskState } from './types';

export interface TaskEnv {
  uuid: () => string;
  now: () => string; // ISO 8601
}

export const defaultTaskEnv: TaskEnv = {
  uuid: () => crypto.randomUUID(),
  now: () => new Date().toISOString(),
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
