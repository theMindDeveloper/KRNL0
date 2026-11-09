/** Decision 37 — one set of Pomo rules for the node and the pocket (pocket-timer.md NF2, F2–F5). */
import { describe, it, expect } from 'vitest';
import {
  formatElapsed,
  formatRemaining,
  isObserve,
  isPomoControlCommand,
  isPromptDone,
  pomoClock,
  pomoControls,
  stopCommand,
  todayCycles,
} from '../../../src/renderer/components/nodes/PomoNode/derive';
import { defaultPomoConfig, defaultPomoState, OBSERVE_SPAN_MIN } from '../../../src/renderer/components/nodes/PomoNode/types';
import type { PomoConfig, PomoState } from '../../../src/renderer/components/nodes/PomoNode/types';

const T0 = Date.parse('2026-11-06T09:00:00Z');
const cfg = (patch: Partial<PomoConfig> = {}): PomoConfig => ({ ...defaultPomoConfig(), ...patch });
const st = (patch: Partial<PomoState> = {}): PomoState => ({ ...defaultPomoState(), durationMin: 25, ...patch });
const ids = (c: ReturnType<typeof pomoControls>) => c.map((x) => x.id);

describe('pomoClock', () => {
  it('running: work so far plus the live span, and what is left', () => {
    const c = pomoClock(st({ status: 'running', startedAt: new Date(T0).toISOString(), sessionWorkSec: 120 }), cfg(), T0 + 60_000);
    expect(c.liveWorkMs).toBe(180_000);
    expect(c.remainingMs).toBe(25 * 60_000 - 180_000);
    expect(c.breakElapsedMs).toBe(0);
  });

  it('paused: frozen at the paused work', () => {
    const c = pomoClock(st({ status: 'paused', sessionWorkSec: 60, pausedElapsedMs: 30_000 }), cfg(), T0 + 999_999);
    expect(c.liveWorkMs).toBe(90_000);
  });

  it('break counts up; an Observe span uses the config session length', () => {
    const c = pomoClock(st({ status: 'break', startedAt: new Date(T0).toISOString(), durationMin: OBSERVE_SPAN_MIN }), cfg({ sessionMin: 50 }), T0 + 4 * 60_000);
    expect(c.breakElapsedMs).toBe(240_000);
    expect(c.sessionMin).toBe(50);
  });
});

describe('done prompt (F3)', () => {
  const at25 = pomoClock(st({ status: 'running', startedAt: new Date(T0).toISOString() }), cfg(), T0 + 25 * 60_000);
  it('asks in Pomodoro once the session length is reached', () => {
    expect(isPromptDone(false, false, 'running', at25)).toBe(true);
  });
  it('never in Observe, never while away', () => {
    expect(isPromptDone(true, false, 'running', at25)).toBe(false);
    expect(isPromptDone(false, true, 'running', at25)).toBe(false);
  });
});

describe('pomoControls', () => {
  const pomo = { observe: false, promptDone: false, config: cfg() };
  it('Pomodoro (F2): running stop/break/pause, paused stop/resume, break end, idle start', () => {
    expect(ids(pomoControls({ ...pomo, status: 'running' }))).toEqual(['stop', 'break', 'pause']);
    expect(ids(pomoControls({ ...pomo, status: 'paused' }))).toEqual(['stop', 'resume']);
    expect(pomoControls({ ...pomo, status: 'break' })).toEqual([{ id: 'endBreak', command: 'pomo.stop', label: 'End break', primary: true }]);
    expect(ids(pomoControls({ ...pomo, status: 'idle' }))).toEqual(['start']);
  });

  it('done prompt: extend/break/stop', () => {
    expect(ids(pomoControls({ ...pomo, status: 'running', promptDone: true }))).toEqual(['extend', 'break', 'stop']);
  });

  it('Observe (F4): break/stop, back to work/stop, no pause', () => {
    const obs = { ...pomo, observe: true };
    expect(ids(pomoControls({ ...obs, status: 'running' }))).toEqual(['break', 'stop']);
    const onBreak = pomoControls({ ...obs, status: 'break' });
    expect(ids(onBreak)).toEqual(['backToWork', 'stop']);
    expect(onBreak[0]!.command).toBe('pomo.resume');
    expect(pomoControls({ ...obs, status: 'running' }).some((c) => c.id === 'pause')).toBe(false);
  });

  it('Stop discards when "Count stopped sessions" is off, in Pomodoro only', () => {
    expect(stopCommand(false, cfg({ countStopped: false }))).toBe('pomo.discard');
    expect(stopCommand(true, cfg({ countStopped: false }))).toBe('pomo.stop');
    expect(pomoControls({ ...pomo, status: 'running', config: cfg({ countStopped: false }) })[0]!.command).toBe('pomo.discard');
  });
});

describe('helpers', () => {
  it('Easy mode is always Observe', () => {
    expect(isObserve(cfg({ mode: 'pomodoro' }), true)).toBe(true);
    expect(isObserve(cfg({ mode: 'observe' }), false)).toBe(true);
    expect(isObserve(cfg(), false)).toBe(false);
  });

  it('only control commands pass (F5)', () => {
    expect(isPomoControlCommand('pomo.break')).toBe(true);
    expect(isPomoControlCommand('board.reset')).toBe(false);
    expect(isPomoControlCommand(42)).toBe(false);
  });

  it('formats a countdown and a count-up', () => {
    expect(formatRemaining(15 * 60_000 + 42_000)).toBe('15:42');
    expect(formatElapsed(41 * 60_000 + 36_000)).toBe('41:36');
    expect(formatElapsed(72 * 60_000 + 8_000)).toBe('1:12:08');
  });

  it('counts completed sessions that ended today', () => {
    const today = new Date(T0).toISOString();
    const rec = (completed: boolean, endedAt: string, i: number) => ({ id: `r${i}`, startedAt: endedAt, endedAt, durationMin: 25, label: '', completed, kind: 'work' as const });
    const history = [rec(true, today, 1), rec(true, today, 2), rec(false, today, 3), rec(true, '2026-01-01T09:00:00Z', 4), rec(true, today, 5), rec(true, today, 6), rec(true, today, 7)];
    expect(todayCycles(history, 4, T0)).toEqual({ cyclesToday: 1, sessionsToday: 5, progressToNext: 1 });
  });
});
