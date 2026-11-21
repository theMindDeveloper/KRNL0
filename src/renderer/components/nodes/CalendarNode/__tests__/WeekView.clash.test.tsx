// @vitest-environment jsdom
/**
 * Clashing plans (calendar-clock-visuals.md F28): where lanes are too narrow
 * for names, every plan stays its own slim bar at its own time, named by a
 * letter; a drop zone unschedules; "Line up" puts open plans one after another.
 * The tracked-time track sits at the day's left (F29).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import React from 'react';
import { WeekView } from '../WeekView';
import { useBoardStore } from '../../../../store/boardStore';
import type { CalendarState, CalendarConfig } from '../types';

const unscheduleTask = vi.fn(async (_id: string) => undefined);
vi.mock('../../../../store/scheduleActions', async (orig) => ({
  ...(await orig<typeof import('../../../../store/scheduleActions')>()),
  unscheduleTask: (id: string) => unscheduleTask(id),
}));

const state: CalendarState = { selectedDate: null, anchorDate: '2026-05-11', zoom: 1 };
const config: CalendarConfig = { view: 'week', weekStartsOn: 'monday', showHabits: true, showPomoHeatmap: true, hourRange: { start: 6, end: 23 } };

function task(id: string, text: string, scheduledFor: string, plannedMin: number) {
  return {
    id, kind: 'todo.task', position: { x: 0, y: 0 }, isMother: false,
    state: {
      text, done: false, scheduledFor, durationMin: plannedMin, eta: '', sequenceNumber: 1, layer: 0,
      createdAt: '2026-05-01T00:00:00.000Z', parentTodoId: 'todo-1', parentTaskId: null, todoItemId: null,
      pomoSessionsCompleted: 0, plannedMin, secondsAccumulated: 0, currentSessionElapsedSec: 0, kind: 'event' as const,
    },
    config: { showDuration: true },
  };
}

function seed(nodes: ReturnType<typeof task>[]) {
  useBoardStore.setState({
    board: { version: 1, schemaVersion: 2, savedAt: new Date().toISOString(), viewport: { x: 0, y: 0, zoom: 1 }, nodes, edges: [], layoutMode: 'canvas' },
  });
}

const dt = () => {
  const data: Record<string, string> = {};
  return {
    data,
    setData: (k: string, v: string) => { data[k] = v; },
    getData: (k: string) => data[k] ?? '',
    get types() { return Object.keys(data); },
    setDragImage: () => undefined,
    effectAllowed: 'move', dropEffect: 'move',
  };
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-05-10T08:00:00'));
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  useBoardStore.setState({ board: null });
  unscheduleTask.mockClear();
});

const three = () => [
  task('t-a', 'Read chapter A', '2026-05-14T10:00', 45),
  task('t-b', 'Read chapter B', '2026-05-14T10:00', 30),
  task('t-c', 'Call with Sam', '2026-05-14T10:15', 90),
];

describe('WeekView — clashing plans as letter bars (F28)', () => {
  it('three plans that clash in a narrow column: each its own bar, named by a letter; no "+N" chip, no hidden plan', () => {
    seed(three());
    // 2x zoom: a 30-minute bar is tall enough for its letter.
    render(<WeekView state={{ ...state, zoom: 2 }} config={config} onCommand={() => undefined} />);
    for (const id of ['t-a', 't-b', 't-c']) expect(document.querySelector('[data-testid="task-block-' + id + '"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="task-letter-t-a"]')!.textContent).toBe('RA');
    expect(document.querySelector('[data-testid="task-letter-t-b"]')!.textContent).toBe('RB');
    expect(document.querySelector('[data-testid="task-letter-t-c"]')!.textContent).toBe('C');
    expect(document.querySelector('[data-testid="calendar-overflow-chip"]')).toBeNull();
    // The full name is still on the bar (tooltip), for hover and screen readers.
    expect(document.querySelector('[data-testid="task-block-t-c"]')!.getAttribute('title')).toContain('Call with Sam');
  });

  it('every bar is draggable, and a drag shows no extra bars or outlines (Decision 60)', async () => {
    seed(three());
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const row = document.querySelector('[data-testid="task-block-t-c"]') as HTMLElement;
    expect(row.getAttribute('draggable')).toBe('true');
    const d = dt();
    fireEvent.dragStart(row, { dataTransfer: d });
    expect(JSON.parse(d.data['application/krnl-task']!)).toEqual({ taskId: 't-c', durationMin: 90 });
    await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
    expect(document.querySelector('[data-testid="calendar-unschedule-drop"]')).toBeNull();
    expect(document.querySelector('.cal-anytime.is-target')).toBeNull();
    fireEvent.dragEnd(row);
    expect(unscheduleTask).not.toHaveBeenCalled();
  });

  it('no "Fix overlap" tab: overlapping plans stay as placed (Decision 60)', () => {
    seed(three());
    const onCommand = vi.fn();
    render(<WeekView state={state} config={config} onCommand={onCommand} />);
    expect(document.querySelector('[data-testid^="calendar-lineup-"]')).toBeNull();
    expect(onCommand.mock.calls.filter((c) => c[0] === 'calendar.schedule')).toEqual([]);
  });

  it('no "Line up" for plans already in the past (replan handles those)', () => {
    vi.setSystemTime(new Date('2026-05-20T08:00:00'));
    seed(three());
    render(<WeekView state={{ ...state, anchorDate: '2026-05-11' }} config={config} onCommand={() => undefined} />);
    expect(document.querySelector('[data-testid^="calendar-lineup-"]')).toBeNull();
    expect(document.querySelectorAll('.cal-block[data-plan-state="missed"]').length).toBe(3);
  });

  it('a bar too narrow for "RA" in a row stands the letters one above the other — never an unnamed bar', () => {
    // Measure the calendar as a narrow Station week (each column ~60px).
    const RO = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(private cb: ResizeObserverCallback) {}
      observe() { this.cb([{ contentRect: { width: 460 } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
      unobserve() { /* none */ }
      disconnect() { /* none */ }
    } as unknown as typeof ResizeObserver;
    try {
      seed(three());
      render(<WeekView state={{ ...state, zoom: 2 }} config={config} onCommand={() => undefined} />);
      for (const id of ['t-a', 't-b', 't-c']) {
        const el = document.querySelector('[data-testid="task-letter-' + id + '"]');
        expect(el, id).toBeTruthy();
      }
      expect(document.querySelector('[data-testid="task-letter-t-a"]')!.className).toContain('cal-letter--stack');
      expect(document.querySelector('[data-testid="task-letter-t-a"]')!.textContent).toBe('RA');
    } finally {
      globalThis.ResizeObserver = RO;
    }
  });

  it('F31 — a plan alone in a narrow column wraps its name down the block; clashing plans keep letters', () => {
    // A Station week: the calendar is about 360 px wide, each day about 45 px.
    const RO = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(private cb: ResizeObserverCallback) {}
      observe() { this.cb([{ contentRect: { width: 360 } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
      unobserve() { /* none */ }
      disconnect() { /* none */ }
    } as unknown as typeof ResizeObserver;
    try {
      seed([...three(), task('t-d', 'Physics exercises', '2026-05-15T10:00', 90)]);
      render(<WeekView state={{ ...state, zoom: 2 }} config={config} onCommand={() => undefined} />);
      const wrapped = document.querySelector('[data-testid="task-wrap-t-d"]') as HTMLElement;
      expect(wrapped.textContent).toBe('Physics exercises');
      // Whole lines only: the height is a multiple of the 11 px line.
      expect(parseFloat(wrapped.style.maxHeight) % 11).toBe(0);
      expect(document.querySelector('[data-testid="task-letter-t-d"]')).toBeNull();
      // The three that clash stay letter bars (F28).
      expect(document.querySelector('[data-testid="task-wrap-t-a"]')).toBeNull();
      expect(document.querySelector('[data-testid="task-block-t-a"]')).toBeTruthy();
    } finally {
      globalThis.ResizeObserver = RO;
    }
  });

  it('two plans in a wide day keep their names (no letters)', () => {
    seed(three().slice(0, 2));
    render(<WeekView state={{ ...state, anchorDate: '2026-05-14' }} config={config} onCommand={() => undefined} singleDay />);
    expect(document.querySelector('.cal-letter')).toBeNull();
    expect(document.querySelector('[data-testid="task-block-t-a"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="task-block-t-b"]')).toBeTruthy();
  });
});
