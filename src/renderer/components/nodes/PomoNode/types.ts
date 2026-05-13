// Decision #9 / Decision #22 — PomoNode state contract.
// Persistence rule: store `startedAt`; derive countdown from `now - startedAt`.
// Decision 22 adds `activeTaskId` to state and canonicalises PomoConfig fields
// to `{ sessionMin, shortBreakMin, longBreakMin, longBreakEvery }`.

export type PomoStatus = 'idle' | 'running' | 'paused' | 'break' | 'done';

export interface PomoSessionRecord {
  id: string;
  startedAt: string;
  endedAt: string;
  durationMin: number;
  label: string;
  completed: boolean;
  taskId?: string | null;
}

export interface PomoState {
  status: PomoStatus;
  startedAt: string | null;
  durationMin: number;
  breakMin: number;
  label: string;
  sessionsCompleted: number;
  activeTaskId: string | null;
  history: PomoSessionRecord[];
  pausedAt: string | null;
  pausedElapsedMs: number;
}

export interface PomoConfig {
  sessionMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  longBreakEvery: number;
}

export const defaultPomoState = (): PomoState => ({
  status: 'idle',
  startedAt: null,
  durationMin: 25,
  breakMin: 5,
  label: '',
  sessionsCompleted: 0,
  activeTaskId: null,
  history: [],
  pausedAt: null,
  pausedElapsedMs: 0,
});

export const defaultPomoConfig = (): PomoConfig => ({
  sessionMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  longBreakEvery: 4,
});
