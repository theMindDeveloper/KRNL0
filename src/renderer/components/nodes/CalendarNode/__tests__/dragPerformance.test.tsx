// @vitest-environment jsdom
/**
 * Decision 63 (performance, owner 2026-11-22: "stuttery and laggy … find the
 * root cause"): moving the pointer reads no page layout; a drop is drawn
 * where it lands before the board changes; the step is 15 minutes like the
 * old repeating-event drag; pulling an edge stretches the block itself.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { WeekView } from '../WeekView';
import { useBoardStore } from '../../../../store/boardStore';
import { calendarGhost, setCalendarGhost } from '../DropGhost';
import { beginCalendarDrag, registerCalendarSurface, type CalendarSurface } from '../calendarDrag';
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

describe('pulling an edge stretches the block itself', () => {
  it('the block keeps its text and is not stepped back; only the time line shows; Esc puts it back', async () => {
    seed([task('t-a', '2026-05-14T10:00', 60)]);
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const restore = mockCalendarLayout();
    try {
      const block = document.querySelector<HTMLElement>('[data-testid="task-block-t-a"]')!;
      // The block is tall in the fake layout: grab its bottom edge as the engine would see it.
      vi.spyOn(block, 'getBoundingClientRect').mockReturnValue({ left: 300, right: 400, top: 400, bottom: 440, width: 100, height: 40, x: 300, y: 400, toJSON: () => ({}) } as DOMRect);
      const text0 = block.textContent;
      const h0 = block.style.height;
      fireEvent.pointerDown(block, { button: 0, clientX: 350, clientY: 439 });
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 350, clientY: 12 * 40 }));
      await act(async () => { await nextFrame(); });
      expect(block.style.height).not.toBe(h0);
      expect(block.classList.contains('is-carried')).toBe(false);
      expect(block.textContent).toBe(text0);
      expect(calendarGhost()).toMatchObject({ boxless: true, edge: 'bottom', endMin: 12 * 60 });
      act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
      expect(block.style.height).toBe(h0);
    } finally { restore(); }
  });
});
