// Decision 28 §2 — shared parity predicates.
// These are the ONLY authoritative implementations of the long-break selector
// and the current-session clamp. No other module may inline these rules.
// Both the FSM (commands.ts / pomoComplete) and the schedule walker
// (pomoSchedule.ts / breakdownPomoTime) must import from here.

import type { PomoConfig } from './types';

/**
 * True iff the break taken AFTER `sessionsCompletedBefore + 1` work sessions
 * is a long break. Used by both `pomoComplete` and `breakdownPomoTime`.
 *
 * Example: sessionsCompletedBefore=3, longBreakEvery=4 → (3+1)%4===0 → true.
 */
export function isLongBreakAfter(
  sessionsCompletedBefore: number,
  cfg: PomoConfig,
): boolean {
  return (sessionsCompletedBefore + 1) % cfg.longBreakEvery === 0;
}

/**
 * Clamp rule for the in-flight session's minutes.
 * Mirrors the rule previously inlined at commandDispatch.ts:611-621.
 * Used by `loadTaskIntoPomo` (commandDispatch) and `breakdownPomoTime`.
 *
 * remainder = plannedMin - pomoSessionsCompleted * sessionMin
 * If remainder ≤ 0 (task over-run) fall back to sessionMin.
 * Always at least 1 minute.
 */
export function computeCurrentSessionMin(
  plannedMin: number,
  pomoSessionsCompleted: number,
  cfg: PomoConfig,
): number {
  const remainder = plannedMin - pomoSessionsCompleted * cfg.sessionMin;
  return Math.max(1, Math.min(remainder > 0 ? remainder : cfg.sessionMin, cfg.sessionMin));
}
