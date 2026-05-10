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
