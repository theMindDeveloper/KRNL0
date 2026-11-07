// Pure derivations of the Pomo node: live times, the "Are you done?" prompt,
// today's cycle count, and which controls a status offers in each mode.
// Shared by the node (index.tsx) and the floating pocket window (Decision 37,
// pocket-timer.md NF2), so the two can never disagree.

import type { PomoConfig, PomoState } from './types';
import { OBSERVE_SPAN_MIN } from './types';

/** "mm:ss", minutes not capped at 60 (a 90 min session reads 90:00). */
export function formatRemaining(ms: number): string {
  const safe = Math.max(0, ms);
  const totalSec = Math.ceil(safe / 1000);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
}

/** "1:12:08" past an hour, "41:36" below — Observe's count-up. */
export function formatElapsed(ms: number): string {
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const two = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}

export interface PomoClock {
  /** Configured session length in minutes (an Observe span keeps the config's). */
  sessionMin: number;
  thresholdMs: number;
  /** Work in the current pomodoro, across pauses. 0 when idle or on a break. */
  liveWorkMs: number;
  remainingMs: number;
  /** A break counts up, open-ended. */
  breakElapsedMs: number;
}

export function pomoClock(state: PomoState, config: PomoConfig, nowMs: number): PomoClock {
  const sessionMin = state.durationMin === OBSERVE_SPAN_MIN ? config.sessionMin : state.durationMin;
  const thresholdMs = sessionMin * 60_000;
  const liveWorkMs =
    state.status === 'running' && state.startedAt !== null
      ? state.sessionWorkSec * 1000 + (nowMs - Date.parse(state.startedAt))
      : state.status === 'paused'
        ? state.sessionWorkSec * 1000 + state.pausedElapsedMs
        : 0;
  const remainingMs = Math.max(0, thresholdMs - liveWorkMs);
  const breakElapsedMs =
    state.status === 'break' && state.startedAt !== null ? nowMs - Date.parse(state.startedAt) : 0;
  return { sessionMin, thresholdMs, liveWorkMs, remainingMs, breakElapsedMs };
}

/** Observe is chosen in the node, and Easy mode is always Observe. */
export function isObserve(config: PomoConfig, easy: boolean): boolean {
  return easy || config.mode === 'observe';
}

/** The threshold prompt: Pomodoro only, while running, once the session length is reached. */
export function isPromptDone(observe: boolean, away: boolean, status: PomoState['status'], clock: PomoClock): boolean {
  return !away && !observe && status === 'running' && clock.liveWorkMs >= clock.thresholdMs;
}

/** Completed sessions whose end falls on today's local date, and the cycles they make. */
export function todayCycles(
  history: PomoState['history'],
  longBreakEvery: number,
  nowMs: number,
): { cyclesToday: number; sessionsToday: number; progressToNext: number } {
  const today = new Date(nowMs).toLocaleDateString('en-CA');
  let count = 0;
  for (const rec of history) {
    if (!rec.completed || !rec.endedAt) continue;
    if (new Date(rec.endedAt).toLocaleDateString('en-CA') === today) count++;
  }
  const every = Math.max(1, longBreakEvery);
  return { cyclesToday: Math.floor(count / every), sessionsToday: count, progressToNext: count % every };
}

/** Every command a Pomo control can run — and so all the pocket may send (F5). */
export const POMO_CONTROL_COMMANDS = [
  'pomo.start', 'pomo.pause', 'pomo.resume', 'pomo.break', 'pomo.stop', 'pomo.discard', 'pomo.extend',
] as const;
export type PomoControlCommand = (typeof POMO_CONTROL_COMMANDS)[number];

export function isPomoControlCommand(v: unknown): v is PomoControlCommand {
  return typeof v === 'string' && (POMO_CONTROL_COMMANDS as readonly string[]).includes(v);
}

/** Stop records the span, or discards it when "Count stopped sessions" is off (Pomodoro only). */
export function stopCommand(observe: boolean, config: PomoConfig): PomoControlCommand {
  return !observe && config.countStopped === false ? 'pomo.discard' : 'pomo.stop';
}

export type PomoControlId = 'start' | 'pause' | 'resume' | 'break' | 'stop' | 'endBreak' | 'backToWork' | 'extend';

export interface PomoControl {
  id: PomoControlId;
  command: PomoControlCommand;
  label: string;
  /** The filled button of the row. */
  primary: boolean;
}

/**
 * The controls the node offers, in order (pocket-timer.md F2–F4):
 * Pomodoro  running → stop · break · pause   paused → stop · resume
 *           break → end break                 idle → start
 *           done prompt → extend · break · stop
 * Observe   running → break · stop            break → back to work · stop
 *           idle → start                      (no pause)
 */
export function pomoControls(args: {
  observe: boolean;
  status: PomoState['status'];
  promptDone: boolean;
  config: PomoConfig;
}): PomoControl[] {
  const { observe, status, promptDone, config } = args;
  const stop: PomoControl = { id: 'stop', command: stopCommand(observe, config), label: 'Stop', primary: false };
  if (status === 'idle' || status === 'done') {
    return [{ id: 'start', command: 'pomo.start', label: 'Start', primary: true }];
  }
  if (observe) {
    if (status === 'break') {
      return [
        { id: 'backToWork', command: 'pomo.resume', label: 'Back to work', primary: false },
        { ...stop, primary: true },
      ];
    }
    return [
      { id: 'break', command: 'pomo.break', label: 'Break', primary: false },
      { ...stop, primary: true },
    ];
  }
  if (promptDone) {
    return [
      { id: 'extend', command: 'pomo.extend', label: 'Extend', primary: false },
      { id: 'break', command: 'pomo.break', label: 'Break', primary: false },
      { ...stop, primary: true },
    ];
  }
  if (status === 'running') {
    return [stop, { id: 'break', command: 'pomo.break', label: 'Break', primary: false }, { id: 'pause', command: 'pomo.pause', label: 'Pause', primary: true }];
  }
  if (status === 'paused') {
    return [stop, { id: 'resume', command: 'pomo.resume', label: 'Resume', primary: true }];
  }
  // Pomodoro break: the primary ends it (the node's handlePrimary sends pomo.stop).
  return [{ id: 'endBreak', command: 'pomo.stop', label: 'End break', primary: true }];
}

/**
 * The floating timer may also name a span that just ended (Observe, "What was
 * this?"): only this command, only these arguments (pocket-timer.md F13).
 */
export const POCKET_LABEL_COMMAND = 'pomo.retagSegment';

export interface PocketLabelArgs { id: string; taskId: null; label: string; tag?: string }

export function isPocketLabelArgs(v: unknown): v is PocketLabelArgs {
  if (typeof v !== 'object' || v === null) return false;
  const a = v as Record<string, unknown>;
  return typeof a['id'] === 'string' && a['id'].length > 0 && a['id'].length < 80
    && a['taskId'] === null
    && typeof a['label'] === 'string' && a['label'].length > 0 && a['label'].length <= 80
    && (a['tag'] === undefined || (typeof a['tag'] === 'string' && a['tag'].length <= 60));
}

/** The work span the pocket should ask about: the newest one, unnamed, ended in the last 20 minutes. */
export function spanToName(history: PomoState['history'], nowMs: number): PomoState['history'][number] | null {
  const last = [...history].reverse().find((r) => (r.kind ?? 'work') === 'work');
  if (!last || last.taskId || last.label) return null;
  const ended = Date.parse(last.endedAt);
  return Number.isFinite(ended) && nowMs - ended < 20 * 60_000 ? last : null;
}
