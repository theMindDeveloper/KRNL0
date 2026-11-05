// #201 — the clock follows "now" by default.
//
// `selectedDate` / `viewWindow` stay persisted (ADR 0004 §3), so a board saved
// yesterday reopens on yesterday. These pure rules decide when the clock moves
// itself back to today / the current 12-hour half, without ever snapping back
// a user who is deliberately browsing another day:
//
//   • App start: a selectedDate that is not in the future snaps to now.
//   • Local day change (midnight, or waking from sleep): only if the clock was
//     showing the day that just ended.
//   • Noon / midnight half flip on the same day: only if the clock was showing
//     today AND the half that just ended.
//
// Every move is an existing command (clock.goNow / clock.setViewWindow), so the
// sys CLI and the UI buttons reach exactly the same states.

import { isValidYMD } from '../../../../shared/ymd';
import type { ClockState } from './types';

export type ClockFollowCommand =
  | { command: 'clock.goNow'; args: Record<string, never> }
  | { command: 'clock.setViewWindow'; args: { window: 0 | 1 } };

export interface ClockNowMark {
  /** Local YYYY-MM-DD of the real day. */
  today: string;
  /** 12-hour half containing now: 0 = AM, 1 = PM. */
  half: 0 | 1;
}

type ClockView = Pick<ClockState, 'selectedDate' | 'viewWindow'>;

const GO_NOW: ClockFollowCommand = { command: 'clock.goNow', args: {} };

/** 12-hour half (0 = AM, 1 = PM) that contains `d`. */
export function halfOf(d: Date): 0 | 1 {
  return d.getHours() >= 12 ? 1 : 0;
}

/** App start: snap a past (or invalid) day — and today's other half — to now.
 *  A future day is kept: that is a deliberate look ahead. */
export function startupFollow(view: ClockView, now: ClockNowMark): ClockFollowCommand | null {
  if (!isValidYMD(view.selectedDate) || view.selectedDate < now.today) return GO_NOW;
  if (view.selectedDate === now.today && view.viewWindow !== now.half) return GO_NOW;
  return null;
}

/** A tick moved the real time from `prev` to `next`: follow it if the clock
 *  was showing the moment that just ended; leave a browsed day alone. */
export function rolloverFollow(
  prev: ClockNowMark,
  next: ClockNowMark,
  view: ClockView,
): ClockFollowCommand | null {
  if (prev.today !== next.today) {
    if (view.selectedDate !== prev.today) return null;
    return GO_NOW;
  }
  if (prev.half !== next.half) {
    if (view.selectedDate !== next.today || view.viewWindow !== prev.half) return null;
    return { command: 'clock.setViewWindow', args: { window: next.half } };
  }
  return null;
}

// The startup rule runs once per clock per app session — a remount (dial-only,
// station mode, canvas virtualisation) must not snap a browsing user back.
const startupDone = new Set<string>();

/** True the first time it is called for `nodeId` in this renderer session. */
export function claimStartup(nodeId: string): boolean {
  if (startupDone.has(nodeId)) return false;
  startupDone.add(nodeId);
  return true;
}

/** Test hook: forget which clocks already ran their startup rule. */
export function resetClockStartupForTests(): void {
  startupDone.clear();
}
