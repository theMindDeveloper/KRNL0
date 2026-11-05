// @vitest-environment jsdom
/**
 * #201 — the clock follows now (new-day rollover, noon/midnight half flip,
 * app-start snap, browsing left alone).
 * #202 — the face overlay (ticks, numerals, readout, hands, hub) never takes
 *        the pointer from the recorded-time wedges.
 * #204 — the "Counts toward" select keeps an orphan task option.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import React from 'react';
import { ClockNode } from '../../../src/renderer/components/nodes/ClockNode';
import {
  startupFollow,
  rolloverFollow,
  halfOf,
  claimStartup,
  resetClockStartupForTests,
} from '../../../src/renderer/components/nodes/ClockNode/follow';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import type { Board } from '../../../src/shared/types';
import type { Node } from '../../../src/shared/types/node';
import type { ClockConfig, ClockState } from '../../../src/renderer/components/nodes/ClockNode/types';

const GO_NOW = { command: 'clock.goNow', args: {} };

beforeEach(() => {
  resetClockStartupForTests();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useBoardStore.setState({ board: null });
});

// ── Pure rules ────────────────────────────────────────────────────────────────

describe('follow rules (pure)', () => {
  const now = { today: '2026-11-05', half: 0 as const };

  it('halfOf splits the day at noon', () => {
    expect(halfOf(new Date(2026, 10, 5, 11, 59))).toBe(0);
    expect(halfOf(new Date(2026, 10, 5, 12, 0))).toBe(1);
  });

  it('app start: a past or invalid day snaps to now', () => {
    expect(startupFollow({ selectedDate: '2026-11-04', viewWindow: 1 }, now)).toEqual(GO_NOW);
    expect(startupFollow({ selectedDate: 'garbage', viewWindow: 0 }, now)).toEqual(GO_NOW);
  });

  it('app start: today in the other half snaps to now; today in the right half stays', () => {
    expect(startupFollow({ selectedDate: '2026-11-05', viewWindow: 1 }, now)).toEqual(GO_NOW);
    expect(startupFollow({ selectedDate: '2026-11-05', viewWindow: 0 }, now)).toBeNull();
  });

  it('app start: a future day is a deliberate look ahead and is kept', () => {
    expect(startupFollow({ selectedDate: '2026-11-09', viewWindow: 0 }, now)).toBeNull();
  });

  it('day change while showing the day that ended → go to now', () => {
    const prev = { today: '2026-11-04', half: 1 as const };
    expect(rolloverFollow(prev, now, { selectedDate: '2026-11-04', viewWindow: 1 })).toEqual(GO_NOW);
  });

  it('day change while browsing another day → left alone', () => {
    const prev = { today: '2026-11-04', half: 1 as const };
    expect(rolloverFollow(prev, now, { selectedDate: '2026-11-01', viewWindow: 0 })).toBeNull();
  });

  it('noon flips the half only when the clock showed today’s morning', () => {
    const am = { today: '2026-11-05', half: 0 as const };
    const pm = { today: '2026-11-05', half: 1 as const };
    expect(rolloverFollow(am, pm, { selectedDate: '2026-11-05', viewWindow: 0 }))
      .toEqual({ command: 'clock.setViewWindow', args: { window: 1 } });
    expect(rolloverFollow(am, pm, { selectedDate: '2026-11-03', viewWindow: 0 })).toBeNull();
    expect(rolloverFollow(am, pm, { selectedDate: '2026-11-05', viewWindow: 1 })).toBeNull();
    expect(rolloverFollow(am, am, { selectedDate: '2026-11-05', viewWindow: 0 })).toBeNull();
  });

  it('startup runs once per clock per session', () => {
    expect(claimStartup('c1')).toBe(true);
    expect(claimStartup('c1')).toBe(false);
    expect(claimStartup('c2')).toBe(true);
  });
});

// ── Component wiring ──────────────────────────────────────────────────────────

function clockNode(state: Partial<ClockState>): Node<ClockState, ClockConfig> {
  return {
    id: 'mother-clock', kind: 'clock', position: { x: 0, y: 0 }, isMother: true, config: {},
    state: { linkedTodoId: null, viewWindow: 0, selectedDate: '2026-11-05', ...state },
  };
}

function seed(extra: Node[] = []): void {
  const board: Board = {
    version: 1, schemaVersion: 2, savedAt: new Date().toISOString(), layoutMode: 'station',
    viewport: { x: 0, y: 0, zoom: 1 }, edges: [],
    nodes: [clockNode({}), ...extra],
  };
  useBoardStore.setState({ board });
}

function renderClock(state: Partial<ClockState>, onCommand = vi.fn()) {
  const view = render(<ClockNode node={clockNode(state)} selected={false} onCommand={onCommand} onSelect={() => {}} />);
  return { onCommand, view };
}

function followCalls(fn: ReturnType<typeof vi.fn>): unknown[][] {
  return fn.mock.calls.filter((c) => c[0] === 'clock.goNow' || c[0] === 'clock.setViewWindow');
}

describe('ClockNode follows now (#201)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
  });

  it('app start on yesterday’s day snaps to now, once per session', () => {
    vi.setSystemTime(new Date(2026, 10, 5, 9, 0, 0));
    seed();
    const { onCommand, view } = renderClock({ selectedDate: '2026-11-04', viewWindow: 1 });
    expect(followCalls(onCommand)).toEqual([['clock.goNow', {}]]);
    view.unmount();
    // A remount later in the same session must not snap a browsing user back.
    const again = renderClock({ selectedDate: '2026-11-01', viewWindow: 0 });
    expect(followCalls(again.onCommand)).toEqual([]);
  });

  it('crossing midnight while showing today moves to the new day', () => {
    vi.setSystemTime(new Date(2026, 11, 31, 23, 59, 50));
    seed();
    const { onCommand } = renderClock({ selectedDate: '2026-12-31', viewWindow: 1 });
    expect(followCalls(onCommand)).toEqual([]);
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(followCalls(onCommand)).toEqual([['clock.goNow', {}]]);
  });

  it('crossing midnight while browsing a past day leaves it alone', () => {
    vi.setSystemTime(new Date(2026, 10, 5, 23, 59, 50));
    seed();
    claimStartup('mother-clock'); // the app has been running a while
    const { onCommand } = renderClock({ selectedDate: '2026-11-02', viewWindow: 0 });
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(followCalls(onCommand)).toEqual([]);
  });

  it('noon flips the dial to the PM half when following now', () => {
    vi.setSystemTime(new Date(2026, 10, 5, 11, 59, 50));
    seed();
    const { onCommand } = renderClock({ selectedDate: '2026-11-05', viewWindow: 0 });
    expect(followCalls(onCommand)).toEqual([]);
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(followCalls(onCommand)).toEqual([['clock.setViewWindow', { window: 1 }]]);
  });
});

describe('face overlay never takes the pointer (#202)', () => {
  it('ticks, numerals, readout, hands and hub sit in a pointer-events:none group', () => {
    seed();
    renderClock({});
    const overlay = document.querySelector('[data-testid="clock-face-overlay"]');
    expect(overlay).toBeTruthy();
    expect(overlay!.getAttribute('pointer-events')).toBe('none');
    // 60 ticks + the hands are lines; the 12 numerals and the HH:MM readout are text.
    expect(overlay!.querySelectorAll('line').length).toBeGreaterThanOrEqual(60);
    expect(overlay!.querySelectorAll('text').length).toBe(13);
    // The wedges stay outside it, so they keep their hover / click.
    const svg = overlay!.closest('svg')!;
    for (const w of Array.from(svg.querySelectorAll('[data-testid="clock-reality-arc"]'))) {
      expect(overlay!.contains(w)).toBe(false);
    }
  });
});

describe('"Counts toward" keeps an orphan task (#204)', () => {
  it('a span tagged with a deleted task shows the span label, not a blank', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 5, 11, 0, 0));
    seed([
      {
        id: 'mother-pomo', kind: 'pomo', position: { x: 0, y: 0 }, isMother: true, config: {},
        state: {
          status: 'idle', startedAt: null, activeTaskId: null, label: '', pausedAt: null,
          history: [{
            id: 'seg-1', startedAt: new Date(2026, 10, 5, 9, 0).toISOString(), endedAt: new Date(2026, 10, 5, 10, 0).toISOString(),
            durationMin: 60, completed: false, kind: 'work', label: 'Old essay', taskId: 'task-gone',
          }],
        },
      },
    ]);
    renderClock({ selectedDate: '2026-11-05', viewWindow: 0 });
    const wedge = document.querySelector('[data-testid="clock-reality-arc"]');
    expect(wedge).toBeTruthy();
    fireEvent.click(wedge!);
    const select = screen.getByTestId('clock-reality-retag');
    expect(select.textContent).toContain('Old essay');
  });
});
