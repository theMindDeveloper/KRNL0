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
  pomoPause,
  pomoResume,
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

    it('regression 2026-05-18 — preserves mother-node extra config fields (stationSlot, stationHidden) across SAVE', () => {
      // Mother-node configs piggyback fields like stationSlot on the pomo's
      // config object. Stripping them on SAVE caused the pomo to vanish from
      // station view (StationCell.resolveStationSlot returned undefined).
      const current = {
        ...defaultPomoConfig(),
        face: 'lcd' as const,
        // Extra fields are typed via `MotherNodeConfig` at the boundary —
        // pomoSetConfig must not be schema-restrictive about preserving them.
        stationSlot: 'top-left',
        stationHidden: false,
      } as unknown as Parameters<typeof pomoSetConfig>[0];
      const next = pomoSetConfig(current, { config: { sessionMin: 1, longBreakEvery: 1 } });
      expect(next.sessionMin).toBe(1);
      expect(next.longBreakEvery).toBe(1);
      // The extra mother-config fields must survive — without this, station
      // view loses the pomo card after the user saves new gear settings.
      expect((next as unknown as { stationSlot: string }).stationSlot).toBe('top-left');
      expect((next as unknown as { stationHidden: boolean }).stationHidden).toBe(false);
      expect(next.face).toBe('lcd');
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

describe('Decision 22.1 — pause/resume', () => {
  const T0 = Date.parse('2026-05-13T10:00:00.000Z');
  const env = (nowMs: number, uuid = 'rec'): PomoEnv => ({ now: () => nowMs, uuid: () => uuid });

  // ── pomoPause ──────────────────────────────────────────────────────────────

  describe('pomoPause', () => {
    it('running → paused: sets status, pausedAt, and pausedElapsedMs', () => {
      const running = pomoStart(defaultPomoState(), {}, env(T0));
      const paused = pomoPause(running, {}, env(T0 + 10_000));
      expect(paused.status).toBe('paused');
      expect(paused.pausedElapsedMs).toBeCloseTo(10_000, -1);
      expect(paused.pausedAt).toBe(new Date(T0 + 10_000).toISOString());
      // startedAt stays populated (UI ignores it while paused)
      expect(paused.startedAt).toBe(new Date(T0).toISOString());
    });

    it('no history record is written when pausing', () => {
      const running = pomoStart(defaultPomoState(), {}, env(T0));
      const paused = pomoPause(running, {}, env(T0 + 10_000));
      expect(paused.history).toHaveLength(0);
    });

    it('is a no-op when already paused (idempotent)', () => {
      const running = pomoStart(defaultPomoState(), {}, env(T0));
      const paused = pomoPause(running, {}, env(T0 + 10_000));
      const again = pomoPause(paused, {}, env(T0 + 20_000));
      expect(again).toBe(paused);
    });

    it('is a no-op when idle', () => {
      const s = defaultPomoState();
      expect(pomoPause(s, {}, env(T0))).toBe(s);
    });
  });

  // ── pomoResume ─────────────────────────────────────────────────────────────

  describe('pomoResume', () => {
    it('paused → running: offsets startedAt to honour pausedElapsedMs', () => {
      const running = pomoStart(defaultPomoState(), {}, env(T0));
      const paused = pomoPause(running, {}, env(T0 + 10_000));
      // Resume 60 seconds after start (50s after pause)
      const resumed = pomoResume(paused, {}, env(T0 + 60_000));
      expect(resumed.status).toBe('running');
      // startedAt should be T0+60_000 - 10_000 = T0+50_000
      expect(resumed.startedAt).toBe(new Date(T0 + 50_000).toISOString());
      // now - startedAt === pausedElapsedMs
      expect(Date.parse(resumed.startedAt!) - T0).toBe(50_000);
      expect(resumed.pausedAt).toBeNull();
      expect(resumed.pausedElapsedMs).toBe(0);
    });

    it('is a no-op when already running', () => {
      const running = pomoStart(defaultPomoState(), {}, env(T0));
      const next = pomoResume(running, {}, env(T0 + 1_000));
      expect(next).toBe(running);
    });

    it('is a no-op when idle', () => {
      const s = defaultPomoState();
      expect(pomoResume(s, {}, env(T0))).toBe(s);
    });
  });

  // ── pomoCancel from paused ─────────────────────────────────────────────────

  describe('pomoCancel from paused', () => {
    it('writes history record with endedAt = pausedAt (not env.now)', () => {
      const running = pomoStart(defaultPomoState(), { label: 'focused' }, env(T0));
      const paused = pomoPause(running, {}, env(T0 + 10_000));
      // Cancel well after pausedAt
      const cancelled = pomoCancel(paused, {}, env(T0 + 120_000, 'hist-1'));
      expect(cancelled.status).toBe('idle');
      expect(cancelled.history).toHaveLength(1);
      const rec = cancelled.history[0]!;
      expect(rec.endedAt).toBe(new Date(T0 + 10_000).toISOString());
      expect(rec.completed).toBe(false);
      expect(rec.label).toBe('focused');
    });

    it('clears pausedAt and pausedElapsedMs after cancel from paused', () => {
      const running = pomoStart(defaultPomoState(), {}, env(T0));
      const paused = pomoPause(running, {}, env(T0 + 10_000));
      const cancelled = pomoCancel(paused, {}, env(T0 + 60_000));
      expect(cancelled.pausedAt).toBeNull();
      expect(cancelled.pausedElapsedMs).toBe(0);
      expect(cancelled.startedAt).toBeNull();
    });
  });

  // ── pomoCancel from running still clears pause fields ─────────────────────

  describe('pomoCancel from running', () => {
    it('clears pausedAt and pausedElapsedMs (already null/0, but explicit)', () => {
      const running = pomoStart(defaultPomoState(), {}, env(T0));
      const cancelled = pomoCancel(running, {}, env(T0 + 60_000));
      expect(cancelled.pausedAt).toBeNull();
      expect(cancelled.pausedElapsedMs).toBe(0);
    });
  });

  // ── Invariant: start → pause → resume → cancel ────────────────────────────

  describe('invariant: start → pause → resume → cancel', () => {
    it('produces exactly one history record marked completed: false', () => {
      const s0 = defaultPomoState();
      const started = pomoStart(s0, { label: 'work' }, env(T0));
      const paused = pomoPause(started, {}, env(T0 + 5_000));
      const resumed = pomoResume(paused, {}, env(T0 + 30_000));
      const cancelled = pomoCancel(resumed, {}, env(T0 + 60_000, 'final'));
      expect(cancelled.history).toHaveLength(1);
      expect(cancelled.history[0]!.completed).toBe(false);
      expect(cancelled.status).toBe('idle');
      expect(cancelled.pausedAt).toBeNull();
      expect(cancelled.pausedElapsedMs).toBe(0);
    });
  });
});
