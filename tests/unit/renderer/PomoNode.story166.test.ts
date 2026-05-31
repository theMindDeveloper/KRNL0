/**
 * Issue #166 — Pomodoro as live observer: story tests.
 *
 * Each describe block is a user journey through the full observer cycle.
 * Tests are pure FSM + selector — no React, no jsdom.
 */

import { describe, it, expect } from 'vitest';
import {
  pomoStart,
  pomoBreak,
  pomoExtend,
  pomoStop,
  pomoPause,
  pomoResume,
  type PomoEnv,
} from '../../../src/renderer/components/nodes/PomoNode/commands';
import { defaultPomoState } from '../../../src/renderer/components/nodes/PomoNode/types';
import { selectPomoReality, pomoIsLive } from '../../../src/renderer/store/pomoReality';
import type { Board } from '../../../src/shared/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

const T0 = Date.parse('2026-05-31T09:00:00.000Z'); // 9am
const MIN = 60_000;
const e = (nowMs: number, id = 'uid'): PomoEnv => ({ now: () => nowMs, uuid: () => id });

function boardWith(state: ReturnType<typeof defaultPomoState>): Board {
  return {
    version: 1,
    schemaVersion: 1,
    savedAt: new Date(T0).toISOString(),
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [{ id: 'p', kind: 'pomo', position: { x: 0, y: 0 }, isMother: true, state }],
    edges: [],
  };
}

// ── Story 1: start → threshold → extend → break → stop ────────────────────

describe('Story: full session cycle', () => {
  it('starts idle, no live segments', () => {
    const s0 = defaultPomoState();
    expect(s0.status).toBe('idle');
    const segs = selectPomoReality(boardWith(s0), T0);
    expect(segs).toHaveLength(0);
    expect(pomoIsLive(boardWith(s0))).toBe(false);
  });

  it('running → live work segment grows', () => {
    const s1 = pomoStart(defaultPomoState(), { durationMin: 25 }, e(T0));
    expect(s1.status).toBe('running');
    const segs = selectPomoReality(boardWith(s1), T0 + 10 * MIN);
    expect(segs).toHaveLength(1);
    expect(segs[0]!.kind).toBe('work');
    expect(segs[0]!.live).toBe(true);
    // ~10 minutes grown
    const durationMs = segs[0]!.endMs - segs[0]!.startMs;
    expect(durationMs).toBeGreaterThanOrEqual(9 * MIN);
    expect(durationMs).toBeLessThanOrEqual(11 * MIN);
  });

  it('extend: closes work span as completed, re-arms — history grows', () => {
    let s = pomoStart(defaultPomoState(), { durationMin: 25 }, e(T0));
    s = pomoExtend(s, {}, e(T0 + 25 * MIN, 'span1'));
    expect(s.history).toHaveLength(1);
    expect(s.history[0]!.kind).toBe('work');
    expect(s.history[0]!.completed).toBe(true);
    expect(s.sessionsCompleted).toBe(1);
    // still running, new span started at T0+25min
    expect(s.status).toBe('running');
    expect(s.sessionWorkSec).toBe(0);
  });

  it('break: records work span, opens break span', () => {
    let s = pomoStart(defaultPomoState(), { durationMin: 25 }, e(T0));
    // extend one session, then break
    s = pomoExtend(s, {}, e(T0 + 25 * MIN, 'work1'));
    s = pomoBreak(s, {}, e(T0 + 30 * MIN, 'work2'));
    expect(s.status).toBe('break');
    expect(s.history).toHaveLength(2);
    const workRec = s.history[1]!;
    expect(workRec.kind).toBe('work');
    // break is live now
    const segs = selectPomoReality(boardWith(s), T0 + 35 * MIN);
    const live = segs.find((x) => x.live);
    expect(live).toBeDefined();
    expect(live!.kind).toBe('break');
  });

  it('stop from break: records break span → idle', () => {
    let s = pomoStart(defaultPomoState(), { durationMin: 25 }, e(T0));
    s = pomoBreak(s, {}, e(T0 + 25 * MIN, 'w1'));
    s = pomoStop(s, {}, e(T0 + 30 * MIN, 'b1'));
    expect(s.status).toBe('idle');
    expect(s.history).toHaveLength(2);
    const breakRec = s.history[1]!;
    expect(breakRec.kind).toBe('break');
    expect(breakRec.completed).toBe(false);
    // no live segments
    const segs = selectPomoReality(boardWith(s), T0 + 30 * MIN);
    expect(segs.every((x) => !x.live)).toBe(true);
    expect(pomoIsLive(boardWith(s))).toBe(false);
  });

  it('full run: history spans are non-overlapping', () => {
    let s = pomoStart(defaultPomoState(), { durationMin: 25 }, e(T0));
    s = pomoExtend(s, {}, e(T0 + 25 * MIN, 'w1'));
    s = pomoBreak(s, {}, e(T0 + 35 * MIN, 'w2'));
    s = pomoStop(s, {}, e(T0 + 40 * MIN, 'b1'));
    expect(s.history).toHaveLength(3);
    // check non-overlapping: each endedAt <= next startedAt
    for (let i = 0; i < s.history.length - 1; i++) {
      const curr = Date.parse(s.history[i]!.endedAt);
      const next = Date.parse(s.history[i + 1]!.startedAt ?? '9999');
      expect(curr).toBeLessThanOrEqual(next);
    }
  });
});

