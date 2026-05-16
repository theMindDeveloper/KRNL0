/**
 * Decision 28 §10.1 — Parity gate test.
 *
 * Drives the pomoComplete FSM N times with a deterministic now() stub and
 * collects the (kind, min) sequence (work sessions from history records,
 * breaks from state.breakMin at each break transition). Then calls
 * breakdownPomoTime(plannedMin, 0, cfg) and asserts byte-identical sequences.
 *
 * This test is the load-bearing gate for Decision 28: if the FSM and the
 * schedule walker disagree about when a long break occurs or how sessions
 * are counted, this test fails.
 */

import { describe, it, expect } from 'vitest';
import { pomoComplete, pomoSkipBreak } from '../../../src/renderer/components/nodes/PomoNode/commands';
import type { PomoState } from '../../../src/renderer/components/nodes/PomoNode/types';
import { breakdownPomoTime } from '../../../src/renderer/store/pomoSchedule';
import type { PomoConfig } from '../../../src/renderer/components/nodes/PomoNode/types';

interface Segment {
  kind: 'work' | 'short' | 'long';
  min: number;
}

/**
 * Drive the FSM through a full set of sessions for a task with `plannedMin`
 * total work minutes. Returns (kind, min) pairs matching what breakdownPomoTime
 * would emit.
 *
 * Strategy:
 *  1. Use a deterministic now() that starts at T=0.
 *  2. For each work session:
 *     a. Set startedAt to now; advance now by durationMin*60_000+1 to clear threshold.
 *     b. Call pomoComplete — transitions to 'break' with the correct breakMin.
 *     c. Capture (kind=work, min=durationMin) from the new history record.
 *     d. Capture (kind=short|long, min=breakMin) from the state.
 *     e. SkipBreak to return to idle, then set up next session.
 *  3. Stop when all plannedMin are consumed (session durationMin === 0 would
 *     be clamped to 1, but we stop at remainingMin <= 0).
 */
function drivefsm(
  plannedMin: number,
  cfg: PomoConfig,
): Segment[] {
  let t = 1_000_000; // arbitrary start ms
  let nowT = t;
  const nowFn = () => nowT;
  const uuidFn = () => `uuid-${nowT}`;

  let state: PomoState = {
    status: 'idle',
    startedAt: null,
    durationMin: cfg.sessionMin,
    breakMin: cfg.shortBreakMin,
    label: 'test',
    sessionsCompleted: 0,
    activeTaskId: null,
    history: [],
    pausedAt: null,
    pausedElapsedMs: 0,
  };

  const segments: Segment[] = [];
  let remainingMin = plannedMin;
  let sessionsDone = 0;

  while (remainingMin > 0) {
    // Compute this session's duration (same clamp as computeCurrentSessionMin).
    const remainder = plannedMin - sessionsDone * cfg.sessionMin;
    const sessionMin = Math.max(1, Math.min(remainder > 0 ? remainder : cfg.sessionMin, cfg.sessionMin));

    // Set up: status=running, startedAt=now, durationMin=sessionMin.
    nowT = t;
    state = {
      ...state,
      status: 'running',
      startedAt: new Date(nowT).toISOString(),
      durationMin: sessionMin,
    };

    // Advance time past the session threshold.
    nowT = t + sessionMin * 60_000 + 1;

    // Complete the session.
    state = pomoComplete(state, { config: cfg }, { now: nowFn, uuid: uuidFn });

    // State is now 'break'. Capture the work segment from the latest history record.
    const rec = state.history[state.history.length - 1]!;
    segments.push({ kind: 'work', min: rec.durationMin });

    // Capture the break segment.
    const isLong = state.breakMin === cfg.longBreakMin;
    // Only emit break if there is more work remaining.
    remainingMin -= sessionMin;
    if (remainingMin > 0) {
      segments.push({ kind: isLong ? 'long' : 'short', min: state.breakMin });
    }

    sessionsDone++;
    t = nowT + state.breakMin * 60_000 + 1;

    // Return to idle via skipBreak.
    state = pomoSkipBreak(state);
    state = { ...state, sessionsCompleted: sessionsDone };
  }

  return segments;
}

// ── Tests ───────────────���─────────────────────────────────────────────────────

