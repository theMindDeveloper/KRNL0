// @vitest-environment jsdom
/** Time the app could not see (sleep / closed app) is asked about, not booked. */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { awayGapFor, useAwayGap, AWAY_MS } from '../../../src/renderer/components/nodes/PomoNode/useAwayGap';
import { pomoStopAt } from '../../../src/renderer/components/nodes/PomoNode/commands';
import { defaultPomoState } from '../../../src/renderer/components/nodes/PomoNode/types';
import { parseStopAt, stopAtRefusal } from '../../../src/sys/commands/pomo';

const T0 = Date.UTC(2026, 10, 2, 17, 0);
afterEach(() => { vi.useRealTimers(); localStorage.clear(); });

describe('awayGapFor', () => {
  it('flags a long unseen stretch, from when the span was last seen', () => {
    expect(awayGapFor(T0, T0 + 60_000, T0 + 60_000 + AWAY_MS)).toEqual({ fromMs: T0 + 60_000, toMs: T0 + 60_000 + AWAY_MS });
    expect(awayGapFor(T0, T0 + 60_000, T0 + 120_000)).toBeNull();
    // A heartbeat from an older session never reaches before the span's start.
    expect(awayGapFor(T0, T0 - 3_600_000, T0 + 60_000)).toBeNull();
    expect(awayGapFor(T0, null, T0 + 10 * AWAY_MS)).toBeNull();
  });
});

describe('useAwayGap', () => {
  it('asks after a restart when the window last saw the span long ago', () => {
    vi.useFakeTimers({ now: T0 + 16 * 3_600_000 });
    localStorage.setItem('krnl0-pomo-seen', String(T0 + 3_600_000));
    const { result } = renderHook(() => useAwayGap('running', new Date(T0).toISOString()));
    expect(result.current.gap).toEqual({ fromMs: T0 + 3_600_000, toMs: T0 + 16 * 3_600_000 });
  });

  it('drops the question when the span it was about is replaced (CLI break / extend)', () => {
    vi.useFakeTimers({ now: T0 + 16 * 3_600_000 });
    localStorage.setItem('krnl0-pomo-seen', String(T0 + 3_600_000));
    const { result, rerender } = renderHook(({ s }) => useAwayGap('running', s), { initialProps: { s: new Date(T0).toISOString() } });
    expect(result.current.gap).not.toBeNull();
    rerender({ s: new Date(T0 + 16 * 3_600_000).toISOString() });
    expect(result.current.gap).toBeNull();
  });

  it('does not ask while the window keeps seeing the span', () => {
    vi.useFakeTimers({ now: T0 });
    const { result } = renderHook(() => useAwayGap('running', new Date(T0).toISOString()));
    act(() => { vi.advanceTimersByTime(60 * 60_000); });
    expect(result.current.gap).toBeNull();
  });
});

describe('pomoStopAt', () => {
  it('records the span up to the given moment, not up to now', () => {
    const env = { now: () => T0 + 15 * 3_600_000, uuid: () => 'rec' };
    const running = { ...defaultPomoState(), status: 'running' as const, startedAt: new Date(T0).toISOString(), durationMin: 24 * 60 };
    const s = pomoStopAt(running, { atMs: T0 + 50 * 60_000 }, env);
    expect(s.status).toBe('idle');
    expect(s.history.at(-1)).toMatchObject({ durationMin: 50, endedAt: new Date(T0 + 50 * 60_000).toISOString() });
  });
});

describe('CLI pomo stop --at', () => {
  it('reads HH:MM as today (or last night when that is still to come) and rejects nonsense', () => {
    const now = new Date(2026, 10, 3, 9, 30).getTime();
    expect(parseStopAt('08:02', now)).toBe(new Date(2026, 10, 3, 8, 2).getTime());
    // 18:02 hasn't come yet today: it is yesterday's.
    expect(parseStopAt('18:02', now)).toBe(new Date(2026, 10, 2, 18, 2).getTime());
    expect(parseStopAt('2026-11-02T18:02', now)).toBe(new Date(2026, 10, 2, 18, 2).getTime());
    expect(parseStopAt('25:00', now)).toBeUndefined();
    expect(parseStopAt('2026-02-31T10:00', now)).toBeUndefined();
  });
});

describe('CLI pomo stop --at refuses what it cannot do', () => {
  const running = { ...defaultPomoState(), status: 'running' as const, startedAt: new Date(T0).toISOString() };
  it('a moment before the span started', () => {
    expect(stopAtRefusal(running, T0 - 60_000, '17:59')).toMatch(/before this span started/);
  });
  it('a paused or idle pomo, instead of echoing a time it ignored', () => {
    expect(stopAtRefusal({ ...running, status: 'paused' }, T0 + 60_000, 'x')).toMatch(/needs a running span/);
    expect(stopAtRefusal(defaultPomoState(), T0 + 60_000, 'x')).toMatch(/needs a running span/);
  });
  it('a moment inside a live span is fine', () => {
    expect(stopAtRefusal(running, T0 + 60_000, 'x')).toBeNull();
  });
});
