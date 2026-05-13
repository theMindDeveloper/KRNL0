/**
 * Decision 22 — Pomodoro v2: gear settings, active-task mode, long-break branching.
 *
 * These tests pin the new contract:
 *   - pomoComplete branches between shortBreakMin / longBreakMin via longBreakEvery.
 *   - pomoStart accepts an `activeTaskId` arg.
 *   - pomoSetConfig writes a canonical config object.
 *   - pomoClearActiveTask resets `activeTaskId` to null.
 *   - History records carry `taskId` of the active task at the time.
 */

import { describe, it, expect } from 'vitest';
import {
  pomoStart,
  pomoCancel,
  pomoComplete,
  pomoSetConfig,
  pomoClearActiveTask,
  type PomoEnv,
} from '../../../src/renderer/components/nodes/PomoNode/commands';
import { defaultPomoConfig, defaultPomoState } from '../../../src/renderer/components/nodes/PomoNode/types';
import type { PomoConfig } from '../../../src/renderer/components/nodes/PomoNode/types';

const T0 = Date.parse('2026-05-13T09:00:00.000Z');
const env = (nowMs: number, uuid = 'rec'): PomoEnv => ({ now: () => nowMs, uuid: () => uuid });

describe('Decision 22 — Pomodoro v2', () => {
  describe('pomoStart honors activeTaskId', () => {
    it('writes activeTaskId from args', () => {
      const next = pomoStart(defaultPomoState(), { activeTaskId: 'task-1' }, env(T0));
      expect(next.activeTaskId).toBe('task-1');
    });

    it('omitting activeTaskId preserves prior value', () => {
      const seed = { ...defaultPomoState(), activeTaskId: 'task-x' };
      const next = pomoStart(seed, {}, env(T0));
      expect(next.activeTaskId).toBe('task-x');
    });

    it('explicit null clears activeTaskId', () => {
      const seed = { ...defaultPomoState(), activeTaskId: 'task-x' };
      const next = pomoStart(seed, { activeTaskId: null }, env(T0));
      expect(next.activeTaskId).toBeNull();
    });
  });

  describe('pomoComplete — long-break branching', () => {
    const cfg: PomoConfig = {
      sessionMin: 25,
      shortBreakMin: 5,
      longBreakMin: 15,
      longBreakEvery: 4,
    };

    it('writes shortBreakMin into state.breakMin on regular completion', () => {
      const running = pomoStart(defaultPomoState(), {}, env(T0));
      const after = pomoComplete(running, { config: cfg }, env(T0 + 25 * 60_000, 'r1'));
      expect(after.status).toBe('break');
      expect(after.breakMin).toBe(5);
      expect(after.sessionsCompleted).toBe(1);
    });

    it('writes longBreakMin into state.breakMin on the Nth completion', () => {
      const seed = { ...defaultPomoState(), sessionsCompleted: 3 };
      const running = pomoStart(seed, {}, env(T0));
      const after = pomoComplete(running, { config: cfg }, env(T0 + 25 * 60_000, 'r1'));
      // (3+1) % 4 === 0 → long break.
      expect(after.breakMin).toBe(15);
      expect(after.sessionsCompleted).toBe(4);
    });

    it('history record carries the active task id', () => {
      const seed = { ...defaultPomoState(), activeTaskId: 'task-42' };
      const running = pomoStart(seed, {}, env(T0));
      const after = pomoComplete(running, { config: cfg }, env(T0 + 25 * 60_000, 'rid'));
      expect(after.history[0]?.taskId).toBe('task-42');
      expect(after.history[0]?.completed).toBe(true);
    });

    it('cancel records the active task id too', () => {
      const seed = { ...defaultPomoState(), activeTaskId: 'task-7' };
      const running = pomoStart(seed, {}, env(T0));
      const after = pomoCancel(running, {}, env(T0 + 60_000, 'rid'));
      expect(after.history[0]?.taskId).toBe('task-7');
      expect(after.history[0]?.completed).toBe(false);
    });
  });

  describe('pomoSetConfig', () => {
    it('writes a canonical PomoConfig from a partial', () => {
      const next = pomoSetConfig(defaultPomoConfig(), {
        config: { sessionMin: 50, longBreakMin: 30 },
      });
      expect(next).toEqual({
        sessionMin: 50,
        shortBreakMin: 5,
        longBreakMin: 30,
        longBreakEvery: 4,
      });
    });

    it('clamps non-numeric values back to current', () => {
      const next = pomoSetConfig(defaultPomoConfig(), {
        config: { sessionMin: Number.NaN as unknown as number, shortBreakMin: 0 },
      });
      // NaN → fallback 25; 0 → clamp to 1 (always positive minimum).
      expect(next.sessionMin).toBe(25);
      expect(next.shortBreakMin).toBe(1);
    });

    it('rounds non-integer minutes', () => {
      const next = pomoSetConfig(defaultPomoConfig(), {
        config: { sessionMin: 12.6 },
      });
      expect(next.sessionMin).toBe(13);
    });

    it('seeds a default config when the argument is null', () => {
      const next = pomoSetConfig(null, { config: { sessionMin: 30 } });
      expect(next.sessionMin).toBe(30);
      expect(next.shortBreakMin).toBe(5);
    });
  });

  describe('pomoClearActiveTask', () => {
    it('clears activeTaskId to null', () => {
      const seed = { ...defaultPomoState(), activeTaskId: 'task-x', label: 'do thing' };
      const next = pomoClearActiveTask(seed);
      expect(next.activeTaskId).toBeNull();
      expect(next.label).toBe('');
    });

    it('is a no-op when no task is active', () => {
      const seed = defaultPomoState();
      const next = pomoClearActiveTask(seed);
      expect(next).toBe(seed);
    });
  });
});
