import { describe, it, expect } from 'vitest';
import {
  pomoStart,
  pomoCancel,
  pomoComplete,
  pomoSkipBreak,
  pomoEndBreak,
  pomoSetLabel,
  pomoSetDuration,
  pomoBreak,
  pomoExtend,
  pomoStop,
  pomoDeleteSegment,
  pomoDiscard,
  type PomoEnv,
} from '../../../src/renderer/components/nodes/PomoNode/commands';
import { defaultPomoState } from '../../../src/renderer/components/nodes/PomoNode/types';
import type { PomoSessionRecord } from '../../../src/renderer/components/nodes/PomoNode/types';

const seg = (id: string): PomoSessionRecord => ({
  id, startedAt: '2026-05-10T09:00:00.000Z', endedAt: '2026-05-10T09:25:00.000Z',
  durationMin: 25, label: '', completed: true, taskId: null, kind: 'work',
});

describe('pomoDiscard (#2/#6 — RESET records nothing)', () => {
  it('running → idle without writing a history record', () => {
    const running = pomoStart(defaultPomoState(), { label: 'x' }, env(T0));
    const next = pomoDiscard(running);
    expect(next.status).toBe('idle');
    expect(next.startedAt).toBeNull();
    expect(next.history).toHaveLength(0);
  });

  it('no-op when idle (same reference)', () => {
    const s = defaultPomoState();
    expect(pomoDiscard(s)).toBe(s);
  });

  it('clears in-flight accumulators', () => {
    const s = { ...defaultPomoState(), status: 'paused' as const, sessionWorkSec: 120, pausedElapsedMs: 5000, startedAt: '2026-05-10T12:00:00.000Z', pausedAt: '2026-05-10T12:05:00.000Z' };
    const next = pomoDiscard(s);
    expect(next.sessionWorkSec).toBe(0);
    expect(next.pausedElapsedMs).toBe(0);
    expect(next.history).toHaveLength(0);
  });
});

describe('pomoDeleteSegment (#12)', () => {
  it('removes the segment with the matching id', () => {
    const s = { ...defaultPomoState(), history: [seg('a'), seg('b')] };
    const next = pomoDeleteSegment(s, { id: 'a' });
    expect(next.history.map((r) => r.id)).toEqual(['b']);
  });

  it('is a no-op when the id is absent (same reference)', () => {
    const s = { ...defaultPomoState(), history: [seg('a')] };
    expect(pomoDeleteSegment(s, { id: 'zzz' })).toBe(s);
  });

  it('is a no-op on empty/missing id', () => {
    const s = { ...defaultPomoState(), history: [seg('a')] };
    expect(pomoDeleteSegment(s, { id: '' })).toBe(s);
  });
});

const T0 = Date.parse('2026-05-10T12:00:00.000Z');
const env = (nowMs: number, uuid = 'fixed-uuid'): PomoEnv => ({ now: () => nowMs, uuid: () => uuid });

