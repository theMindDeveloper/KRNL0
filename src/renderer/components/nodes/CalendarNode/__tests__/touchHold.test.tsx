// @vitest-environment jsdom
/**
 * calendar-clock-visuals F93 / F94 on a touch screen (owner, 2026-11-25: "why
 * doesn't it work on mobile with touch?"): a finger that moves scrolls; a
 * finger held still on empty time starts drag to add there.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react';
import React from 'react';
import { WeekView } from '../WeekView';
import { ClockNode } from '../../ClockNode';
import { useBoardStore } from '../../../../store/boardStore';
import { mockCalendarLayout } from './calendarLayout';
import { holdToDraw, HOLD_MS } from '../holdToDraw';
import type { CalendarState, CalendarConfig } from '../types';

const DAY = '2026-05-10';
const state: CalendarState = { selectedDate: null, anchorDate: DAY, zoom: 1 };
const config: CalendarConfig = { view: 'week', weekStartsOn: 'monday', showHabits: true, showPomoHeatmap: true, hourRange: { start: 0, end: 24 } };

function seed(): void {
  useBoardStore.setState({ board: { version: 1, schemaVersion: 2, savedAt: '', viewport: { x: 0, y: 0, zoom: 1 }, edges: [], layoutMode: 'canvas', nodes: [
    { id: 'mother-habit', kind: 'habit', isMother: true, position: { x: 0, y: 0 }, config: {}, state: { habits: [] } },
    { id: 'mother-pomo', kind: 'pomo', isMother: true, position: { x: 0, y: 0 }, config: {}, state: { status: 'idle', startedAt: null, activeTaskId: null, label: '', pausedAt: null, history: [] } },
    { id: 'mother-todo', kind: 'todo', isMother: true, position: { x: 0, y: 0 }, config: {}, state: { items: [] } },
  ] as never } });
}

/** A pointer event that says it is a finger (jsdom has no PointerEvent). */
function touchDown(el: Element, x: number, y: number): void {
  const ev = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y });
  Object.defineProperty(ev, 'pointerType', { value: 'touch' });
  Object.defineProperty(ev, 'pointerId', { value: 7 });
  act(() => { el.dispatchEvent(ev); });
}
function pointer(type: 'pointermove' | 'pointerup' | 'pointercancel', x: number, y: number): void {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperty(ev, 'pointerId', { value: 7 });
  act(() => { window.dispatchEvent(ev); });
}
const wait = (ms: number): void => { act(() => { vi.advanceTimersByTime(ms); }); };

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] }); seed(); });
afterEach(() => { vi.useRealTimers(); cleanup(); useBoardStore.setState({ board: null }); localStorage.clear(); vi.restoreAllMocks(); });

