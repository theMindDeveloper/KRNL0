// Everything the three pocket looks (dial, capsule, box) show, worked out once
// from the snapshot with the node's own rules (derive.ts, daySpans.ts).

import type { CSSProperties } from 'react';
import type { PocketSnapshot } from '../../shared/pocket';
import {
  formatElapsed,
  formatRemaining,
  isObserve,
  isPromptDone,
  pomoClock,
  pomoControls,
  type PomoClock,
  type PomoControl,
} from '../components/nodes/PomoNode/derive';
import { calcRemainingPct } from '../components/nodes/PomoNode/display';
import { todaySpans, type DaySpans } from '../components/nodes/PomoNode/daySpans';

export interface PocketModel {
  snap: PocketSnapshot;
  now: number;
  observe: boolean;
  clock: PomoClock;
  promptDone: boolean;
  controls: PomoControl[];
  onBreak: boolean;
  paused: boolean;
  idle: boolean;
  /** "15:42" Pomodoro (left; on a break, elapsed), "1:12:08" Observe. */
  time: string;
  /** 0–1 left of the session (Pomodoro), for rings and meters. */
  remaining: number;
  /** 0–1 of the short break used, for the break ring. */
  breakUsed: number;
  doneDots: number;
  pips: number;
  /** What is being worked on, if the node knows ("outline ch. 3"). */
  task: string | null;
  /** Mode colour of the state: acid focus, cyan break, rust observe, grey paused. */
  tone: string;
  day: DaySpans;
}

export function buildModel(snap: PocketSnapshot, now: number): PocketModel {
  const { state, config } = snap;
  const observe = isObserve(config, snap.easy);
  const clock = pomoClock(state, config, now);
  const promptDone = isPromptDone(observe, snap.away, state.status, clock);
  const controls = snap.away ? [] : pomoControls({ observe, status: state.status, promptDone, config });
  const onBreak = state.status === 'break';
  const paused = state.status === 'paused';
  const idle = state.status === 'idle' || state.status === 'done';
  const time = observe
    ? formatElapsed(onBreak ? clock.breakElapsedMs : clock.liveWorkMs)
    : idle ? formatRemaining(clock.sessionMin * 60_000)
    : onBreak ? formatRemaining(clock.breakElapsedMs) : formatRemaining(clock.remainingMs);
  const pips = Math.max(1, config.longBreakEvery);
  const breakMs = Math.max(1, config.shortBreakMin * 60_000);
  const task = !snap.easy && state.activeTaskId !== null && state.label ? state.label : null;
  return {
    snap, now, observe, clock, promptDone, controls, onBreak, paused, idle, time,
    remaining: calcRemainingPct(state.status, clock.remainingMs, clock.thresholdMs) / 100,
    breakUsed: Math.min(1, clock.breakElapsedMs / breakMs),
    doneDots: state.sessionsCompleted % pips,
    pips,
    task,
    tone: onBreak ? CYAN : paused ? MUTED : observe ? RUST : ACID,
    day: todaySpans(state, snap.library, now, snap.easy),
  };
}

// The floating looks float over any app, so they keep the dark palette of the
// designs in every theme.
export const ACID = '#c9f158';
export const CYAN = '#22d3ee';
export const RUST = '#ee8466';
export const MUTED = '#8f8572';
export const INK = '#f4efe2';
export const INK3 = '#b3aa94';
export const COAL = '#0e0d0b';
export const EDGE = '#3a352c';

// Electron's window drag region; buttons opt out so they stay clickable.
export const DRAG = { WebkitAppRegion: 'drag' } as unknown as CSSProperties;
export const NO_DRAG = { WebkitAppRegion: 'no-drag' } as unknown as CSSProperties;

export const MONO = "'JetBrains Mono', ui-monospace, monospace";

export function runControl(c: PomoControl): void {
  void window.krnl?.pocketCommand?.(c.command);
}
export function openMain(): void {
  window.krnl?.pocketOpenMain?.();
}
export function setCollapsed(v: boolean): void {
  window.krnl?.pocketCollapse?.(v);
}

/** Clock time when the session ends, "09:34". */
export function endsAt(m: PocketModel): string {
  const d = new Date(m.now + m.clock.remainingMs);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
