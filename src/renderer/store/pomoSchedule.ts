// Decision 28 §3 — break-math helper.
// Pure: no Date, no store, no IPC. No imports from commandDispatch.ts.
//
// Walk equivalence proof (see §2 comment for the algebra):
// computeCurrentSessionMin(plannedMin, completedSoFar, cfg) where
//   plannedMin = originalPlannedMin (constant),
//   completedSoFar = alreadyCompletedSessions + segmentsConsumedSoFar
// produces:
//   remainder = plannedMin - completedSoFar * sessionMin
//             = (remainingMinLeft after previous work segments consumed)
// So clamp(remainder, 1, sessionMin) = min(remainingMinLeft, sessionMin)
// whenever remainingMinLeft ≥ 1. The simpler form `min(left, sessionMin)` is
// used in the loop; computeCurrentSessionMin is preserved at call-sites where
// the original plannedMin is the natural unit (e.g. commandDispatch clamp).

import type { PomoConfig } from '../components/nodes/PomoNode/types';
import { isLongBreakAfter } from '../components/nodes/PomoNode/pomoRules';

export type PomoSegmentKind = 'work' | 'short' | 'long';

export interface PomoSegment {
  kind: PomoSegmentKind;
  min: number;
  /**
   * 0-based index in the work-session stream this segment belongs to.
   * For 'work': index of this work session (starting at alreadyCompletedSessions).
   * For 'short'/'long': index of the work session that PRECEDED this break.
   */
  sessionIdx: number;
}

export interface PomoBreakdown {
  workMin: number;
  breakMin: number;
  /** workMin + breakMin */
  effectiveMin: number;
  segments: ReadonlyArray<PomoSegment>;
}

/**
 * Walk forward from `alreadyCompletedSessions`, emitting work segments that
 * consume `remainingMin` using the clamp rule, with breaks interspersed
 * between consecutive work segments (no trailing break).
 *
 * @param remainingMin      Minutes of work still to do (may be ≤ 0 → empty).
 * @param alreadyCompletedSessions  Pomo sessions already completed before this task's
 *                                  remaining work begins. Used to determine long vs short
 *                                  break boundaries.
 * @param cfg               The global PomoConfig (session/break lengths + cadence).
 */
export function breakdownPomoTime(
  remainingMin: number,
  alreadyCompletedSessions: number,
  cfg: PomoConfig,
): PomoBreakdown {
  if (remainingMin <= 0) {
    return { workMin: 0, breakMin: 0, effectiveMin: 0, segments: [] };
  }

  const segments: PomoSegment[] = [];
  let remainingMinLeft = remainingMin;
  let workSegmentsEmitted = 0;
  let totalWorkMin = 0;
  let totalBreakMin = 0;

  // Walk: emit work segments until remainingMinLeft is exhausted.
  // After each work segment except the last, emit a break.
  while (remainingMinLeft > 0) {
    // Each work segment consumes min(remainingMinLeft, sessionMin).
    // This is equivalent to computeCurrentSessionMin with the moving cursor:
    //   remainder = remainingMin - workSegmentsEmitted * sessionMin = remainingMinLeft
    const workMin = Math.min(remainingMinLeft, cfg.sessionMin);
    const sessionIdx = alreadyCompletedSessions + workSegmentsEmitted;

    segments.push({ kind: 'work', min: workMin, sessionIdx });
    totalWorkMin += workMin;
    remainingMinLeft -= workMin;
    workSegmentsEmitted++;

    // Emit a break after this work segment only if there is more work to do.
    if (remainingMinLeft > 0) {
      // sessionsCompletedBefore for isLongBreakAfter = sessions done before this break.
      // That equals alreadyCompletedSessions + (workSegmentsEmitted - 1) because
      // we just finished the workSegmentsEmitted-th work segment (0-based: index
      // workSegmentsEmitted-1). isLongBreakAfter(n, cfg) checks (n+1)%longBreakEvery,
      // so n = alreadyCompletedSessions + workSegmentsEmitted - 1.
      const sessionsBeforeBreak = alreadyCompletedSessions + workSegmentsEmitted - 1;
      const isLong = isLongBreakAfter(sessionsBeforeBreak, cfg);
      const breakMin = isLong ? cfg.longBreakMin : cfg.shortBreakMin;
      segments.push({
        kind: isLong ? 'long' : 'short',
        min: breakMin,
        // sessionIdx for a break = index of the work session that preceded it.
        sessionIdx,
      });
      totalBreakMin += breakMin;
    }
  }

  return {
    workMin: totalWorkMin,
    breakMin: totalBreakMin,
    effectiveMin: totalWorkMin + totalBreakMin,
    segments,
  };
}
