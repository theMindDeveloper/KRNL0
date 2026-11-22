// @vitest-environment jsdom
/**
 * Decision 63 (performance, owner 2026-11-22: "stuttery and laggy … find the
 * root cause"): moving the pointer reads no page layout; a drop is drawn
 * where it lands before the board changes; the step is 15 minutes like the
 * old repeating-event drag; pulling an edge redraws the block at its new
 * times (owner, same day: "resizing is messing up the time" — the text must
 * be what it will be when let go, and nothing may change on release).
 * Nothing pops when a plan lands; a canvas card carried onto the Calendar is
 * as calm as a repeating event and the canvas holds still under it.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { WeekView } from '../WeekView';
import { useBoardStore } from '../../../../store/boardStore';
import { calendarGhost, setCalendarGhost } from '../DropGhost';
import { beginCalendarDrag, calendarGeometryMoved, externalDragMove, isOverCalendar, registerCalendarSurface, type CalendarSurface } from '../calendarDrag';
import { calendarCarryLanded, calendarCarryShowHome } from '../../../Canvas/calendarCarry';
import { afterLanding, mockCalendarLayout, nextFrame, pageSurfaceEl, release } from './calendarLayout';
import type { CalendarState, CalendarConfig } from '../types';

const state: CalendarState = { selectedDate: null, anchorDate: '2026-05-11', zoom: 1 };
const config: CalendarConfig = { view: 'week', weekStartsOn: 'monday', showHabits: true, showPomoHeatmap: true, hourRange: { start: 0, end: 24 } };
function task(id: string, scheduledFor: string, plannedMin: number) {
  return {
    id, kind: 'todo.task', position: { x: 0, y: 0 }, isMother: false,
    state: {
      text: id, done: false, scheduledFor, durationMin: plannedMin, eta: '', sequenceNumber: 1, layer: 0,
      createdAt: '2026-05-01T00:00:00.000Z', parentTodoId: 'todo-1', parentTaskId: null, todoItemId: null,
      pomoSessionsCompleted: 0, plannedMin, secondsAccumulated: 0, currentSessionElapsedSec: 0, kind: 'event' as const,
    },
    config: { showDuration: true },
  };
}
const seed = (nodes: unknown[]) => useBoardStore.setState({ board: { version: 1, schemaVersion: 2, savedAt: '', viewport: { x: 0, y: 0, zoom: 1 }, nodes: nodes as never, edges: [], layoutMode: 'canvas' } });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-05-10T08:00:00'));
});
afterEach(() => { vi.useRealTimers(); cleanup(); setCalendarGhost(null); useBoardStore.setState({ board: null }); vi.restoreAllMocks(); });

describe('no layout read while the pointer moves', () => {
  it('the Calendar is measured when the drag starts; moving reads nothing; elementsFromPoint is never used', async () => {
    const commit = vi.fn<Parameters<CalendarSurface['commit']>, ReturnType<CalendarSurface['commit']>>(() => null);
    const el = pageSurfaceEl();
    const rect = vi.spyOn(el, 'getBoundingClientRect');
    const measure = vi.fn();
    const off = registerCalendarSurface({ el, slotAt: () => ({ day: '2026-05-12', min: 600 }), gran: () => 60, commit, measure, release: vi.fn() });
    const efp = vi.fn(() => [] as Element[]);
    (document as unknown as { elementsFromPoint: typeof efp }).elementsFromPoint = efp;
    try {
      beginCalendarDrag({ clientX: 0, clientY: 0, button: 0 }, { item: { kind: 'task', id: 't', name: 't', tone: 'x', lenMin: 30 } });
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 50, clientY: 50 }));
      await nextFrame();
      const afterStart = rect.mock.calls.length;
      expect(measure).toHaveBeenCalledTimes(1);
      for (let k = 0; k < 10; k++) { window.dispatchEvent(new MouseEvent('pointermove', { clientX: 60 + k * 9, clientY: 50 })); await nextFrame(); }
      expect(rect.mock.calls.length).toBe(afterStart);
      expect(efp).not.toHaveBeenCalled();
      await act(async () => { await release(150, 50); });
    } finally { off(); }
  });

  it('a scroll during the drag measures again (once)', async () => {
    const el = pageSurfaceEl();
    const measure = vi.fn();
    const off = registerCalendarSurface({ el, slotAt: () => ({ day: '2026-05-12', min: 600 }), gran: () => 15, commit: () => null, measure });
    try {
      beginCalendarDrag({ clientX: 0, clientY: 0, button: 0 }, { item: { kind: 'task', id: 't', name: 't', tone: 'x', lenMin: 30 } });
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 50, clientY: 50 }));
      await nextFrame();
      window.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 70, clientY: 50 }));
      await nextFrame();
      expect(measure).toHaveBeenCalledTimes(2);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    } finally { off(); }
  });
});

describe('a drop is drawn where it lands before the board changes', () => {
  it('nothing is committed in the release itself; it is, after the landed frame', async () => {
    const commit = vi.fn<Parameters<CalendarSurface['commit']>, ReturnType<CalendarSurface['commit']>>(() => null);
    const off = registerCalendarSurface({ el: pageSurfaceEl(), slotAt: () => ({ day: '2026-05-12', min: 600 }), gran: () => 15, commit });
    try {
      beginCalendarDrag({ clientX: 0, clientY: 0, button: 0 }, { item: { kind: 'task', id: 't', name: 't', tone: 'x', lenMin: 30 } });
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 50, clientY: 50 }));
      await nextFrame();
      window.dispatchEvent(new MouseEvent('pointerup', { clientX: 50, clientY: 50 }));
      expect(commit).not.toHaveBeenCalled();
      expect(calendarGhost()).toMatchObject({ day: '2026-05-12', startMin: 600 });
      await afterLanding();
      expect(commit).toHaveBeenCalledTimes(1);
    } finally { off(); }
  });

  it('the stepped-back original is hidden at once (no copy left behind)', async () => {
    seed([task('t-a', '2026-05-14T10:00', 60)]);
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const restore = mockCalendarLayout();
    try {
      fireEvent.pointerDown(document.querySelector('[data-testid="task-block-t-a"]')!, { button: 0, clientX: 350, clientY: 10.25 * 40 });
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 350, clientY: 12.25 * 40 }));
      await act(async () => { await nextFrame(); });
      window.dispatchEvent(new MouseEvent('pointerup', { clientX: 350, clientY: 12.25 * 40 }));
      expect(document.querySelector('[data-cal-surface]')!.classList.contains('is-landing')).toBe(true);
      expect(document.querySelector('[data-testid="task-block-t-a"]')!.classList.contains('is-carried')).toBe(true);
      await act(async () => { await afterLanding(); });
    } finally { restore(); }
  });
});

describe('the step is 15 minutes, like the old repeating-event drag', () => {
  it('a Calendar whose zoom snaps by the hour still moves in 15-minute steps', async () => {
    const off = registerCalendarSurface({ el: pageSurfaceEl(), slotAt: () => ({ day: '2026-05-12', min: 10 * 60 + 20 }), gran: () => 60, commit: () => null });
    try {
      beginCalendarDrag({ clientX: 0, clientY: 0, button: 0 }, { item: { kind: 'task', id: 't', name: 't', tone: 'x', lenMin: 30 } });
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 50, clientY: 50 }));
      await nextFrame();
      expect(calendarGhost()).toMatchObject({ startMin: 10 * 60 + 15 });
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    } finally { off(); }
  });
});

describe('pulling an edge redraws the block at its new times', () => {
  const blockEl = () => document.querySelector<HTMLElement>('[data-testid="task-block-t-a"]')!;
  const grabBottom = () => vi.spyOn(blockEl(), 'getBoundingClientRect').mockReturnValue({ left: 300, right: 400, top: 400, bottom: 440, width: 100, height: 40, x: 300, y: 400, toJSON: () => ({}) } as DOMRect);

  it('while pulled the Calendar draws it longer, with the times it will have; it is not stepped back; Esc puts it back', async () => {
    seed([task('t-a', '2026-05-14T10:00', 60)]);
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const restore = mockCalendarLayout();
    try {
      // The block is tall in the fake layout: grab its bottom edge as the engine would see it.
      grabBottom();
      const text0 = blockEl().textContent ?? '';
      const h0 = blockEl().style.height;
      fireEvent.pointerDown(blockEl(), { button: 0, clientX: 350, clientY: 439 });
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 350, clientY: 12 * 40 }));
      await act(async () => { await nextFrame(); });
      expect(blockEl().style.height).not.toBe(h0);
      expect(blockEl().classList.contains('is-carried')).toBe(false);
      // The same text, with the new end time where the block shows its times.
      if (text0.includes('10:00–11:00')) expect(blockEl().textContent).toContain('10:00–12:00');
      expect(blockEl().textContent?.split('10:00–')[0]).toBe(text0.split('10:00–')[0]);
      // The old stretch-by-attribute is gone (it drew the times in a second, different style).
      expect(blockEl().hasAttribute('data-stretch')).toBe(false);
      expect(document.querySelector('[data-live-times]')).toBeNull();
      expect(calendarGhost()).toMatchObject({ boxless: true, edge: 'bottom', endMin: 12 * 60 });
      act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
      expect(blockEl().style.height).toBe(h0);
      expect(blockEl().textContent).toBe(text0);
    } finally { restore(); }
  });

  it('let go: what it showed while pulled is what it shows after (nothing changes on release)', async () => {
    seed([task('t-a', '2026-05-14T10:00', 60)]);
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const restore = mockCalendarLayout();
    try {
      grabBottom();
      fireEvent.pointerDown(blockEl(), { button: 0, clientX: 350, clientY: 439 });
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 350, clientY: 12 * 40 }));
      await act(async () => { await nextFrame(); });
      const pulledH = blockEl().style.height;
      const pulledText = blockEl().textContent;
      await act(async () => { await release(350, 12 * 40); });
      expect(blockEl().style.height).toBe(pulledH);
      expect(blockEl().textContent).toBe(pulledText);
    } finally { restore(); }
  });
});

describe('a plan has no motion of its own (like a repeating event)', () => {
  it('no landing pop, no press-in; the package fades (no bounce, no spin, no lid)', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const css = readFileSync(join(__dirname, '..', '..', '..', '..', 'styles', 'reactflow-theme.css'), 'utf8');
    expect(css).not.toMatch(/is-landed/);
    expect(css).not.toMatch(/@keyframes cal-landed/);
    expect(css).not.toMatch(/\.cal-block:active/);
    expect(css).not.toMatch(/krnl-pkg-pack|krnl-pkg-unpack|krnl-pkg-lid/);
    expect(css).not.toMatch(/rotate\(-10deg\)/);
  });
});

describe('a canvas card carried onto the Calendar', () => {
  it('landed: it goes home unseen (no transition), then fades in there', () => {
    // jsdom has no CSS.escape.
    if (typeof CSS === 'undefined' || !CSS.escape) vi.stubGlobal('CSS', { escape: (v: string) => v });
    const node = document.createElement('div');
    node.className = 'react-flow__node';
    node.setAttribute('data-id', 'card-1');
    node.setAttribute('data-calendar-carry', '1');
    node.setAttribute('data-over-calendar', '1');
    document.body.appendChild(node);
    try {
      calendarCarryLanded('card-1');
      // Still in the box (unseen), and nothing animates it on its way home.
      expect(node.hasAttribute('data-over-calendar')).toBe(true);
      expect(node.hasAttribute('data-calendar-carry')).toBe(false);
      calendarCarryShowHome('card-1');
      expect(node.hasAttribute('data-over-calendar')).toBe(false);
      expect(node.hasAttribute('data-calendar-back')).toBe(true);
    } finally { node.remove(); vi.unstubAllGlobals(); }
  });

  it('the canvas can ask whether the point is over a Calendar (measured boxes only), and a pan of the canvas measures again', async () => {
    const el = pageSurfaceEl();
    const measure = vi.fn();
    const off = registerCalendarSurface({ el, slotAt: () => ({ day: '2026-05-12', min: 600 }), gran: () => 15, commit: () => null, measure });
    try {
      expect(isOverCalendar(50, 50)).toBe(false); // nothing carried
      externalDragMove({ kind: 'task', id: 'c', name: 'c', tone: 'x', lenMin: 30 }, 50, 50);
      expect(measure).toHaveBeenCalledTimes(1);
      const rect = vi.spyOn(el, 'getBoundingClientRect');
      expect(isOverCalendar(50, 50)).toBe(true);
      expect(rect).not.toHaveBeenCalled();
      calendarGeometryMoved();
      externalDragMove({ kind: 'task', id: 'c', name: 'c', tone: 'x', lenMin: 30 }, 60, 50);
      expect(measure).toHaveBeenCalledTimes(2);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    } finally { off(); }
  });
});

describe('no page-wide restyle at the start and end of a drag', () => {
  it('the cursor comes from the element it was picked up from (it keeps the pointer); <body> only turns selection off', async () => {
    const from = document.createElement('div');
    document.body.appendChild(from);
    const setCap = vi.fn();
    const relCap = vi.fn();
    Object.assign(from, { setPointerCapture: setCap, releasePointerCapture: relCap, hasPointerCapture: () => true });
    const off = registerCalendarSurface({ el: pageSurfaceEl(), slotAt: () => ({ day: '2026-05-12', min: 600 }), gran: () => 15, commit: () => null });
    try {
      beginCalendarDrag({ clientX: 0, clientY: 0, button: 0, currentTarget: from, pointerId: 7 } as never, { item: { kind: 'task', id: 't', name: 't', tone: 'x', lenMin: 30 } });
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 50, clientY: 50 }));
      await nextFrame();
      expect(setCap).toHaveBeenCalledWith(7);
      expect(from.style.cursor).toBe('grabbing');
      expect(document.body.style.userSelect).toBe('none');
      expect(document.body.style.cursor).toBe('');
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(relCap).toHaveBeenCalledWith(7);
      expect(from.style.cursor).toBe('');
      expect(document.body.style.userSelect).toBe('');
    } finally { off(); }
  });

  it('no style rule reads the drag marker (it restyled every element at each drag start and end)', async () => {
    const { readdirSync, readFileSync } = await import('fs');
    const { join } = await import('path');
    const dir = join(__dirname, '..', '..', '..', '..', 'styles');
    const hits = readdirSync(dir).filter((f) => f.endsWith('.css') && readFileSync(join(dir, f), 'utf8').includes('krnl-cal-dragging'));
    expect(hits).toEqual([]);
  });
});
