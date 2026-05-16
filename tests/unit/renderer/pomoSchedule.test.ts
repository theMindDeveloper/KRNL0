/**
 * Decision 28 §10.2 — Table-driven breakdownPomoTime tests.
 *
 * Cases:
 *   - remainingMin = 0 (empty)
 *   - remainingMin < 0 (treated as empty)
 *   - 1-session task (plannedMin <= sessionMin)
 *   - mid-session resume (alreadyCompletedSessions > 0)
 *   - exact longBreakEvery boundary (long break occurs)
 *   - longBreakEvery = 1 (every break is long)
 *   - remainingMin = sessionMin exactly
 *   - remainingMin = sessionMin + 1 (last session is 1 min)
 */

import { describe, it, expect } from 'vitest';
import { breakdownPomoTime } from '../../../src/renderer/store/pomoSchedule';
import type { PomoConfig } from '../../../src/renderer/components/nodes/PomoNode/types';

const stdCfg: PomoConfig = {
  sessionMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  longBreakEvery: 4,
};

describe('breakdownPomoTime — empty inputs', () => {
  it('remainingMin = 0 → empty breakdown', () => {
    const result = breakdownPomoTime(0, 0, stdCfg);
    expect(result).toEqual({
      workMin: 0,
      breakMin: 0,
      effectiveMin: 0,
      segments: [],
    });
  });

  it('remainingMin < 0 → empty breakdown', () => {
    const result = breakdownPomoTime(-5, 0, stdCfg);
    expect(result).toEqual({
      workMin: 0,
      breakMin: 0,
      effectiveMin: 0,
      segments: [],
    });
  });
});

describe('breakdownPomoTime — single session', () => {
  it('remainingMin = sessionMin exactly → one work segment, no break', () => {
    const result = breakdownPomoTime(25, 0, stdCfg);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toEqual({ kind: 'work', min: 25, sessionIdx: 0 });
    expect(result.workMin).toBe(25);
    expect(result.breakMin).toBe(0);
    expect(result.effectiveMin).toBe(25);
  });

  it('remainingMin < sessionMin → one truncated work segment, no break', () => {
    const result = breakdownPomoTime(10, 0, stdCfg);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toEqual({ kind: 'work', min: 10, sessionIdx: 0 });
    expect(result.breakMin).toBe(0);
  });
});

describe('breakdownPomoTime — multi-session', () => {
  it('2 full sessions → work/short/work (no trailing break)', () => {
    const result = breakdownPomoTime(50, 0, stdCfg);
    expect(result.segments).toHaveLength(3);
    expect(result.segments[0]).toEqual({ kind: 'work', min: 25, sessionIdx: 0 });
    expect(result.segments[1]).toEqual({ kind: 'short', min: 5, sessionIdx: 0 });
    expect(result.segments[2]).toEqual({ kind: 'work', min: 25, sessionIdx: 1 });
    expect(result.workMin).toBe(50);
    expect(result.breakMin).toBe(5);
    expect(result.effectiveMin).toBe(55);
  });

  it('3 sessions (75 min) → work/short/work/short/work', () => {
    const result = breakdownPomoTime(75, 0, stdCfg);
    expect(result.segments).toHaveLength(5);
    expect(result.segments[1]).toMatchObject({ kind: 'short', min: 5 });
    expect(result.segments[3]).toMatchObject({ kind: 'short', min: 5 });
    expect(result.workMin).toBe(75);
    expect(result.breakMin).toBe(10);
    expect(result.effectiveMin).toBe(85);
  });

  it('remainingMin = sessionMin + 1 → last session is 1 min', () => {
    const result = breakdownPomoTime(26, 0, stdCfg);
    expect(result.segments).toHaveLength(3);
    expect(result.segments[0]).toEqual({ kind: 'work', min: 25, sessionIdx: 0 });
    expect(result.segments[1]).toEqual({ kind: 'short', min: 5, sessionIdx: 0 });
    expect(result.segments[2]).toEqual({ kind: 'work', min: 1, sessionIdx: 1 });
    expect(result.workMin).toBe(26);
    expect(result.breakMin).toBe(5);
  });
});

