// Decision #9 / Decision #22 — PomoNode state contract.
// Issue #166 — observer model: the pomo timer draws REALITY. Each contiguous
// work/break span is recorded into `history` as a kind-tagged segment so the
// clock/calendar/analytics can replay exactly how the day was spent. There is
// no pre-declared session plan anymore.
//
// Persistence rule: store `startedAt` (start of the CURRENT segment); derive
// the countdown from `durationMin*60 - sessionWorkSec - (now - startedAt)`.

// 'done' is a legacy decision-28 event-task terminal state; retained until the
// event/timer decoupling slice removes the event→pomo path (Issue #166).
export type PomoStatus = 'idle' | 'running' | 'paused' | 'break' | 'done';

/** Issue #166 — a recorded span is either focused work or a break. */
export type PomoSegmentKind = 'work' | 'break';

export interface PomoSessionRecord {
  id: string;
  startedAt: string;
  endedAt: string;
  /** Actual span minutes = round((endedAt - startedAt) / 60000). NOT the
   *  configured session length — a paused/extended pomodoro is many spans. */
  durationMin: number;
  label: string;
  /** Issue #166: full-vs-partial, NOT include-vs-exclude. `true` iff this span
   *  closed because a full session threshold was reached (extend, or break/stop
   *  after threshold). Pip/cycle counts filter on `completed:true` work records;
   *  time-spent analytics sum ALL work records regardless of this flag. */
  completed: boolean;
  taskId?: string | null;
  /** Issue #166: which visual language this span draws in. Defaults to 'work'
   *  for legacy records written before the observer model (migration). */
  kind: PomoSegmentKind;
  /** Observe mode — tag id (ADR 0016 library) on a free-text span. Task spans
   *  take their colour from the task and leave this unset. */
  tag?: string;
}

export interface PomoState {
  status: PomoStatus;
  /** Start of the CURRENT in-flight segment (work while running, break while
   *  on break). Null when idle/paused. */
  startedAt: string | null;
  /** Configured work-session length — the "Are you done?" prompt threshold. */
  durationMin: number;
  /** Default break length (informational only — breaks are open-ended). */
  breakMin: number;
  label: string;
  /** Observe mode — category tag of the free-text `label` being recorded
   *  (null/absent when untagged or when a task is linked). */
  tag?: string | null;
  /** Count of COMPLETED pomodoros (work spans that reached threshold). */
  sessionsCompleted: number;
  activeTaskId: string | null;
  history: PomoSessionRecord[];
  pausedAt: string | null;
  /** Issue #166: accumulated WORK seconds in the current pomodoro across
   *  pauses. Drives the threshold check and survives pause gaps. Reset to 0
   *  when a session ends (extend / break / stop) or a new one starts. */
  sessionWorkSec: number;
  /** @deprecated Legacy decision-22 per-task checkpoint resume. Retained while
   *  the old load-task-into-pomo flow is migrated off (Issue #166 slice 2+). */
  pausedElapsedMs: number;
}

/** Every Timer face. 'vu' and 'outline' added with the theme engine (ADR 0009). */
export const TIMER_FACES = ['ascii', 'lcd', 'blocks', 'vapor', 'vu', 'outline', 'mac'] as const;
export type TimerFace = (typeof TIMER_FACES)[number];

/** 'observe' drops the pomodoro rhythm: no threshold, breaks, pause or pips —
 *  just Start/Stop and a "what was this?" tag on each recorded span. */
export type PomoMode = 'pomodoro' | 'observe';

/** Observe-mode session length: a day, so a span never "completes" a
 *  pomodoro (no threshold prompt, no session/pip counts). */
export const OBSERVE_SPAN_MIN = 24 * 60;

export interface PomoConfig {
  /** Defaults to 'pomodoro' when missing. */
  mode?: PomoMode;
  sessionMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  longBreakEvery: number;
  /** Timer face variant — defaults to 'vapor' if missing. */
  face?: TimerFace;
  /** Stop records the session so far (default) or discards it. One Stop button either way. */
  countStopped?: boolean;
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
  sessionWorkSec: 0,
  pausedElapsedMs: 0,
});

export const defaultPomoConfig = (): PomoConfig => ({
  sessionMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  longBreakEvery: 4,
});
