// Decision #9 — PomoNode state contract.
// Persistence rule: store `startedAt`; derive countdown from `now - startedAt`.

export type PomoStatus = 'idle' | 'running' | 'break' | 'done';

export interface PomoSessionRecord {
  id: string;
  startedAt: string;
  endedAt: string;
  durationMin: number;
  label: string;
  completed: boolean;
}

export interface PomoState {
  status: PomoStatus;
  startedAt: string | null;
  durationMin: number;
  breakMin: number;
  label: string;
  sessionsCompleted: number;
  history: PomoSessionRecord[];
}

export interface PomoConfig {
  defaultDurationMin: number;
  defaultBreakMin: number;
  longBreakEvery: number;
  longBreakMin: number;
}

export const defaultPomoState = (): PomoState => ({
  status: 'idle',
  startedAt: null,
  durationMin: 25,
  breakMin: 5,
  label: '',
  sessionsCompleted: 0,
  history: [],
});

export const defaultPomoConfig = (): PomoConfig => ({
  defaultDurationMin: 25,
  defaultBreakMin: 5,
  longBreakEvery: 4,
  longBreakMin: 15,
});

// Decision 9 Addendum (2026-05-12) — embedded pomo block stored on each
// todo.task. Same shape as PomoState (the FSM handlers operate uniformly).
// Long break duration (longBreakMin) and cadence (longBreakEvery) are NOT
// copied — they're read live from mother config at completion time, so
// changing the cadence later affects every task. duration/short-break ARE
// copied at spawn so editing mother defaults won't stretch in-flight pomos.
export type EmbeddedPomoState = PomoState;

export const defaultEmbeddedPomo = (cfg: PomoConfig, label = ''): EmbeddedPomoState => ({
  status: 'idle',
  startedAt: null,
  durationMin: cfg.defaultDurationMin,
  breakMin: cfg.defaultBreakMin,
  label,
  sessionsCompleted: 0,
  history: [],
});
