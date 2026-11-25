// @vitest-environment jsdom
/**
 * calendar-clock-visuals F93 / F94 — drag to add (owner pick B, canvas
 * "KRNL0 Drag to add time"): press on empty time and drag; on release a small
 * card beside the box names it. In the past it logs time (the "what was it"
 * field), in the future it adds an event (Once / Repeats). The Clock does the
 * same round its dial; past the 12 it carries on into the next 12 hours.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { WeekView } from '../WeekView';
import { ClockNode } from '../../ClockNode';
import { useBoardStore } from '../../../../store/boardStore';
import { mockCalendarLayout } from './calendarLayout';
import type { CalendarState, CalendarConfig } from '../types';

const habitCmd = vi.fn(async (_cmd: string, _args: Record<string, unknown>) => undefined);
const planAt = vi.fn(async (_text: string, _day: string, _time: string, _len: number) => undefined);
vi.mock('../../../../store/scheduleActions', async (orig) => ({
  ...(await orig<typeof import('../../../../store/scheduleActions')>()),
  habitMotherCommand: (cmd: string, args: Record<string, unknown>) => habitCmd(cmd, args),
  addPlanAt: (text: string, day: string, time: string, len: number) => planAt(text, day, time, len),
}));

const DAY = '2026-05-10';
const state: CalendarState = { selectedDate: null, anchorDate: DAY, zoom: 1 };
const config: CalendarConfig = { view: 'week', weekStartsOn: 'monday', showHabits: true, showPomoHeatmap: true, hourRange: { start: 0, end: 24 } };
type Rec = { label: string; taskId: string | null; startedAt: string; endedAt: string };
const history = (): Rec[] => (useBoardStore.getState().board!.nodes.find((n) => n.kind === 'pomo')!.state as { history: Rec[] }).history;

function seed(): void {
  useBoardStore.setState({ board: { version: 1, schemaVersion: 2, savedAt: '', viewport: { x: 0, y: 0, zoom: 1 }, edges: [], layoutMode: 'canvas', nodes: [
    { id: 'mother-habit', kind: 'habit', isMother: true, position: { x: 0, y: 0 }, config: {}, state: { habits: [] } },
    { id: 'mother-pomo', kind: 'pomo', isMother: true, position: { x: 0, y: 0 }, config: {}, state: { status: 'idle', startedAt: null, activeTaskId: null, label: '', pausedAt: null, history: [] } },
    { id: 'mother-todo', kind: 'todo', isMother: true, position: { x: 0, y: 0 }, config: {}, state: { items: [] } },
  ] as never } });
}

function dragColumn(fromY: number, toY: number): void {
  const col = document.querySelector(`[data-cal-day="${DAY}"]`)!;
  fireEvent.pointerDown(col, { button: 0, clientX: 650, clientY: fromY });
  act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: 650, clientY: toY })); });
  act(() => { window.dispatchEvent(new MouseEvent('pointerup', { clientX: 650, clientY: toY })); });
}

afterEach(() => { vi.useRealTimers(); cleanup(); useBoardStore.setState({ board: null }); habitCmd.mockClear(); planAt.mockClear(); localStorage.clear(); vi.restoreAllMocks(); });

describe('Calendar: drag on empty hours (F93)', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); seed(); });

  it('a box in the past opens the card with the "what was it" field; a typed name logs the time', () => {
    vi.setSystemTime(new Date(`${DAY}T23:00:00`));
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const restore = mockCalendarLayout();
    try {
      dragColumn(56, 140);
      expect(document.querySelector('[data-testid="cal-drag-box"]')).toBeTruthy();
      expect(screen.getByTestId('cal-drag-card').getAttribute('aria-label')).toBe('Log this time');
      // The list is as tall as its lines (at most five): no empty gap under two names (owner, 2026-11-25).
      const rows = screen.getByTestId('cal-drag-rows');
      expect(rows.style.height).toBe('');
      expect(rows.style.maxHeight).toBe(`${5 * 30 + 4}px`);
      // It fills the card's inside, never past its right edge (owner, 2026-11-25).
      expect(screen.getByTestId('cal-drag').style.width).toBe('100%');
      const field = screen.getByTestId('cal-drag-type');
      fireEvent.change(field, { target: { value: 'Chess' } });
      act(() => { fireEvent.keyDown(field, { key: 'Enter' }); });
      expect(history()).toHaveLength(1);
      expect(history()[0]).toMatchObject({ label: 'Chess', taskId: null });
      expect(Date.parse(history()[0]!.endedAt) - Date.parse(history()[0]!.startedAt)).toBeGreaterThanOrEqual(15 * 60_000);
      expect(document.querySelector('[data-testid="cal-drag-card"]')).toBeNull();
    } finally { restore(); }
  });

  it('a box in the future adds an event, once on that day', () => {
    vi.setSystemTime(new Date(`${DAY}T00:10:00`));
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const restore = mockCalendarLayout();
    try {
      dragColumn(400, 460);
      expect(screen.getByTestId('cal-drag-card').getAttribute('aria-label')).toBe('New event');
      const name = screen.getByTestId('cal-drag-name');
      fireEvent.change(name, { target: { value: 'Design review' } });
      act(() => { fireEvent.keyDown(name, { key: 'Enter' }); });
      const add = habitCmd.mock.calls.find((c) => c[0] === 'habit.add');
      expect(add?.[1]).toMatchObject({ name: 'Design review', kind: 'routine', on: DAY });
    } finally { restore(); }
  });

  it('a press without a drag adds nothing, and Esc cancels the card', () => {
    vi.setSystemTime(new Date(`${DAY}T23:00:00`));
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const restore = mockCalendarLayout();
    try {
      dragColumn(100, 101);
      expect(document.querySelector('[data-testid="cal-drag-card"]')).toBeNull();
      dragColumn(56, 140);
      act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
      expect(document.querySelector('[data-testid="cal-drag-card"]')).toBeNull();
      expect(document.querySelector('[data-testid="cal-drag-box"]')).toBeNull();
    } finally { restore(); }
  });
});

describe('Clock: drag round the dial (F94)', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); seed(); });

  it('dragged from 3 to 6 on the PM half, it logs 15:00–18:00', () => {
    vi.setSystemTime(new Date('2026-11-05T23:00:00'));
    render(<ClockNode node={{ id: 'mother-clock', kind: 'clock', position: { x: 0, y: 0 }, isMother: true, config: {}, state: { linkedTodoId: null, viewWindow: 1, selectedDate: '2026-11-05' } } as never} selected={false} onCommand={vi.fn()} onSelect={() => {}} />);
    const svg = document.querySelector('[data-testid="clock-dial"] svg')!;
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({ left: 0, top: 0, width: 240, height: 240, right: 240, bottom: 240, x: 0, y: 0, toJSON: () => ({}) } as DOMRect));
    try {
      // 3 o'clock is right of the centre, 6 below, 12 above.
      fireEvent.pointerDown(svg, { button: 0, clientX: 220, clientY: 120 });
      act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: 200, clientY: 200 })); });
      act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: 120, clientY: 220 })); });
      expect(document.querySelector('[data-testid="clock-drag-span"]')).toBeTruthy();
      expect(document.querySelector('[data-testid="clock-drag-outer"]')).toBeNull();
      act(() => { window.dispatchEvent(new MouseEvent('pointerup', { clientX: 120, clientY: 220 })); });
      const field = screen.getByTestId('cal-drag-type');
      fireEvent.change(field, { target: { value: 'Chess' } });
      act(() => { fireEvent.keyDown(field, { key: 'Enter' }); });
      const r = history()[0]!;
      expect(r.label).toBe('Chess');
      expect(new Date(r.startedAt).getHours()).toBe(15);
      expect(new Date(r.endedAt).getHours()).toBe(18);
    } finally { spy.mockRestore(); }
  });

  it('carried on past 12, the dial turns to the other half (no second ring); the card keeps the whole time', () => {
    vi.setSystemTime(new Date('2026-11-05T23:00:00'));
    const onCommand = vi.fn();
    render(<ClockNode node={{ id: 'mother-clock', kind: 'clock', position: { x: 0, y: 0 }, isMother: true, config: {}, state: { linkedTodoId: null, viewWindow: 0, selectedDate: '2026-11-05' } } as never} selected={false} onCommand={onCommand} onSelect={() => {}} />);
    const svg = document.querySelector('[data-testid="clock-dial"] svg')!;
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({ left: 0, top: 0, width: 240, height: 240, right: 240, bottom: 240, x: 0, y: 0, toJSON: () => ({}) } as DOMRect));
    try {
      // From 9 (09:00) round the top past 12 to 3: 09:00 → 15:00.
      fireEvent.pointerDown(svg, { button: 0, clientX: 20, clientY: 120 });
      for (const [x, y] of [[50, 50], [120, 20], [190, 50], [220, 120]] as const) {
        act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y })); });
      }
      expect(document.querySelector('[data-testid="clock-drag-outer"]')).toBeNull();
      expect(onCommand).toHaveBeenCalledWith('clock.setViewWindow', { window: 1 });
      act(() => { window.dispatchEvent(new MouseEvent('pointerup', { clientX: 220, clientY: 120 })); });
      expect(screen.getByTestId('cal-drag-when').textContent).toContain('09:00 → 15:00');
    } finally { spy.mockRestore(); }
  });

  it('a start close to the time now lands exactly on it (and steps are 5 minutes)', () => {
    vi.setSystemTime(new Date('2026-11-05T15:02:00'));
    render(<ClockNode node={{ id: 'mother-clock', kind: 'clock', position: { x: 0, y: 0 }, isMother: true, config: {}, state: { linkedTodoId: null, viewWindow: 1, selectedDate: '2026-11-05' } } as never} selected={false} onCommand={vi.fn()} onSelect={() => {}} />);
    const svg = document.querySelector('[data-testid="clock-dial"] svg')!;
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({ left: 0, top: 0, width: 240, height: 240, right: 240, bottom: 240, x: 0, y: 0, toJSON: () => ({}) } as DOMRect));
    try {
      // Pressed at 3 o'clock (15:00, two minutes before now), dragged to 6.
      fireEvent.pointerDown(svg, { button: 0, clientX: 220, clientY: 120 });
      act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: 200, clientY: 200 })); });
      act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: 120, clientY: 220 })); });
      act(() => { window.dispatchEvent(new MouseEvent('pointerup', { clientX: 120, clientY: 220 })); });
      expect(screen.getByTestId('cal-drag-when').textContent).toContain('15:02 → 18:00');
    } finally { spy.mockRestore(); }
  });
  const clockAt = (viewWindow: 0 | 1, selectedDate: string, onCommand: ReturnType<typeof vi.fn>) => (
    <ClockNode node={{ id: 'mother-clock', kind: 'clock', position: { x: 0, y: 0 }, isMother: true, config: {}, state: { linkedTodoId: null, viewWindow, selectedDate } } as never} selected={false} onCommand={onCommand} onSelect={() => {}} />
  );
  const box = () => vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({ left: 0, top: 0, width: 240, height: 240, right: 240, bottom: 240, x: 0, y: 0, toJSON: () => ({}) } as DOMRect));
  // 9 → 12 → 3 round the top of the dial.
  const pastTwelve = (): void => {
    const svg = document.querySelector('[data-testid="clock-dial"] svg')!;
    fireEvent.pointerDown(svg, { button: 0, clientX: 20, clientY: 120 });
    for (const [x, y] of [[50, 50], [120, 20], [190, 50], [220, 120]] as const) {
      act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y })); });
    }
  };

  it('a cancelled drag turns the dial back to the half it started on (Esc, or the pointer taken)', () => {
    vi.setSystemTime(new Date('2026-11-05T23:00:00'));
    const onCommand = vi.fn();
    const { rerender } = render(clockAt(0, '2026-11-05', onCommand));
    const spy = box();
    try {
      pastTwelve();
      expect(onCommand).toHaveBeenCalledWith('clock.setViewWindow', { window: 1 });
      rerender(clockAt(1, '2026-11-05', onCommand));
      act(() => { window.dispatchEvent(new MouseEvent('pointerup', { clientX: 220, clientY: 120 })); });
      onCommand.mockClear();
      act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
      expect(screen.queryByTestId('cal-drag-when')).toBeNull();
      expect(onCommand).toHaveBeenCalledWith('clock.setViewWindow', { window: 0 });
      expect(onCommand).not.toHaveBeenCalledWith('clock.setSelectedDate', expect.anything());

      // The browser takes the pointer mid-drag: no card, the dial turns back too.
      rerender(clockAt(0, '2026-11-05', onCommand));
      onCommand.mockClear();
      pastTwelve();
      rerender(clockAt(1, '2026-11-05', onCommand));
      onCommand.mockClear();
      act(() => { window.dispatchEvent(new Event('pointercancel')); });
      expect(screen.queryByTestId('cal-drag-when')).toBeNull();
      expect(onCommand).toHaveBeenCalledWith('clock.setViewWindow', { window: 0 });
    } finally { spy.mockRestore(); }
  });

  it('dragged back across 12, the dial turns back as well', () => {
    vi.setSystemTime(new Date('2026-11-05T23:00:00'));
    const onCommand = vi.fn();
    render(clockAt(0, '2026-11-05', onCommand));
    const spy = box();
    try {
      pastTwelve();
      onCommand.mockClear();
      // Back from 3 over the top to 10.
      for (const [x, y] of [[190, 50], [120, 20], [50, 50]] as const) {
        act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y })); });
      }
      expect(onCommand).toHaveBeenCalledWith('clock.setViewWindow', { window: 0 });
    } finally { spy.mockRestore(); }
  });

  it('carried past midnight, the dial goes to the next day, marked +1 day; the card keeps 23:00 → 01:00', () => {
    vi.setSystemTime(new Date('2026-11-05T12:00:00'));
    const onCommand = vi.fn();
    const { rerender } = render(clockAt(1, '2026-11-05', onCommand));
    const spy = box();
    try {
      const svg = document.querySelector('[data-testid="clock-dial"] svg')!;
      // 11 o'clock on the PM half (23:00) over the top to 1 (01:00 the next day).
      fireEvent.pointerDown(svg, { button: 0, clientX: 70, clientY: 33.4 });
      for (const [x, y] of [[100, 21], [120, 20], [140, 21], [170, 33.4]] as const) {
        act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y })); });
      }
      expect(onCommand).toHaveBeenCalledWith('clock.setSelectedDate', { date: '2026-11-06' });
      expect(onCommand).toHaveBeenCalledWith('clock.setViewWindow', { window: 0 });
      rerender(clockAt(0, '2026-11-06', onCommand));
      expect(screen.getByTestId('clock-drag-span').textContent).toContain('23:00 → 01:00 +1 day');
      act(() => { window.dispatchEvent(new MouseEvent('pointerup', { clientX: 170, clientY: 33.4 })); });
      expect(screen.getByTestId('cal-drag-when').textContent).toContain('23:00 → 01:00');
    } finally { spy.mockRestore(); }
  });
});

describe('a drag that starts in the past stops at the now line (owner, 2026-11-25)', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); seed(); });
  const box = () => vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({ left: 0, top: 0, width: 240, height: 240, right: 240, bottom: 240, x: 0, y: 0, toJSON: () => ({}) } as DOMRect));
  const clock = () => <ClockNode node={{ id: 'mother-clock', kind: 'clock', position: { x: 0, y: 0 }, isMother: true, config: {}, state: { linkedTodoId: null, viewWindow: 1, selectedDate: '2026-11-05' } } as never} selected={false} onCommand={vi.fn()} onSelect={() => {}} />;
  const dial = (path: ReadonlyArray<readonly [number, number]>): void => {
    const svg = document.querySelector('[data-testid="clock-dial"] svg')!;
    const [x0, y0] = path[0]!;
    fireEvent.pointerDown(svg, { button: 0, clientX: x0, clientY: y0 });
    for (const [x, y] of path.slice(1)) act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y })); });
    const [xe, ye] = path[path.length - 1]!;
    act(() => { window.dispatchEvent(new MouseEvent('pointerup', { clientX: xe, clientY: ye })); });
  };

  it('Clock: pulled from 12:00 past now (15:02) to 6, it stops at 15:02 and logs', () => {
    vi.setSystemTime(new Date('2026-11-05T15:02:40'));
    render(clock());
    const spy = box();
    try {
      dial([[120, 20], [190, 50], [220, 120], [200, 200], [120, 220]]);
      expect(screen.getByTestId('cal-drag-card').getAttribute('aria-label')).toBe('Log this time');
      expect(screen.getByTestId('cal-drag-when').textContent).toContain('12:00 → 15:02');
    } finally { spy.mockRestore(); }
  });

  it('Clock: a drag that starts in the future is still an event', () => {
    vi.setSystemTime(new Date('2026-11-05T15:02:00'));
    render(clock());
    const spy = box();
    try {
      dial([[120, 220], [50, 200], [20, 120]]);
      expect(screen.getByTestId('cal-drag-card').getAttribute('aria-label')).toBe('New event');
      expect(screen.getByTestId('cal-drag-when').textContent).toContain('18:00 → 21:00');
    } finally { spy.mockRestore(); }
  });

  it('Calendar: a box from 10:00 pulled down to 14:00 stops at now (12:02) and logs', () => {
    vi.setSystemTime(new Date(`${DAY}T12:02:00`));
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const restore = mockCalendarLayout();
    try {
      // 28 px an hour: 10:00 is y 280, 14:00 is y 392.
      dragColumn(280.5, 392);
      expect(screen.getByTestId('cal-drag-card').getAttribute('aria-label')).toBe('Log this time');
      expect(screen.getByTestId('cal-drag-when').textContent).toContain('10:00 → 12:02');
    } finally { restore(); }
  });
});

describe('Task · Event · Repeats on the drag card (owner pick B, 2026-11-25)', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); seed(); });
  const name = (v: string): void => {
    const field = screen.getByTestId('cal-drag-name');
    fireEvent.change(field, { target: { value: v } });
    act(() => { fireEvent.keyDown(field, { key: 'Enter' }); });
  };

  it('Task makes a plan in Todo at the box\'s time, and the card remembers the pick', () => {
    vi.setSystemTime(new Date(`${DAY}T00:10:00`));
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const restore = mockCalendarLayout();
    try {
      dragColumn(400, 460);
      expect(screen.getByTestId('cal-drag-card').getAttribute('aria-label')).toBe('New event');
      act(() => { fireEvent.click(screen.getByTestId('cal-drag-task')); });
      expect(screen.getByTestId('cal-drag-card').getAttribute('aria-label')).toBe('New task');
      expect(screen.getByTestId('cal-drag-add').textContent).toContain('Add task');
      name('Study');
      expect(planAt).toHaveBeenCalledWith('Study', DAY, '14:15', 130);
      expect(habitCmd).not.toHaveBeenCalled();
      // The next box opens on Task.
      dragColumn(500, 540);
      expect(screen.getByTestId('cal-drag-card').getAttribute('aria-label')).toBe('New task');
    } finally { restore(); }
  });

  it('a box carried into the next day\'s column runs past midnight (Sat 22:00 → Sun 01:00)', () => {
    vi.setSystemTime(new Date('2026-05-08T12:00:00'));
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const restore = mockCalendarLayout();
    try {
      // Saturday is the column at x 500–600, Sunday 600–700; 28 px an hour.
      const sat = document.querySelector('[data-cal-day="2026-05-09"]')!;
      fireEvent.pointerDown(sat, { button: 0, clientX: 550, clientY: 22 * 28 + 0.5 });
      act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: 550, clientY: 23.9 * 28 })); });
      act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: 650, clientY: 28 })); });
      expect(document.querySelector('[data-testid="cal-drag-box-more"]')).toBeTruthy();
      act(() => { window.dispatchEvent(new MouseEvent('pointerup', { clientX: 650, clientY: 28 })); });
      const when = screen.getByTestId('cal-drag-when').textContent ?? '';
      expect(when).toContain('Sat 9 → Sun 10');
      expect(when).toContain('22:00 → 01:00');
      act(() => { fireEvent.click(screen.getByTestId('cal-drag-task')); });
      name('Study');
      expect(planAt).toHaveBeenCalledWith('Study', '2026-05-09', '22:00', 180);
    } finally { restore(); }
  });

  it('the Clock card has the same row: Task adds a plan', () => {
    vi.setSystemTime(new Date('2026-11-05T12:00:00'));
    render(<ClockNode node={{ id: 'mother-clock', kind: 'clock', position: { x: 0, y: 0 }, isMother: true, config: {}, state: { linkedTodoId: null, viewWindow: 1, selectedDate: '2026-11-05' } } as never} selected={false} onCommand={vi.fn()} onSelect={() => {}} />);
    const svg = document.querySelector('[data-testid="clock-dial"] svg')!;
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({ left: 0, top: 0, width: 240, height: 240, right: 240, bottom: 240, x: 0, y: 0, toJSON: () => ({}) } as DOMRect));
    try {
      fireEvent.pointerDown(svg, { button: 0, clientX: 220, clientY: 120 });
      act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: 200, clientY: 200 })); });
      act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: 120, clientY: 220 })); });
      act(() => { window.dispatchEvent(new MouseEvent('pointerup', { clientX: 120, clientY: 220 })); });
      act(() => { fireEvent.click(screen.getByTestId('cal-drag-task')); });
      name('Gym');
      expect(planAt).toHaveBeenCalledWith('Gym', '2026-11-05', '15:00', 180);
    } finally { spy.mockRestore(); }
  });
});

describe('a drawn box lands on the edge of what is next to it (owner, 2026-11-25)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    seed();
    const b = useBoardStore.getState().board!;
    useBoardStore.setState({ board: { ...b, nodes: b.nodes.map((n) => (n.kind === 'habit' ? { ...n, state: { habits: [
      { id: 'ev-1', name: 'Lecture', color: 'acid', kind: 'routine', createdAt: '2026-05-01T00:00:00.000Z', log: [], archived: false, schedule: { kind: 'weekly', days: [7], timeOfDay: '10:00', durationMin: 60 } },
    ] } } : n)) } as never });
  });
  const pressAt = (fromY: number, toY: number, altKey = false): void => {
    const col = document.querySelector(`[data-cal-day="${DAY}"]`)!;
    fireEvent.pointerDown(col, { button: 0, clientX: 650, clientY: fromY, altKey });
    act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: 650, clientY: toY, altKey })); });
    act(() => { window.dispatchEvent(new MouseEvent('pointerup', { clientX: 650, clientY: toY, altKey })); });
  };

  it('started just under a 10:00–11:00 event, it starts at 11:00 (back to back)', () => {
    vi.setSystemTime(new Date(`${DAY}T23:00:00`));
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const restore = mockCalendarLayout();
    try {
      // 28 px an hour: 11:08 is y 311.7, 12:20 is y 345.3.
      pressAt(311.7, 345.3);
      expect(screen.getByTestId('cal-drag-when').textContent).toContain('11:00 → 12:20');
    } finally { restore(); }
  });

  it('with Alt held it stays where it was pressed (11:05)', () => {
    vi.setSystemTime(new Date(`${DAY}T23:00:00`));
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const restore = mockCalendarLayout();
    try {
      pressAt(311.7, 345.3, true);
      expect(screen.getByTestId('cal-drag-when').textContent).toContain('11:05 → 12:20');
    } finally { restore(); }
  });
});

describe('Calendar drags in 5-minute steps, as if there were no snap (owner, 2026-11-24)', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); seed(); });

  it('drag to add: a start close to the time now lands on it; ends in 5-minute steps', () => {
    vi.setSystemTime(new Date(`${DAY}T12:02:00`));
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const restore = mockCalendarLayout();
    try {
      // 28 px an hour: 12:00 is y 336; a press just after it is close to now (12:02).
      dragColumn(336.5, 336.5 + (65 / 60) * 28);
      const when = screen.getByTestId('cal-drag-when').textContent ?? '';
      expect(when).toMatch(/12:02 → \d\d:\d[05]/);
    } finally { restore(); }
  });

  it('a double-click on empty hours opens the event card at the 5-minute step under it (10:40, not 10:30)', () => {
    vi.setSystemTime(new Date(`${DAY}T06:00:00`));
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const restore = mockCalendarLayout();
    try {
      const col = document.querySelector(`[data-cal-day="${DAY}"]`)!;
      // 28 px an hour: 10:40 is y 298.7.
      fireEvent.doubleClick(col, { clientX: 650, clientY: 299 });
      const time = document.querySelector('[data-testid="event-time"]') as HTMLInputElement | null;
      expect(time).toBeTruthy();
      expect(time!.value ?? time!.textContent).toContain('10:40');
    } finally { restore(); }
  });

  it('every move, resize and add snaps to 5 minutes at any zoom; the ghost does not glide', () => {
    const src = readFileSync(join(process.cwd(), 'src/renderer/components/nodes/CalendarNode/WeekView.tsx'), 'utf8');
    expect(src).toContain('export const DRAG_STEP_MIN = 5;');
    expect(src).toContain('gran: () => DRAG_STEP_MIN,');
    const css = readFileSync(join(process.cwd(), 'src/renderer/styles/reactflow-theme.css'), 'utf8');
    expect(css).toContain('.cal-drop-ghost { transition: none; }');
    expect(css).toContain('.cal-drop-rule { transition: none; }');
  });
});

describe('the kind pill makes a new kind (F22)', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); seed(); });

  it('"New kind" → Play, and the name is filed under it', () => {
    vi.setSystemTime(new Date(`${DAY}T23:00:00`));
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const restore = mockCalendarLayout();
    try {
      dragColumn(56, 140);
      fireEvent.change(screen.getByTestId('cal-drag-type'), { target: { value: 'Age of Empires 2' } });
      act(() => { fireEvent.click(screen.getByTestId('cal-drag-kind')); });
      act(() => { fireEvent.click(screen.getByTestId('cal-drag-kind-new')); });
      const k = screen.getByTestId('cal-drag-kind-new-name');
      fireEvent.change(k, { target: { value: 'Play' } });
      act(() => { fireEvent.keyDown(k, { key: 'Enter' }); });
      expect(screen.getByTestId('cal-drag-kind').textContent).toContain('Play');
      act(() => { fireEvent.click(screen.getByTestId('cal-drag-new')); });
      const lib = (useBoardStore.getState().board!.nodes.find((n) => n.kind === 'todo')!.state as { tagLibrary?: Array<{ id: string }> }).tagLibrary ?? [];
      expect(lib.map((t) => t.id)).toContain('play');
      expect(history()[0]).toMatchObject({ label: 'Age of Empires 2', tag: 'play' });
    } finally { restore(); }
  });
});

describe('drag over a small recorded piece (F23)', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); seed(); });

  it('the drag starts on it and the time is logged around it', () => {
    vi.setSystemTime(new Date(`${DAY}T23:00:00`));
    const b = useBoardStore.getState().board!;
    const bit = { id: 'bit', label: 'Emails', taskId: null, kind: 'work', completed: false, durationMin: 10, startedAt: new Date(`${DAY}T02:00:00`).toISOString(), endedAt: new Date(`${DAY}T02:10:00`).toISOString() };
    useBoardStore.setState({ board: { ...b, nodes: b.nodes.map((n) => (n.kind === 'pomo' ? { ...n, state: { ...(n.state as object), history: [bit] } } : n)) } as never });
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const restore = mockCalendarLayout();
    try {
      // Rows are 28 px an hour here: 01:00 → 04:00 covers the 02:00 piece.
      dragColumn(28, 112);
      const field = screen.getByTestId('cal-drag-type');
      fireEvent.change(field, { target: { value: 'Chess' } });
      act(() => { fireEvent.keyDown(field, { key: 'Enter' }); });
      expect(history().map((h) => h.label)).toEqual(['Chess', 'Emails', 'Chess']);
      expect(document.querySelector('[data-testid="cal-drag-card"]')).toBeNull();
    } finally { restore(); }
  });
});

describe('the Clock draws the dragged time where it can be seen', () => {
  it('above the face (the face hid it), just under the numbers', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-05T23:00:00'));
    seed();
    render(<ClockNode node={{ id: 'mother-clock', kind: 'clock', position: { x: 0, y: 0 }, isMother: true, config: {}, state: { linkedTodoId: null, viewWindow: 1, selectedDate: '2026-11-05' } } as never} selected={false} onCommand={vi.fn()} onSelect={() => {}} />);
    const svg = document.querySelector('[data-testid="clock-dial"] svg')!;
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({ left: 0, top: 0, width: 240, height: 240, right: 240, bottom: 240, x: 0, y: 0, toJSON: () => ({}) } as DOMRect));
    try {
      fireEvent.pointerDown(svg, { button: 0, clientX: 220, clientY: 120 });
      act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: 120, clientY: 220 })); });
      const span = document.querySelector('[data-testid="clock-drag-span"]')!;
      expect(span.nextElementSibling?.getAttribute('data-testid')).toBe('clock-face-overlay');
      act(() => { window.dispatchEvent(new MouseEvent('pointerup', { clientX: 120, clientY: 220 })); });
    } finally { spy.mockRestore(); }
  });
});

describe('touch and a taken pointer never draw (review, 2026-11-24)', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); seed(); });

  it('a finger on the hours scrolls: no box, no card', () => {
    vi.setSystemTime(new Date(`${DAY}T23:00:00`));
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const restore = mockCalendarLayout();
    try {
      const col = document.querySelector(`[data-cal-day="${DAY}"]`)!;
      fireEvent.pointerDown(col, { button: 0, clientX: 650, clientY: 56, pointerType: 'touch' });
      act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: 650, clientY: 140 })); });
      act(() => { window.dispatchEvent(new MouseEvent('pointerup', { clientX: 650, clientY: 140 })); });
      expect(document.querySelector('[data-testid="cal-drag-box"]')).toBeNull();
      expect(document.querySelector('[data-testid="cal-drag-card"]')).toBeNull();
    } finally { restore(); }
  });

  it('a pointer the browser takes away (pointercancel) clears the box and opens no card', () => {
    vi.setSystemTime(new Date(`${DAY}T23:00:00`));
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const restore = mockCalendarLayout();
    try {
      const col = document.querySelector(`[data-cal-day="${DAY}"]`)!;
      fireEvent.pointerDown(col, { button: 0, clientX: 650, clientY: 56 });
      act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: 650, clientY: 140 })); });
      expect(document.querySelector('[data-testid="cal-drag-box"]')).toBeTruthy();
      act(() => { window.dispatchEvent(new MouseEvent('pointercancel', { clientX: 650, clientY: 140 })); });
      expect(document.querySelector('[data-testid="cal-drag-box"]')).toBeNull();
      expect(document.querySelector('[data-testid="cal-drag-card"]')).toBeNull();
    } finally { restore(); }
  });
});