describe('Decision 28 §10.1 — parity gate: FSM === breakdownPomoTime', () => {
  const cfg: PomoConfig = {
    sessionMin: 25,
    shortBreakMin: 5,
    longBreakMin: 15,
    longBreakEvery: 4,
  };

  it('25-min task (1 session): single work segment, no break', () => {
    const plannedMin = 25;
    const fsm = drivefsm(plannedMin, cfg);
    const { segments } = breakdownPomoTime(plannedMin, 0, cfg);

    const fsmNorm = fsm.map((s) => ({ kind: s.kind, min: s.min }));
    const walkNorm = segments.map((s) => ({ kind: s.kind, min: s.min }));

    expect(fsmNorm).toEqual(walkNorm);
    expect(fsmNorm).toHaveLength(1);
    expect(fsmNorm[0]).toEqual({ kind: 'work', min: 25 });
  });

  it('75-min task (3 sessions): work/short/work/short/work', () => {
    const plannedMin = 75;
    const fsm = drivefsm(plannedMin, cfg);
    const { segments } = breakdownPomoTime(plannedMin, 0, cfg);

    const fsmNorm = fsm.map((s) => ({ kind: s.kind, min: s.min }));
    const walkNorm = segments.map((s) => ({ kind: s.kind, min: s.min }));

    expect(fsmNorm).toEqual(walkNorm);
    // 3 work sessions + 2 short breaks = 5 segments
    expect(fsmNorm).toHaveLength(5);
    expect(fsmNorm.filter((s) => s.kind === 'work')).toHaveLength(3);
    expect(fsmNorm.filter((s) => s.kind === 'short')).toHaveLength(2);
  });

  it('100-min task (4 sessions): all 3 intermediate breaks are short', () => {
    // With longBreakEvery=4:
    // Break after session 1 (sessionsCompletedBefore=0): (0+1)%4=1 → short
    // Break after session 2 (sessionsCompletedBefore=1): (1+1)%4=2 → short
    // Break after session 3 (sessionsCompletedBefore=2): (2+1)%4=3 → short
    // Session 4 is the last — NO break follows it.
    // A long break would occur after session 4 IF there were a session 5,
    // but session 4 is the last, so no break is emitted.
    const plannedMin = 100;
    const fsm = drivefsm(plannedMin, cfg);
    const { segments } = breakdownPomoTime(plannedMin, 0, cfg);

    const fsmNorm = fsm.map((s) => ({ kind: s.kind, min: s.min }));
    const walkNorm = segments.map((s) => ({ kind: s.kind, min: s.min }));

    expect(fsmNorm).toEqual(walkNorm);
    expect(fsmNorm).toHaveLength(7); // 4 work + 3 breaks (no trailing break)
    // All 3 breaks are short
    const breaks = fsmNorm.filter((s) => s.kind !== 'work');
    expect(breaks.every((b) => b.kind === 'short')).toBe(true);
    expect(breaks.every((b) => b.min === 5)).toBe(true);
  });

  it('longBreakEvery=1 (every break is long)', () => {
    const cfg1: PomoConfig = {
      sessionMin: 25,
      shortBreakMin: 5,
      longBreakMin: 15,
      longBreakEvery: 1,
    };
    const plannedMin = 75;
    const fsm = drivefsm(plannedMin, cfg1);
    const { segments } = breakdownPomoTime(plannedMin, 0, cfg1);

    const fsmNorm = fsm.map((s) => ({ kind: s.kind, min: s.min }));
    const walkNorm = segments.map((s) => ({ kind: s.kind, min: s.min }));

    expect(fsmNorm).toEqual(walkNorm);
    // All breaks are long
    const breaks = fsmNorm.filter((s) => s.kind !== 'work');
    expect(breaks.every((b) => b.kind === 'long')).toBe(true);
  });

  it('26-min task: 25-min session + 1-min last session (non-exact boundary)', () => {
    const plannedMin = 26;
    const fsm = drivefsm(plannedMin, cfg);
    const { segments } = breakdownPomoTime(plannedMin, 0, cfg);

    const fsmNorm = fsm.map((s) => ({ kind: s.kind, min: s.min }));
    const walkNorm = segments.map((s) => ({ kind: s.kind, min: s.min }));

    expect(fsmNorm).toEqual(walkNorm);
    expect(fsmNorm).toHaveLength(3); // [work:25, short:5, work:1]
    expect(fsmNorm[2]).toEqual({ kind: 'work', min: 1 });
  });

  it('200-min task (8 sessions): two full longBreakEvery=4 cycles', () => {
    const plannedMin = 200;
    const fsm = drivefsm(plannedMin, cfg);
    const { segments } = breakdownPomoTime(plannedMin, 0, cfg);

    const fsmNorm = fsm.map((s) => ({ kind: s.kind, min: s.min }));
    const walkNorm = segments.map((s) => ({ kind: s.kind, min: s.min }));

    expect(fsmNorm).toEqual(walkNorm);
    // 8 work + 7 breaks. Long breaks at positions after sessions 4 and 8
    // (but 8 is the last, no break after it) → after sessions 4 only.
    // Actually: after session 1(short), 2(short), 3(long), 4(short), 5(short), 6(short), 7(long)
    // Wait: longBreakEvery=4, so (completed+1)%4===0.
    // After session 1: (0+1)%4=1 → short
    // After session 2: (1+1)%4=2 → short
    // After session 3: (2+1)%4=3 → short
    // After session 4: (3+1)%4=0 → long
    // After session 5: (4+1)%4=1 → short
    // After session 6: (5+1)%4=2 → short
    // After session 7: (6+1)%4=3 → short
    // Session 8 is last: no break.
    const longBreaks = fsmNorm.filter((s) => s.kind === 'long');
    expect(longBreaks).toHaveLength(1);
  });
});
