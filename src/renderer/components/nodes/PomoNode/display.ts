// What the Pomo face shows for a status: fill level, button label and
// tooltip, session pips. Pure — kept out of index.tsx so React Fast Refresh
// can hot-swap the component.

import type { PomoState } from './types';

/** Derive the pct of remaining time (0–100), used for liquid fill height (F1). */
export function calcRemainingPct(
  status: PomoState['status'],
  remainingMs: number,
  totalMs: number,
): number {
  if (status === 'running' || status === 'break' || status === 'paused') {
    // A zero or broken length (a hand-edited board.json) would make 0/0 = NaN
    // and blank every ring and fill; read it as nothing left.
    if (!(totalMs > 0) || !Number.isFinite(remainingMs)) return 0;
    return Math.max(0, Math.min(100, (remainingMs / totalMs) * 100));
  }
  return status === 'idle' ? 100 : 0;
}

/** Label for the primary action button (F5). */
export function primaryButtonLabel(status: PomoState['status']): string {
  switch (status) {
    case 'running': return 'PAUSE';
    case 'paused':  return 'RESUME';
    case 'break':   return 'END BREAK';
    case 'done':    return 'START';
    default:        return 'START'; // 'idle'
  }
}

/** #6 — tooltip for the primary button, per status. */
export function primaryTooltip(status: PomoState['status']): string {
  switch (status) {
    case 'running': return 'Pause — step away; away-time is excluded from the record';
    case 'paused':  return 'Resume the session';
    case 'break':   return 'End break — records the break up to now, ready for the next session';
    default:        return 'Start a session';
  }
}

/** Pip state for session pip at index i (F6 + Decision 22 derived plannedSessions). */
export function pipState(
  i: number,
  completedDots: number,
  status: PomoState['status'],
): 'done' | 'active' | 'empty' {
  if (i < completedDots) return 'done';
  if (i === completedDots && status === 'running') return 'active';
  return 'empty';
}