describe('PomoNode FSM (Decision #9)', () => {
  describe('pomo.start', () => {
    it('transitions idle → running and stamps startedAt', () => {
      const next = pomoStart(defaultPomoState(), { label: 'deep work' }, env(T0));
      expect(next.status).toBe('running');
      expect(next.startedAt).toBe(new Date(T0).toISOString());
      expect(next.label).toBe('deep work');
    });

    it('transitions done → running', () => {
      const s = { ...defaultPomoState(), status: 'done' as const };
      const next = pomoStart(s, {}, env(T0));
      expect(next.status).toBe('running');
    });

    it('is a no-op when already running', () => {
      const s = pomoStart(defaultPomoState(), {}, env(T0));
      const next = pomoStart(s, {}, env(T0 + 1000));
      expect(next).toBe(s);
    });

    it('is a no-op while on break', () => {
      const s = { ...defaultPomoState(), status: 'break' as const, startedAt: new Date(T0).toISOString() };
      const next = pomoStart(s, {}, env(T0 + 1000));
      expect(next).toBe(s);
    });

    it('honors durationMin override', () => {
      const next = pomoStart(defaultPomoState(), { durationMin: 50 }, env(T0));
      expect(next.durationMin).toBe(50);
    });
  });

  describe('pomo.cancel', () => {
    it('appends a non-completed history record and returns to idle', () => {
      const running = pomoStart(defaultPomoState(), { label: 'x' }, env(T0));
      const next = pomoCancel(running, {}, env(T0 + 60_000, 'abc'));
      expect(next.status).toBe('idle');
      expect(next.startedAt).toBeNull();
      expect(next.history).toHaveLength(1);
      expect(next.history[0]).toMatchObject({ id: 'abc', completed: false, label: 'x' });
    });

    it('is a no-op when idle', () => {
      const s = defaultPomoState();
      expect(pomoCancel(s, {}, env(T0))).toBe(s);
    });
  });

  describe('pomo.complete', () => {
    it('rejects before duration elapses', () => {
      const running = pomoStart(defaultPomoState(), {}, env(T0));
      const next = pomoComplete(running, {}, env(T0 + 10_000));
      expect(next).toBe(running);
    });

    it('transitions running → break, increments sessionsCompleted, logs completed record', () => {
      const running = pomoStart(defaultPomoState(), { label: 'focus' }, env(T0));
      const after = pomoComplete(running, {}, env(T0 + 25 * 60_000, 'rec1'));
      expect(after.status).toBe('break');
      expect(after.startedAt).toBe(new Date(T0 + 25 * 60_000).toISOString());
      expect(after.sessionsCompleted).toBe(1);
      expect(after.history).toEqual([
        {
          id: 'rec1',
          startedAt: new Date(T0).toISOString(),
          endedAt: new Date(T0 + 25 * 60_000).toISOString(),
          durationMin: 25,
          label: 'focus',
          completed: true,
          taskId: null,
          kind: 'work',
        },
      ]);
    });

    it('is a no-op when not running', () => {
      const s = defaultPomoState();
      expect(pomoComplete(s, {}, env(T0))).toBe(s);
    });
  });

  describe('break transitions', () => {
    it('pomo.skipBreak returns to idle from break', () => {
      const running = pomoStart(defaultPomoState(), {}, env(T0));
      const onBreak = pomoComplete(running, {}, env(T0 + 25 * 60_000));
      const next = pomoSkipBreak(onBreak);
      expect(next.status).toBe('idle');
      expect(next.startedAt).toBeNull();
    });

    it('pomo.skipBreak is a no-op when not on break', () => {
      const s = defaultPomoState();
      expect(pomoSkipBreak(s)).toBe(s);
    });

    it('pomo.endBreak rejects before breakMin elapses', () => {
      const running = pomoStart(defaultPomoState(), {}, env(T0));
      const onBreak = pomoComplete(running, {}, env(T0 + 25 * 60_000));
      const next = pomoEndBreak(onBreak, {}, env(T0 + 25 * 60_000 + 60_000));
      expect(next).toBe(onBreak);
    });

    it('pomo.endBreak transitions break → idle once breakMin elapses', () => {
      const running = pomoStart(defaultPomoState(), {}, env(T0));
      const onBreak = pomoComplete(running, {}, env(T0 + 25 * 60_000));
      const next = pomoEndBreak(onBreak, {}, env(T0 + 25 * 60_000 + 5 * 60_000));
      expect(next.status).toBe('idle');
      expect(next.startedAt).toBeNull();
    });
  });

  describe('configuration commands', () => {
    it('pomo.setLabel updates label in any state', () => {
      const s = defaultPomoState();
      expect(pomoSetLabel(s, { label: 'reading' }).label).toBe('reading');
    });

    it('pomo.setDuration updates duration when not running', () => {
      const s = defaultPomoState();
      expect(pomoSetDuration(s, { minutes: 50 }).durationMin).toBe(50);
    });

    it('pomo.setDuration is a no-op while running', () => {
      const running = pomoStart(defaultPomoState(), {}, env(T0));
      expect(pomoSetDuration(running, { minutes: 50 })).toBe(running);
    });
  });

  // ── Issue #166 — observer-model verbs ──────────────────────────────────────
  const MIN = 60_000;
  describe('pomo.break (Issue #166)', () => {
    it('records the work span (completed iff threshold reached) and opens a break span', () => {
      const running = pomoStart(defaultPomoState(), { label: 'code' }, env(T0));
      // 25-min default threshold; run a full session then break.
      const onBreak = pomoBreak(running, {}, env(T0 + 25 * MIN, 'w1'));
      expect(onBreak.status).toBe('break');
      expect(onBreak.startedAt).toBe(new Date(T0 + 25 * MIN).toISOString());
      expect(onBreak.sessionWorkSec).toBe(0);
      expect(onBreak.sessionsCompleted).toBe(1); // threshold reached
      expect(onBreak.history).toHaveLength(1);
      expect(onBreak.history[0]).toMatchObject({
        kind: 'work', completed: true, durationMin: 25, label: 'code',
      });
    });

    it('marks the work span partial (completed:false) when broken before threshold', () => {
      const running = pomoStart(defaultPomoState(), {}, env(T0));
      const onBreak = pomoBreak(running, {}, env(T0 + 10 * MIN, 'w1'));
      expect(onBreak.sessionsCompleted).toBe(0);
      expect(onBreak.history[0]).toMatchObject({ kind: 'work', completed: false, durationMin: 10 });
    });

    it('is a no-op when idle', () => {
      const s = defaultPomoState();
      expect(pomoBreak(s, {}, env(T0))).toBe(s);
    });
  });

  describe('pomo.extend (Issue #166)', () => {
    it('closes a completed pomodoro, re-arms sessionWorkSec, and opens a fresh work span', () => {
      const running = pomoStart(defaultPomoState(), { label: 'code' }, env(T0));
      const extended = pomoExtend(running, {}, env(T0 + 25 * MIN, 'w1'));
      expect(extended.status).toBe('running');
      expect(extended.startedAt).toBe(new Date(T0 + 25 * MIN).toISOString());
      expect(extended.sessionWorkSec).toBe(0); // re-armed → prompt won't re-fire
      expect(extended.sessionsCompleted).toBe(1);
      expect(extended.history).toHaveLength(1);
      expect(extended.history[0]).toMatchObject({ kind: 'work', completed: true, durationMin: 25 });
    });

    it('is a no-op when not running', () => {
      const s = defaultPomoState();
      expect(pomoExtend(s, {}, env(T0))).toBe(s);
    });
  });

  describe('pomo.stop (Issue #166)', () => {
    it('records the final work span and returns to idle', () => {
      const running = pomoStart(defaultPomoState(), {}, env(T0));
      const stopped = pomoStop(running, {}, env(T0 + 25 * MIN, 'w1'));
      expect(stopped.status).toBe('idle');
      expect(stopped.startedAt).toBeNull();
      expect(stopped.sessionsCompleted).toBe(1);
      expect(stopped.history[0]).toMatchObject({ kind: 'work', completed: true });
    });

    it('records a break span (kind break) when stopped from break', () => {
      const running = pomoStart(defaultPomoState(), {}, env(T0));
      const onBreak = pomoBreak(running, {}, env(T0 + 25 * MIN));
      const stopped = pomoStop(onBreak, {}, env(T0 + 30 * MIN, 'b1'));
      expect(stopped.status).toBe('idle');
      const last = stopped.history[stopped.history.length - 1];
      expect(last).toMatchObject({ kind: 'break', durationMin: 5 });
    });

    it('is a no-op when idle', () => {
      const s = defaultPomoState();
      expect(pomoStop(s, {}, env(T0))).toBe(s);
    });
  });

  describe('persistence rule (Decision #9)', () => {
    it('state never carries a derived countdown — only startedAt + durationMin', () => {
      const running = pomoStart(defaultPomoState(), {}, env(T0));
      // Snapshot the state shape: no remaining/elapsed fields leak into state.
      // Decision 22 adds `activeTaskId` (null in default mode).
      expect(Object.keys(running).sort()).toEqual([
        'activeTaskId',
        'breakMin',
        'durationMin',
        'history',
        'label',
        'pausedAt',
        'pausedElapsedMs',
        'sessionWorkSec',
        'sessionsCompleted',
        'startedAt',
        'status',
      ]);
    });

    it('reload simulation: a long-elapsed running state still completes via pomo.complete', () => {
      const running = pomoStart(defaultPomoState(), {}, env(T0));
      // Simulate restart 30 minutes later.
      const reloaded = pomoComplete(running, {}, env(T0 + 30 * 60_000, 'late'));
      expect(reloaded.status).toBe('break');
      expect(reloaded.history[0]?.completed).toBe(true);
    });
  });
});
