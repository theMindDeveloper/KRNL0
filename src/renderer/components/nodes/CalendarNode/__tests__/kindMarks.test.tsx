// @vitest-environment jsdom
/**
 * Each block says what it is in its top-right corner (the owner): a task, a
 * one-time event, a repeating event; a missed task shows the red replan mark.
 * Blocks and events start exactly on their time line.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';
import { WeekView } from '../WeekView';
import { useBoardStore } from '../../../../store/boardStore';
import { setCalendarGhost } from '../DropGhost';
import { kindIconSvg, KIND_PATHS } from '../../../ui/kindIcons';
import type { CalendarState, CalendarConfig } from '../types';

// A wide week so every block has room for its mark (jsdom has no layout).
vi.stubGlobal('ResizeObserver', class {
  cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) { this.cb = cb; }
  observe(el: Element) { this.cb([{ target: el, contentRect: { width: 1600, height: 960 } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver); }
  unobserve() { /* no-op */ }
  disconnect() { /* no-op */ }
});

const state: CalendarState = { selectedDate: null, anchorDate: '2026-05-11', zoom: 3 };
const config: CalendarConfig = { view: 'week', weekStartsOn: 'monday', showHabits: true, showPomoHeatmap: true, hourRange: { start: 0, end: 24 } };

function task(id: string, scheduledFor: string) {
  return {
    id, kind: 'todo.task', position: { x: 0, y: 0 }, isMother: false,
    state: {
      text: id, done: false, scheduledFor, durationMin: 90, eta: '', sequenceNumber: 1, layer: 0,
      createdAt: '2026-05-01T00:00:00.000Z', parentTodoId: 'todo-1', parentTaskId: null, todoItemId: null,
      pomoSessionsCompleted: 0, plannedMin: 90, secondsAccumulated: 0, currentSessionElapsedSec: 0, kind: 'event' as const,
    },
    config: { showDuration: true },
  };
}
const lecture = { id: 'ev-lecture', name: 'Lecture', color: 'acid', kind: 'routine', createdAt: '2026-05-01T00:00:00.000Z', log: [], schedule: { kind: 'weekly', days: [4], timeOfDay: '14:00', durationMin: 120 } };
const dentist = { id: 'ev-dentist', name: 'Dentist', color: 'acid', kind: 'routine', createdAt: '2026-05-01T00:00:00.000Z', log: [], startsOn: '2026-05-15', endsOn: '2026-05-15', schedule: { kind: 'weekly', days: [5], timeOfDay: '10:00', durationMin: 120 } };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-05-14T08:00:00'));
  useBoardStore.setState({ board: { version: 1, schemaVersion: 2, savedAt: '', viewport: { x: 0, y: 0, zoom: 1 }, edges: [], layoutMode: 'canvas', nodes: [
    task('t-next', '2026-05-15T15:00'),
    task('t-missed', '2026-05-12T09:00'),
    { id: 'mother-habit', kind: 'habit', isMother: true, position: { x: 0, y: 0 }, config: {}, state: { habits: [lecture, dentist] } },
  ] as never } });
});
afterEach(() => { vi.useRealTimers(); cleanup(); setCalendarGhost(null); useBoardStore.setState({ board: null }); });

describe('kind marks (top right)', () => {
  it('a plan shows the task mark; a missed one the replan mark instead', () => {
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    expect(document.querySelector('[data-testid="task-kind-t-next"]')?.getAttribute('data-kind')).toBe('task');
    expect(document.querySelector('[data-testid="task-kind-t-missed"]')).toBeNull();
    expect(document.querySelector('[data-testid="task-replan-t-missed"]')).not.toBeNull();
  });

  it('a repeating event shows the repeat mark; a one-time event the event mark', () => {
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    expect(document.querySelector('[data-testid="calendar-routine-kind-ev-lecture"]')?.getAttribute('data-kind')).toBe('repeat');
    expect(document.querySelector('[data-testid="calendar-routine-kind-ev-dentist"]')?.getAttribute('data-kind')).toBe('event');
  });

  it('the drag ghost uses the same marks', () => {
    expect(kindIconSvg('task')).toContain(KIND_PATHS.task);
    expect(kindIconSvg('repeat')).toContain(KIND_PATHS.repeat);
  });
});
