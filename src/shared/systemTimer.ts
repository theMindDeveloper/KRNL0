// Time at a glance outside the window (launch-experience.md F10–F11):
// progress on the Windows taskbar icon and the time in the Mac menu bar.
// Pure: turns the Pomo snapshot main already receives (Decision 37) into
// what the OS surfaces show, with the node's own timing and controls.

import type { PocketSnapshot } from './pocket';
import { formatElapsed, formatRemaining, isObserve, isPromptDone, pomoClock, pomoControls, type PomoControl } from '../renderer/components/nodes/PomoNode/derive';

export interface SystemTimerView {
  /** Nothing is being timed: hide the tray and clear the bar. */
  live: boolean;
  observe: boolean;
  /** Menu bar title / taskbar tooltip time: "15:42", "1:12:08 ↑", "break 04:12". */
  time: string;
  /** One line under the time: "Focus · 2 of 4", "Observe · working", "Paused". */
  label: string;
  /** Taskbar bar 0–1; null = no bar (Observe has no target, so it shows a dot). */
  progress: number | null;
  /** Windows paints a paused bar yellow. */
  barMode: 'normal' | 'paused' | 'none';
  /** Small badge on the taskbar icon. */
  badge: 'break' | 'observe' | null;
  controls: PomoControl[];
}

export const IDLE_VIEW: SystemTimerView = {
  live: false, observe: false, time: '', label: 'Idle', progress: null, barMode: 'none', badge: null, controls: [],
};

export function systemTimerView(snap: PocketSnapshot | null, nowMs: number): SystemTimerView {
  if (!snap) return IDLE_VIEW;
  const { state, config } = snap;
  const status = state.status;
  if (status !== 'running' && status !== 'paused' && status !== 'break') return IDLE_VIEW;
  const observe = isObserve(config, snap.easy);
  const clock = pomoClock(state, config, nowMs);
  const promptDone = isPromptDone(observe, snap.away, status, clock);
  const controls = snap.away ? [] : pomoControls({ observe, status, promptDone, config });

  if (status === 'break') {
    return {
      live: true, observe, time: `break ${formatElapsed(clock.breakElapsedMs)}`, label: observe ? 'Observe · break' : 'Break',
      progress: null, barMode: 'none', badge: 'break', controls,
    };
  }
  if (observe) {
    return {
      live: true, observe, time: `${formatElapsed(clock.liveWorkMs)} ↑`, label: 'Observe · working',
      progress: null, barMode: 'none', badge: 'observe', controls,
    };
  }
  const fraction = clock.thresholdMs > 0 ? Math.min(1, clock.liveWorkMs / clock.thresholdMs) : 0;
  const cycle = config.longBreakEvery > 0 ? `${(state.sessionsCompleted % config.longBreakEvery) + 1} of ${config.longBreakEvery}` : '';
  return {
    live: true,
    observe,
    time: promptDone ? 'done?' : formatRemaining(clock.remainingMs),
    label: status === 'paused' ? 'Paused' : promptDone ? 'Session done · extend, break or stop' : `Focus${cycle ? ` · ${cycle}` : ''}`,
    progress: fraction,
    barMode: status === 'paused' ? 'paused' : 'normal',
    badge: null,
    controls,
  };
}