describe('Calendar: hold, then drag (F93 on touch)', () => {
  const col = (): Element => document.querySelector(`[data-cal-day="${DAY}"]`)!;

  it('a finger that moves at once scrolls: no box, no card', () => {
    vi.setSystemTime(new Date(`${DAY}T00:10:00`));
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const restore = mockCalendarLayout();
    try {
      touchDown(col(), 650, 400.5);
      pointer('pointermove', 650, 430);
      wait(HOLD_MS + 50);
      pointer('pointerup', 650, 430);
      expect(document.querySelector('[data-testid="cal-drag-box"]')).toBeNull();
      expect(document.querySelector('[data-testid="cal-drag-card"]')).toBeNull();
    } finally { restore(); }
  });

  it('held still, the box shows; dragged and let go, the card opens with its times', () => {
    vi.setSystemTime(new Date(`${DAY}T00:10:00`));
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const restore = mockCalendarLayout();
    try {
      // 28 px an hour: y 400.5 is 14:18, so the box starts at 14:15.
      touchDown(col(), 650, 400.5);
      wait(HOLD_MS - 50);
      expect(document.querySelector('[data-testid="cal-drag-box"]')).toBeNull();
      wait(60);
      expect(document.querySelector('[data-testid="cal-drag-box"]')).toBeTruthy();
      pointer('pointermove', 650, 448); // 16:00
      pointer('pointerup', 650, 448);
      expect(screen.getByTestId('cal-drag-card').getAttribute('aria-label')).toBe('New event');
      expect(screen.getByTestId('cal-drag-when').textContent).toContain('14:15 → 16:00');
    } finally { restore(); }
  });

  it('held and let go without a drag, the card opens for half an hour', () => {
    vi.setSystemTime(new Date(`${DAY}T00:10:00`));
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const restore = mockCalendarLayout();
    try {
      touchDown(col(), 650, 400.5);
      wait(HOLD_MS + 10);
      pointer('pointerup', 650, 400.5);
      expect(screen.getByTestId('cal-drag-when').textContent).toContain('14:15 → 14:45');
    } finally { restore(); }
  });

  it('a mouse still draws at once, with no hold', () => {
    vi.setSystemTime(new Date(`${DAY}T00:10:00`));
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const restore = mockCalendarLayout();
    try {
      fireEvent.pointerDown(col(), { button: 0, clientX: 650, clientY: 400.5 });
      pointer('pointermove', 650, 448);
      expect(document.querySelector('[data-testid="cal-drag-box"]')).toBeTruthy();
      pointer('pointerup', 650, 448);
    } finally { restore(); }
  });
});

describe('Clock: hold, then drag round (F94 on touch)', () => {
  it('held at 3 and dragged round to 6 on the PM half: 15:00 → 18:00', () => {
    vi.setSystemTime(new Date('2026-11-05T09:00:00'));
    render(<ClockNode node={{ id: 'mother-clock', kind: 'clock', position: { x: 0, y: 0 }, isMother: true, config: {}, state: { linkedTodoId: null, viewWindow: 1, selectedDate: '2026-11-05' } } as never} selected={false} onCommand={vi.fn()} onSelect={() => {}} />);
    const svg = document.querySelector('[data-testid="clock-dial"] svg')!;
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({ left: 0, top: 0, width: 240, height: 240, right: 240, bottom: 240, x: 0, y: 0, toJSON: () => ({}) } as DOMRect));
    try {
      touchDown(svg, 220, 120);
      wait(HOLD_MS + 10);
      expect(document.querySelector('[data-testid="clock-drag-span"]')).toBeTruthy();
      pointer('pointermove', 200, 200);
      pointer('pointermove', 120, 220);
      pointer('pointerup', 120, 220);
      expect(screen.getByTestId('cal-drag-card').getAttribute('aria-label')).toBe('New event');
      expect(screen.getByTestId('cal-drag-when').textContent).toContain('15:00 → 18:00');
    } finally { spy.mockRestore(); }
  });
});

describe('holdToDraw', () => {
  it('keeps the long-press menu shut and stops the page scrolling once the hold has fired', () => {
    const onHold = vi.fn();
    holdToDraw({ pointerId: 7, clientX: 10, clientY: 10 }, onHold);
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    window.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
    const early = new Event('touchmove', { cancelable: true });
    window.dispatchEvent(early);
    expect(early.defaultPrevented).toBe(false); // still waiting: a scroll is a scroll
    vi.advanceTimersByTime(HOLD_MS);
    expect(onHold).toHaveBeenCalledWith({ clientX: 10, clientY: 10 });
    const late = new Event('touchmove', { cancelable: true });
    window.dispatchEvent(late);
    expect(late.defaultPrevented).toBe(true);
    pointer('pointerup', 10, 10);
    const after = new Event('touchmove', { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  it('a lift or a cancel before the hold calls nothing', () => {
    const onHold = vi.fn();
    holdToDraw({ pointerId: 7, clientX: 10, clientY: 10 }, onHold);
    pointer('pointercancel', 10, 10);
    vi.advanceTimersByTime(HOLD_MS * 2);
    expect(onHold).not.toHaveBeenCalled();
  });
});