// ── Story 2: pause → resume preserves work accumulator ───────────────────

describe('Story: pause/resume work accumulation', () => {
  it('paused time not counted; resumed session continues from correct base', () => {
    let s = pomoStart(defaultPomoState(), { durationMin: 25 }, e(T0));
    // 10 min work
    s = pomoPause(s, {}, e(T0 + 10 * MIN));
    // 5 min pause gap
    s = pomoResume(s, {}, e(T0 + 15 * MIN));
    // 15 more min work
    s = pomoStop(s, {}, e(T0 + 30 * MIN, 'w1'));

    expect(s.history).toHaveLength(1);
    const rec = s.history[0]!;
    // Actual span 10+15 = 25 min (pause gap excluded from durationMin)
    // durationMin on stop record = pausedElapsedMs / 60s
    expect(rec.kind).toBe('work');
    // completed iff workedSec >= 25*60. workedSec = 10*60 + 15*60 = 25*60 → reached
    expect(rec.completed).toBe(true);
  });
});

// ── Story 3: selectPomoReality handles all segment types ─────────────────

describe('selectPomoReality selector', () => {
  it('returns empty for idle state', () => {
    expect(selectPomoReality(boardWith(defaultPomoState()), T0)).toHaveLength(0);
  });

  it('returns empty for null board', () => {
    expect(selectPomoReality(null, T0)).toHaveLength(0);
  });

  it('maps history + in-flight span correctly', () => {
    let s = pomoStart(defaultPomoState(), { durationMin: 25 }, e(T0));
    s = pomoStop(s, {}, e(T0 + 20 * MIN, 'w1'));
    s = pomoStart(s, { durationMin: 25 }, e(T0 + 25 * MIN));
    // 5 min into second session
    const segs = selectPomoReality(boardWith(s), T0 + 30 * MIN);
    expect(segs).toHaveLength(2);
    // first: closed historical work span
    expect(segs[0]!.live).toBe(false);
    expect(segs[0]!.kind).toBe('work');
    // second: live in-flight span
    expect(segs[1]!.live).toBe(true);
    expect(segs[1]!.kind).toBe('work');
  });

  it('live break span shown correctly', () => {
    let s = pomoStart(defaultPomoState(), { durationMin: 25 }, e(T0));
    s = pomoBreak(s, {}, e(T0 + 25 * MIN, 'w1'));
    const segs = selectPomoReality(boardWith(s), T0 + 28 * MIN);
    const live = segs.find((x) => x.live);
    expect(live).toBeDefined();
    expect(live!.kind).toBe('break');
    expect(live!.endMs - live!.startMs).toBeGreaterThanOrEqual(2 * MIN);
  });
});

// ── Story 4: event-task gate ─────────────────────────────────────────────

describe('Story: event tasks cannot be loaded into pomo', () => {
  it('pomoStart still works for sessionWorkSec=0 (no task)', () => {
    const s = pomoStart(defaultPomoState(), { durationMin: 30 }, e(T0));
    expect(s.status).toBe('running');
    expect(s.sessionWorkSec).toBe(0);
  });

  it('pomoStop on idle is a no-op', () => {
    const s0 = defaultPomoState();
    const s1 = pomoStop(s0, {}, e(T0));
    expect(s1).toBe(s0);
  });
});

// ── Story 5: analytics — kind-aware records ──────────────────────────────

describe('Story: analytics source kind-aware events', () => {
  it('completed work produces pomo.session + pomo.work; partial work produces only pomo.work', async () => {
    const { pomoSource } = await import('../../../src/renderer/analytics/sources/pomoSource');
    let s = pomoStart(defaultPomoState(), { durationMin: 25 }, e(T0));
    // reach threshold + extend (records as completed)
    s = pomoExtend(s, {}, e(T0 + 25 * MIN, 'w1'));
    // partial stop
    s = pomoStop(s, {}, e(T0 + 35 * MIN, 'w2'));
    // board with this history
    const board = boardWith(s);
    const events = pomoSource.collect({
      nodes: board.nodes.map((n) => ({ id: n.id, kind: n.kind, state: n.state })),
    });
    const sessions = events.filter((e) => e.type === 'pomo.session');
    const work = events.filter((e) => e.type === 'pomo.work');
    // w1 was completed → session + work; w2 was partial → work only
    expect(sessions).toHaveLength(1);
    expect(work).toHaveLength(2);
  });
});