describe('breakdownPomoTime — exact longBreakEvery boundary', () => {
  it('4 sessions (100 min): long break appears after 4th-to-last session', () => {
    // With longBreakEvery=4:
    // After session 1 (sessionIdx=0): (0+1)%4=1 → short
    // After session 2 (sessionIdx=1): (1+1)%4=2 → short
    // After session 3 (sessionIdx=2): (2+1)%4=3 → short
    // Session 4 (sessionIdx=3) is last — no trailing break.
    // So all 3 intermediate breaks are short.
    const result = breakdownPomoTime(100, 0, stdCfg);
    expect(result.segments).toHaveLength(7); // 4 work + 3 breaks
    const breaks = result.segments.filter((s) => s.kind !== 'work');
    expect(breaks).toHaveLength(3);
    expect(breaks.every((b) => b.kind === 'short')).toBe(true);
  });

  it('5 sessions (125 min): long break after 4th session (between 4th and 5th)', () => {
    // alreadyCompletedSessions=0, so sessionsCompletedBefore when checking break
    // between session 4 and 5 = 3 (0-based index of session 4).
    // isLongBreakAfter(3, cfg) = (3+1)%4=0 → long!
    const result = breakdownPomoTime(125, 0, stdCfg);
    expect(result.segments).toHaveLength(9); // 5 work + 4 breaks
    const breaks = result.segments.filter((s) => s.kind !== 'work');
    const longBreaks = breaks.filter((b) => b.kind === 'long');
    const shortBreaks = breaks.filter((b) => b.kind === 'short');
    expect(longBreaks).toHaveLength(1);
    expect(shortBreaks).toHaveLength(3);
    expect(longBreaks[0]!.min).toBe(15);
    // The long break appears at index 7 (after 4th work segment, 0-indexed: seg[6])
    expect(result.segments[7]).toMatchObject({ kind: 'long', min: 15, sessionIdx: 3 });
  });
});

describe('breakdownPomoTime — longBreakEvery = 1', () => {
  it('every break is a long break', () => {
    const cfg1: PomoConfig = { sessionMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 1 };
    const result = breakdownPomoTime(75, 0, cfg1);
    // 3 sessions, 2 breaks — all long
    expect(result.segments).toHaveLength(5);
    const breaks = result.segments.filter((s) => s.kind !== 'work');
    expect(breaks.every((b) => b.kind === 'long')).toBe(true);
    expect(breaks.every((b) => b.min === 15)).toBe(true);
  });
});

describe('breakdownPomoTime — mid-session resume (alreadyCompletedSessions > 0)', () => {
  it('alreadyCompletedSessions=3: next break (after 1 more) is long (4th total)', () => {
    // alreadyCompletedSessions=3, so the first break uses sessionsCompletedBefore=3.
    // isLongBreakAfter(3, cfg) = (3+1)%4=0 → long!
    const result = breakdownPomoTime(50, 3, stdCfg);
    // 2 sessions needed; break between them is long.
    expect(result.segments).toHaveLength(3);
    expect(result.segments[0]).toMatchObject({ kind: 'work', min: 25, sessionIdx: 3 });
    expect(result.segments[1]).toMatchObject({ kind: 'long', min: 15, sessionIdx: 3 });
    expect(result.segments[2]).toMatchObject({ kind: 'work', min: 25, sessionIdx: 4 });
    expect(result.breakMin).toBe(15);
  });

  it('alreadyCompletedSessions=0: 1 session remaining, breakMin=0 (no break after last)', () => {
    const result = breakdownPomoTime(25, 0, stdCfg);
    expect(result.breakMin).toBe(0);
    expect(result.segments).toHaveLength(1);
  });

  it('alreadyCompletedSessions=2, remainingMin=25: single session → no break', () => {
    const result = breakdownPomoTime(25, 2, stdCfg);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toMatchObject({ kind: 'work', sessionIdx: 2 });
    expect(result.breakMin).toBe(0);
  });
});

describe('breakdownPomoTime — sessionIdx correctness', () => {
  it('break sessionIdx matches the preceding work segment sessionIdx', () => {
    const result = breakdownPomoTime(75, 0, stdCfg);
    // segments: [work:0, short:0, work:1, short:1, work:2]
    expect(result.segments[0]!.sessionIdx).toBe(0); // first work
    expect(result.segments[1]!.sessionIdx).toBe(0); // break after first work
    expect(result.segments[2]!.sessionIdx).toBe(1); // second work
    expect(result.segments[3]!.sessionIdx).toBe(1); // break after second work
    expect(result.segments[4]!.sessionIdx).toBe(2); // third work
  });

  it('with alreadyCompletedSessions=5, sessionIdx starts at 5', () => {
    const result = breakdownPomoTime(50, 5, stdCfg);
    expect(result.segments[0]!.sessionIdx).toBe(5);
    expect(result.segments[1]!.sessionIdx).toBe(5); // break after session 5
    expect(result.segments[2]!.sessionIdx).toBe(6);
  });
});
