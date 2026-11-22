// @vitest-environment jsdom
/**
 * Decision 63 (owner, 2026-11-22: the task being moved on the Clock was "too
 * slow and too stuttery") — the carried item is one small arc of its own that
 * follows the ghost and glides from step to step; the Clock window changes
 * only when a drag starts and ends (the original steps back).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import React from 'react';
import { ClockCarriedArc, CARRIED_GLIDE_MS } from '../ClockCarriedArc';
import { carriedClockId, type TaskEntry } from '../dayModel';
import { arcPath } from '../dialGeometry';
import { setCalendarGhost, type GhostSpec } from '../../CalendarNode/DropGhost';

const entry = (id: string, start: number, end: number): TaskEntry => ({ id, start, end, realStart: start, realEnd: end, name: id, colorVar: 'var(--acid)', plannedMin: (end - start) * 60, breakdown: null, parallelGroupId: null, parallelBranchIndex: null, source: 'task' });
const ghost = (startMin: number, endMin: number, extra: Partial<GhostSpec> = {}): GhostSpec => ({ day: '2026-05-14', startMin, endMin, name: 't-a', times: '', tone: 'var(--acid)', testId: 'calendar-snap-band', refId: 't-a', refKind: 'task', ...extra });
/** A ghost that names nothing (a habit's time line, a new item from the Calendar's field). */
const bare = (startMin: number, endMin: number, extra: Partial<GhostSpec> = {}): GhostSpec => ({ day: '2026-05-14', startMin, endMin, name: 'n', times: '', tone: 'var(--acid)', testId: 'calendar-habit-ghost', ...extra });
const BASE_R = 95;
const arc = () => document.querySelector<SVGPathElement>('[data-testid="clock-carried-arc"]');
const show = (planned: TaskEntry[]) => render(
  <svg><ClockCarriedArc planned={planned} ymd="2026-05-14" half={0} baseR={BASE_R} laneStep={9} stroke={7} /></svg>,
);
/** Frames and the clock driven by the test (jsdom's own frame timing is not reliable). */
function manualFrames() {
  let now = 1000;
  let queue: FrameRequestCallback[] = [];
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { queue.push(cb); return queue.length; });
  vi.stubGlobal('cancelAnimationFrame', () => { queue = []; });
  return (afterMs: number) => {
    now += afterMs;
    const due = queue;
    queue = [];
    act(() => { for (const cb of due) cb(now); });
  };
}

afterEach(() => { cleanup(); act(() => setCalendarGhost(null)); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('the carried arc on the Clock', () => {
  it('nothing carried: no arc; carried on this day: an arc at the ghost\'s time', () => {
    show([entry('t-a', 9, 10)]);
    expect(arc()).toBeNull();
    act(() => setCalendarGhost(ghost(10 * 60, 11 * 60)));
    expect(arc()!.getAttribute('d')).toBe(arcPath(10, 11, BASE_R));
  });

  it('glides to the next step (in between on the way, exactly there at the end)', () => {
    const frame = manualFrames();
    show([entry('t-a', 9, 10)]);
    act(() => setCalendarGhost(ghost(10 * 60, 11 * 60)));
    act(() => setCalendarGhost(ghost(10 * 60 + 30, 11 * 60 + 30)));
    // At once it has not jumped to the new place.
    expect(arc()!.getAttribute('d')).toBe(arcPath(10, 11, BASE_R));
    frame(CARRIED_GLIDE_MS / 3);
    const mid = arc()!.getAttribute('d');
    expect(mid).not.toBe(arcPath(10, 11, BASE_R));
    expect(mid).not.toBe(arcPath(10.5, 11.5, BASE_R));
    frame(CARRIED_GLIDE_MS);
    expect(arc()!.getAttribute('d')).toBe(arcPath(10.5, 11.5, BASE_R));
  });

  it('a new step during a glide goes on from where it is drawn (no jump back)', () => {
    const frame = manualFrames();
    show([entry('t-a', 9, 10)]);
    act(() => setCalendarGhost(ghost(10 * 60, 11 * 60)));
    act(() => setCalendarGhost(ghost(11 * 60, 12 * 60)));
    frame(CARRIED_GLIDE_MS / 3);
    const mid = arc()!.getAttribute('d');
    act(() => setCalendarGhost(ghost(11 * 60 + 15, 12 * 60 + 15)));
    // Still where it was drawn, not back at 10:00.
    expect(arc()!.getAttribute('d')).toBe(mid);
    frame(CARRIED_GLIDE_MS * 2);
    expect(arc()!.getAttribute('d')).toBe(arcPath(11.25, 12, BASE_R));
  });

  it('reduced motion: it steps without a glide', () => {
    document.documentElement.setAttribute('data-motion', 'reduced');
    try {
      show([entry('t-a', 9, 10)]);
      act(() => setCalendarGhost(ghost(10 * 60, 11 * 60)));
      act(() => setCalendarGhost(ghost(10 * 60 + 30, 11 * 60 + 30)));
      expect(arc()!.getAttribute('d')).toBe(arcPath(10.5, 11.5, BASE_R));
    } finally { document.documentElement.removeAttribute('data-motion'); }
  });

  it('over another plan it takes the next lane out, as the Clock would place it', () => {
    show([entry('t-a', 9, 10), entry('t-b', 10, 12)]);
    act(() => setCalendarGhost(ghost(10 * 60 + 30, 11 * 60 + 30)));
    expect(arc()!.getAttribute('d')).toBe(arcPath(10.5, 11.5, BASE_R + 9));
  });

  it('carried to another day, or a habit\'s time line: no arc', () => {
    show([entry('t-a', 9, 10)]);
    act(() => setCalendarGhost(ghost(600, 660, { day: '2026-05-15' })));
    expect(arc()).toBeNull();
    act(() => setCalendarGhost(bare(600, 630, { ruleOnly: true })));
    expect(arc()).toBeNull();
  });

  it('an event is an outline (and is named by its habit id, as on the Clock)', () => {
    show([{ ...entry('habit-ev', 9, 10), routine: true }]);
    act(() => setCalendarGhost(ghost(600, 660, { refId: 'ev', refKind: 'event' })));
    expect(document.querySelectorAll('[data-testid="clock-carried-arc-group"] path')).toHaveLength(2);
    expect(carriedClockId(ghost(600, 660, { refId: 'ev', refKind: 'event' }))).toBe('habit-ev');
    expect(carriedClockId(bare(600, 660))).toBe('calendar-carried');
    expect(carriedClockId(null)).toBeNull();
  });
});
