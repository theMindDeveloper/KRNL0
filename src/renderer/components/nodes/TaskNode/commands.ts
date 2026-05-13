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

// task.accumulateSeconds — Decision 22: add seconds to this task's running total.
// Called by the dispatcher when an active session is cancelled or completed.
export const taskAccumulateSeconds = (
  state: TaskState,
  args: { seconds: number },
): TaskState => {
  const seconds = Math.max(0, Math.floor(args.seconds));
  if (seconds === 0) return state;
  return {
    ...state,
    secondsAccumulated: (state.secondsAccumulated ?? 0) + seconds,
  };
};

// task.setPlannedMin — Decision 22: update budgeted minutes after creation
// (e.g. via gear panel or sys CLI). Triggers re-derive of plannedSessions.
export const taskSetPlannedMin = (
  state: TaskState,
  args: { minutes: number },
): TaskState => {
  if (typeof args.minutes !== 'number' || !Number.isFinite(args.minutes)) return state;
  const plannedMin = Math.max(1, Math.round(args.minutes));
  return { ...state, plannedMin };
};

// task.setCurrentSessionElapsedSec — Decision 22.1: write the in-flight session
// checkpoint. Clamped to >= 0, integer floor.
export const taskSetCurrentSessionElapsedSec = (
  state: TaskState,
  args: { seconds: number },
): TaskState => {
  const seconds = Math.floor(Math.max(0, args.seconds));
  return { ...state, currentSessionElapsedSec: seconds };
};

// task.clearCurrentSessionElapsedSec — Decision 22.1: reset checkpoint to 0.
// Returns the same reference when already 0 (no-op).
export const taskClearCurrentSessionElapsedSec = (state: TaskState): TaskState => {
  if (state.currentSessionElapsedSec === 0) return state;
  return { ...state, currentSessionElapsedSec: 0 };
};

// task.setDuration — update the estimated duration.
export const taskSetDuration = (
  state: TaskState,
  args: { durationMin: number },
): TaskState => {
  const min = Math.max(1, Math.min(480, Math.round(args.durationMin)));
  return { ...state, durationMin: min, eta: `~${min} min` };
};

// task.setSchedule — ADR 0001: set or clear the scheduled datetime for a task.
// Passing scheduledFor: null clears the schedule. Optional scheduledDurationMin
// overrides the calendar block height; absence leaves the field unchanged.
export const taskSetSchedule = (
  state: TaskState,
  args: { scheduledFor: string | null; scheduledDurationMin?: number },
): TaskState => {
  if (args.scheduledFor === null) {
    // Clear the schedule — remove both optional fields.
    const { scheduledFor: _sf, scheduledDurationMin: _sdm, ...rest } = state;
    void _sf; void _sdm;
    return rest;
  }
  const patch: Partial<TaskState> = { scheduledFor: args.scheduledFor };
  if (typeof args.scheduledDurationMin === 'number' && Number.isFinite(args.scheduledDurationMin)) {
    patch.scheduledDurationMin = Math.max(1, Math.round(args.scheduledDurationMin));
  }
  return { ...state, ...patch };
};
