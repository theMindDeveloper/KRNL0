import { describe, it, expect } from 'vitest';
import {
  pomoStart,
  pomoCancel,
  pomoComplete,
  pomoSkipBreak,
  pomoEndBreak,
  pomoSetLabel,
  pomoSetDuration,
  type PomoEnv,
} from '../../../src/renderer/components/nodes/PomoNode/commands';
import { defaultPomoState } from '../../../src/renderer/components/nodes/PomoNode/types';

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

  // ── Decision 9 Addendum (2026-05-12) — long-break branching ──────────
  describe('long-break branching (Addendum F11)', () => {
    const cfg = { breakMin: 5, longBreakMin: 15, longBreakEvery: 4 };

    it('first three completions yield short breaks (sessionsCompleted 1, 2, 3)', () => {
      const running = pomoStart(defaultPomoState(), {}, env(T0));
      const after = pomoComplete(running, {}, env(T0 + 25 * 60_000), cfg);
      expect(after.status).toBe('break');
      expect(after.sessionsCompleted).toBe(1);
      expect(after.breakMin).toBe(5);

      const next2 = pomoComplete(
        { ...after, status: 'running', startedAt: new Date(T0 + 30 * 60_000).toISOString() },
        {},
        env(T0 + 60 * 60_000),
        cfg,
      );
      expect(next2.sessionsCompleted).toBe(2);
      expect(next2.breakMin).toBe(5);

      const next3 = pomoComplete(
        { ...next2, status: 'running', startedAt: new Date(T0 + 90 * 60_000).toISOString() },
        {},
        env(T0 + 120 * 60_000),
        cfg,
      );
      expect(next3.sessionsCompleted).toBe(3);
      expect(next3.breakMin).toBe(5);
    });

    it('fourth completion (sessionsCompleted 3 → 4) yields a LONG break', () => {
      const base = { ...defaultPomoState(), sessionsCompleted: 3, status: 'running' as const, startedAt: new Date(T0).toISOString() };
      const after = pomoComplete(base, {}, env(T0 + 25 * 60_000), cfg);
      expect(after.sessionsCompleted).toBe(4);
      expect(after.breakMin).toBe(15);
    });

    it('eighth completion (sessionsCompleted 7 → 8) also yields a LONG break', () => {
      const base = { ...defaultPomoState(), sessionsCompleted: 7, status: 'running' as const, startedAt: new Date(T0).toISOString() };
      const after = pomoComplete(base, {}, env(T0 + 25 * 60_000), cfg);
      expect(after.sessionsCompleted).toBe(8);
      expect(after.breakMin).toBe(15);
    });

    it('respects custom longBreakEvery=2 — every other completion is long', () => {
      const c = { breakMin: 1, longBreakMin: 3, longBreakEvery: 2 };
      const base = { ...defaultPomoState(), sessionsCompleted: 0, status: 'running' as const, startedAt: new Date(T0).toISOString() };
      const a = pomoComplete(base, {}, env(T0 + 25 * 60_000), c);
      expect(a.sessionsCompleted).toBe(1);
      expect(a.breakMin).toBe(1); // short

      const b = pomoComplete(
        { ...a, status: 'running', startedAt: new Date(T0 + 30 * 60_000).toISOString() },
        {},
        env(T0 + 60 * 60_000),
        c,
      );
      expect(b.sessionsCompleted).toBe(2);
      expect(b.breakMin).toBe(3); // long
    });

    it('default cfg path is back-compat (3-arg call still works)', () => {
      const running = pomoStart(defaultPomoState(), {}, env(T0));
      const after = pomoComplete(running, {}, env(T0 + 25 * 60_000));
      expect(after.status).toBe('break');
    });

    it('endBreak compares against the breakMin set by complete (long break needs 15 min)', () => {
      const base = { ...defaultPomoState(), sessionsCompleted: 3, status: 'running' as const, startedAt: new Date(T0).toISOString() };
      const onLongBreak = pomoComplete(base, {}, env(T0 + 25 * 60_000), cfg);
      // 5 min after long break starts — still on break
      const five = pomoEndBreak(onLongBreak, {}, env(T0 + 25 * 60_000 + 5 * 60_000));
      expect(five).toBe(onLongBreak);
      // 16 min after long break starts — break ends
      const sixteen = pomoEndBreak(onLongBreak, {}, env(T0 + 25 * 60_000 + 16 * 60_000));
      expect(sixteen.status).toBe('idle');
    });
  });

  describe('persistence rule (Decision #9)', () => {
    it('state never carries a derived countdown — only startedAt + durationMin', () => {
      const running = pomoStart(defaultPomoState(), {}, env(T0));
      // Snapshot the state shape: no remaining/elapsed fields leak into state.
      expect(Object.keys(running).sort()).toEqual([
        'breakMin',
        'durationMin',
        'history',
        'label',
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
