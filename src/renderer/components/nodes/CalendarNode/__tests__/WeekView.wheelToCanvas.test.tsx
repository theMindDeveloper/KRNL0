// @vitest-environment jsdom
/**
 * Decision 61 — on the Free canvas, a Calendar whose day fits gives the plain
 * wheel to the canvas (nothing to scroll); zoomed into the hours, the wheel
 * scrolls them. Ctrl + wheel and a pinch always zoom the hours. In My layout
 * it always keeps the wheel.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { WeekView } from '../WeekView';
import { useBoardStore } from '../../../../store/boardStore';
import type { CalendarState, CalendarConfig } from '../types';

const config: CalendarConfig = { view: 'week', weekStartsOn: 'monday', showHabits: true, showPomoHeatmap: true, hourRange: { start: 0, end: 24 } };
const at = (zoom: number): CalendarState => ({ selectedDate: null, anchorDate: '2026-05-11', zoom });

class FakeResizeObserver {
  constructor(_cb: unknown) {}
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  // The hours' box is 600 px tall (jsdom has no layout).
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  useBoardStore.setState({
    board: { version: 1, schemaVersion: 2, savedAt: new Date().toISOString(), viewport: { x: 0, y: 0, zoom: 1 }, nodes: [], edges: [], layoutMode: 'canvas' },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useBoardStore.setState({ board: null });
});

const onTheCanvas = (state: CalendarState) =>
  render(<div className="react-flow__node"><WeekView state={state} config={config} onCommand={() => undefined} /></div>);
const grid = () => document.querySelector('[data-testid="calendar-grid-body"]') as HTMLElement;

describe('the wheel over the Calendar on the Free canvas (Decision 61)', () => {
  it('the day fits: the canvas gets the plain wheel (no nowheel); Ctrl + wheel still zooms the hours', () => {
    onTheCanvas(at(2));
    expect(grid().getAttribute('data-wheel')).toBe('canvas');
    expect(grid().classList.contains('nowheel')).toBe(false);
    const e = new WheelEvent('wheel', { deltaY: -120, ctrlKey: true, bubbles: true, cancelable: true });
    grid().dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it('zoomed into the hours: the Calendar keeps the wheel (it scrolls) and Ctrl + wheel zooms it', () => {
    onTheCanvas(at(4));
    expect(grid().getAttribute('data-wheel')).toBe('calendar');
    expect(grid().classList.contains('nowheel')).toBe(true);
    const e = new WheelEvent('wheel', { deltaY: 120, ctrlKey: true, bubbles: true, cancelable: true });
    grid().dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it('a plain wheel over a fitted day is not stopped on its way to the canvas', () => {
    onTheCanvas(at(2));
    const seen = vi.fn();
    grid().parentElement!.closest('.react-flow__node')!.addEventListener('wheel', seen);
    fireEvent.wheel(grid(), { deltaY: 120 });
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('in My layout (not on a canvas) the Calendar always keeps the wheel', () => {
    render(<WeekView state={at(2)} config={config} onCommand={() => undefined} />);
    expect(grid().getAttribute('data-wheel')).toBe('calendar');
    expect(grid().classList.contains('nowheel')).toBe(true);
  });
});
