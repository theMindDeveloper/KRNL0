// @vitest-environment jsdom
/**
 * Decision 61 — the owner's next round:
 *  - a plan carried out of the Calendar and let go elsewhere in the app comes off it;
 *  - a habit is moved as itself (all of its boxes glide; only the time line shows);
 *  - a short event in a small Calendar still says what it is;
 *  - the Clock shows what is being carried on the Calendar.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { WeekView } from '../WeekView';
import { useBoardStore } from '../../../../store/boardStore';
import { calendarGhost, setCalendarGhost } from '../DropGhost';
import { withCarried, type TaskEntry } from '../../ClockNode/dayModel';
import type { CalendarState, CalendarConfig } from '../types';
import { mockCalendarLayout, nextFrame, release } from './calendarLayout';

const unscheduleTask = vi.fn(async (_id: string) => undefined);
vi.mock('../../../../store/scheduleActions', async (orig) => ({
  ...(await orig<typeof import('../../../../store/scheduleActions')>()),
  unscheduleTask: (id: string) => unscheduleTask(id),
}));

const state: CalendarState = { selectedDate: null, anchorDate: '2026-05-11', zoom: 1 };
const config: CalendarConfig = { view: 'week', weekStartsOn: 'monday', showHabits: true, showPomoHeatmap: true, hourRange: { start: 0, end: 24 } };

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
function seed(nodes: unknown[]) {
  useBoardStore.setState({ board: { version: 1, schemaVersion: 2, savedAt: '', viewport: { x: 0, y: 0, zoom: 1 }, nodes: nodes as never, edges: [], layoutMode: 'canvas' } });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-05-10T08:00:00'));
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  setCalendarGhost(null);
  useBoardStore.setState({ board: null });
  unscheduleTask.mockClear();
  vi.restoreAllMocks();
});

describe('carried out of the Calendar (Decision 61)', () => {
  it('let go elsewhere in the app: it comes off the Calendar', async () => {
    seed([task('t-a', 'Write report', '2026-05-14T10:00', 60)]);
    render(<div><div data-testid="outside" /><WeekView state={state} config={config} onCommand={() => undefined} /></div>);
    const restore = mockCalendarLayout({ outside: () => document.querySelector('[data-testid="outside"]') });
    try {
      fireEvent.pointerDown(document.querySelector('[data-testid="task-block-t-a"]')!, { button: 0, clientX: 350, clientY: 10.25 * 40 });
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 900, clientY: 300 }));
      await act(async () => { await nextFrame(); });
      await act(async () => { await release(900, 300); });
      expect(unscheduleTask).toHaveBeenCalledWith('t-a');
    } finally { restore(); }
  });

  it('let go on the Calendar: it stays planned, at the new time', async () => {
    seed([task('t-a', 'Write report', '2026-05-14T10:00', 60)]);
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const restore = mockCalendarLayout();
    try {
      fireEvent.pointerDown(document.querySelector('[data-testid="task-block-t-a"]')!, { button: 0, clientX: 350, clientY: 10.25 * 40 });
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 350, clientY: 12.25 * 40 }));
      await act(async () => { await nextFrame(); });
      await act(async () => { await release(350, 12.25 * 40); });
      expect(unscheduleTask).not.toHaveBeenCalled();
    } finally { restore(); }
  });
});

describe('a habit is moved as itself (Decision 61)', () => {
  it('all of its boxes glide together; only the time line shows', async () => {
    seed([{ id: 'mother-habit', kind: 'habit', isMother: true, position: { x: 0, y: 0 }, config: {}, state: { habits: [
      { id: 'h-run', name: 'Run', color: 'acid', createdAt: '2026-05-01T00:00:00.000Z', log: [], archived: false, schedule: { kind: 'daily', timeOfDay: '07:00' } },
    ] } }]);
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const restore = mockCalendarLayout();
    try {
      const boxes = Array.from(document.querySelectorAll<HTMLElement>('[data-habit-id="h-run"]'));
      expect(boxes.length).toBe(7);
      fireEvent.pointerDown(boxes[2]!, { button: 0, clientX: 250, clientY: 7 * 40 });
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 250, clientY: 9 * 40 }));
      await act(async () => { await nextFrame(); });
      for (const b of boxes) expect(b.style.transform).toMatch(/translateY\(\d/);
      expect(calendarGhost()).toMatchObject({ ruleOnly: true, startMin: 9 * 60 });
      act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
      for (const b of boxes) expect(b.style.transform).toBe('');
    } finally { restore(); }
  });
});

describe('a short event in a small Calendar still says what it is (Decision 61)', () => {
  it('a half-hour event gets a one-line name', () => {
    seed([{ id: 'mother-habit', kind: 'habit', isMother: true, position: { x: 0, y: 0 }, config: {}, state: { habits: [
      { id: 'ev-1', name: 'Standup', color: 'acid', kind: 'routine', createdAt: '2026-05-01T00:00:00.000Z', log: [], archived: false, schedule: { kind: 'weekly', days: [4], timeOfDay: '09:00', durationMin: 30 } },
    ] } }]);
    render(<WeekView state={{ ...state, zoom: 1 }} config={config} onCommand={() => undefined} />);
    expect(document.querySelector('[data-testid="calendar-routine-title-ev-1"]')?.textContent).toBe('Standup');
  });
});

describe('the Clock shows what is carried (Decision 61)', () => {
  const entry = (id: string, start: number, end: number): TaskEntry => ({ id, start, end, realStart: start, realEnd: end, name: id, colorVar: 'var(--acid)', plannedMin: (end - start) * 60, breakdown: null, parallelGroupId: null, parallelBranchIndex: null, source: 'task' });

  it('the carried plan leaves its place and is drawn at the ghost', () => {
    const out = withCarried([entry('t-a', 9, 10), entry('t-b', 11, 12)], { day: '2026-05-14', startMin: 14 * 60, endMin: 15 * 60, name: 't-a', times: '', tone: 'var(--acid)', testId: 'calendar-snap-band', refId: 't-a', refKind: 'task' }, '2026-05-14', 1);
    expect(out.find((t) => t.id === 't-a')).toMatchObject({ start: 14, end: 15 });
    expect(out).toHaveLength(2);
  });

  it('carried to another day: gone from this day; an event uses its habit id', () => {
    const out = withCarried([entry('habit-ev', 9, 10)], { day: '2026-05-15', startMin: 600, endMin: 660, name: 'x', times: '', tone: 'var(--acid)', testId: 'calendar-routine-ghost', refId: 'ev', refKind: 'event' }, '2026-05-14', 0);
    expect(out).toHaveLength(0);
  });

  it('a habit (time line only) is not on the Clock', () => {
    const tasks = [entry('t-a', 9, 10)];
    expect(withCarried(tasks, { day: '2026-05-14', startMin: 600, endMin: 630, name: 'Run', times: '', tone: 'x', testId: 'calendar-habit-ghost', ruleOnly: true }, '2026-05-14', 0)).toBe(tasks);
  });
});
