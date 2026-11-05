/** #207 / time-log F7, F7b — correcting recorded time. */
import { describe, it, expect } from 'vitest';
import { pomoEditSegment, pomoAddSegment, spanProblem, timesFromFields } from '../../../src/renderer/components/nodes/PomoNode/spanEdit';
import type { PomoState, PomoSessionRecord } from '../../../src/renderer/components/nodes/PomoNode/types';
import { SysParser } from '../../../src/sys/parser';

const t = (hh: number, mm = 0, day = 5): number => new Date(2026, 10, day, hh, mm).getTime();
const rec = (id: string, s: number, e: number, extra: Partial<PomoSessionRecord> = {}): PomoSessionRecord => ({
  id, startedAt: new Date(s).toISOString(), endedAt: new Date(e).toISOString(), durationMin: Math.round((e - s) / 60_000),
  label: id, completed: false, taskId: null, kind: 'work', ...extra,
});
const state = (history: PomoSessionRecord[], extra: Partial<PomoState> = {}): PomoState =>
  ({ status: 'idle', startedAt: null, pausedAt: null, pausedElapsedMs: 0, sessionWorkSec: 0, history, label: '', activeTaskId: null, sessionsCompleted: 0, ...extra } as unknown as PomoState);
const NOW = t(23);

describe('spanProblem', () => {
  const s = state([rec('emails', t(10), t(11))]);
  it('refuses end before start, the future, and overlaps — in plain words', () => {
    expect(spanProblem(s, { startMs: t(12), endMs: t(11) }, NOW)).toBe('The end must be after the start');
    expect(spanProblem(s, { startMs: t(22), endMs: t(23, 30) }, NOW)).toBe('That end time is in the future');
    expect(spanProblem(s, { startMs: t(10, 30), endMs: t(12) }, NOW)).toMatch(/^Overlaps "emails" 10:00–11:00$/);
    expect(spanProblem(s, { startMs: t(11), endMs: t(12) }, NOW)).toBeNull();
  });
  it('a span may overlap its own old times and breaks', () => {
    const s2 = state([rec('a', t(10), t(11)), rec('b', t(11), t(12), { kind: 'break' })]);
    expect(spanProblem(s2, { startMs: t(10), endMs: t(11, 30) }, NOW, { exceptId: 'a' })).toBeNull();
  });
  it('refuses overlap with the running session', () => {
    const live = state([], { status: 'running', startedAt: new Date(t(20)).toISOString() } as Partial<PomoState>);
    expect(spanProblem(live, { startMs: t(19), endMs: t(21) }, NOW)).toMatch(/running since 20:00/);
  });
});

describe('pomoEditSegment — where I actually stopped', () => {
  it('moves the end and recomputes the minutes', () => {
    const s = state([rec('obs', t(14), t(9, 0, 6))]);
    const next = pomoEditSegment(s, { id: 'obs', startMs: t(14), endMs: t(18, 30), nowMs: t(10, 0, 6) });
    expect(next.history[0]!.endedAt).toBe(new Date(t(18, 30)).toISOString());
    expect(next.history[0]!.durationMin).toBe(270);
  });
  it('leaves the state alone on invalid times', () => {
    const s = state([rec('a', t(10), t(11))]);
    expect(pomoEditSegment(s, { id: 'a', startMs: t(11), endMs: t(10), nowMs: NOW })).toBe(s);
  });
});

describe('pomoAddSegment — time I forgot to record', () => {
  it('adds a work span in order, tagged with the task', () => {
    const s = state([rec('later', t(15), t(16))]);
    const next = pomoAddSegment(s, { id: 'n', startMs: t(9), endMs: t(10, 30), taskId: 'task-api', label: 'API', nowMs: NOW });
    expect(next.history.map((r) => r.id)).toEqual(['n', 'later']);
    expect(next.history[0]).toMatchObject({ taskId: 'task-api', label: 'API', durationMin: 90, kind: 'work' });
  });
  it('refuses overlaps', () => {
    const s = state([rec('a', t(9), t(10))]);
    expect(pomoAddSegment(s, { id: 'n', startMs: t(9, 30), endMs: t(11), nowMs: NOW })).toBe(s);
  });
});

describe('timesFromFields', () => {
  it('an end not after the start is the next morning', () => {
    const r = timesFromFields('2026-11-05', '22:00', '01:30')!;
    expect(r.endMs - r.startMs).toBe(3.5 * 3_600_000);
  });
});

describe('CLI parse', () => {
  it('pomo segment / pomo add', () => {
    expect(SysParser.parse(['pomo', 'segment', 'abcd1234', '--end', '18:30'])).toEqual({ kind: 'pomo', sub: 'segment', segmentId: 'abcd1234', start: undefined, end: '18:30' });
    expect(SysParser.parse(['pomo', 'add', '--start', '09:00', '--end', '10:30', '--task', 'API'])).toEqual({ kind: 'pomo', sub: 'add', start: '09:00', end: '10:30', ref: 'API', text: undefined });
  });
});
