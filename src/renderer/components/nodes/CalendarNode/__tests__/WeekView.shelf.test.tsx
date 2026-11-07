// @vitest-environment jsdom
/**
 * The shelf (calendar-clock-visuals.md F28): plans that clash where lanes would
 * be cut become one block with a named, draggable row per plan; a drop zone
 * unschedules; "Line up" puts open plans one after another. The tracked-time
 * track sits on the right edge (F29).
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

describe('WeekView — shelf (F28)', () => {
  it('three plans that clash become one shelf with a named row each; no "+N" chip', () => {
    seed(three());
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const shelves = document.querySelectorAll('.cal-shelf');
    expect(shelves).toHaveLength(1);
    const rows = Array.from(document.querySelectorAll('[data-testid^="calendar-shelf-row-"]')).map((r) => r.textContent);
    expect(rows).toEqual(['Read chapter B', 'Read chapter A', 'Call with Sam']);
    expect(document.querySelector('[data-testid="calendar-overflow-chip"]')).toBeNull();
    expect(document.querySelector('[data-testid="task-block-t-a"]')).toBeNull();
    expect(shelves[0]!.textContent).toContain('3 at once');
  });

  it('every row is draggable, and dragging one shows the unschedule zone; dropping there unschedules it', async () => {
    seed(three());
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const row = document.querySelector('[data-testid="calendar-shelf-row-t-c"]') as HTMLElement;
    expect(row.getAttribute('draggable')).toBe('true');
    const d = dt();
    fireEvent.dragStart(row, { dataTransfer: d });
    expect(JSON.parse(d.data['application/krnl-task']!)).toEqual({ taskId: 't-c', durationMin: 90 });
    await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
    const zone = document.querySelector('[data-testid="calendar-unschedule-drop"]') as HTMLElement;
    expect(zone).toBeTruthy();
    expect(zone.textContent).toContain('Drop here to unschedule');
    fireEvent.dragOver(zone, { dataTransfer: d });
    expect(zone.className).toContain('is-hot');
    fireEvent.drop(zone, { dataTransfer: d });
    expect(unscheduleTask).toHaveBeenCalledWith('t-c');
    expect(document.querySelector('[data-testid="calendar-unschedule-drop"]')).toBeNull();
  });

  it('the zone also goes away when a drag ends anywhere else', async () => {
    seed(three());
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const row = document.querySelector('[data-testid="calendar-shelf-row-t-a"]') as HTMLElement;
    fireEvent.dragStart(row, { dataTransfer: dt() });
    await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
    expect(document.querySelector('[data-testid="calendar-unschedule-drop"]')).toBeTruthy();
    fireEvent.dragEnd(row);
    expect(document.querySelector('[data-testid="calendar-unschedule-drop"]')).toBeNull();
  });

  it('"Line up" puts the open plans one after another from the first start', () => {
    seed(three());
    const onCommand = vi.fn();
    render(<WeekView state={state} config={config} onCommand={onCommand} />);
    const btn = document.querySelector('[data-testid^="calendar-shelf-lineup-"]') as HTMLElement;
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    const calls = onCommand.mock.calls.filter((c) => c[0] === 'calendar.schedule').map((c) => c[1]);
    // B (30m) keeps 10:00, A (45m) follows at 10:30, Sam at 11:15.
    expect(calls).toEqual([
      { taskId: 't-a', scheduledFor: '2026-05-14T10:30' },
      { taskId: 't-c', scheduledFor: '2026-05-14T11:15' },
    ]);
  });

  it('no "Line up" for plans already in the past (replan handles those)', () => {
    vi.setSystemTime(new Date('2026-05-20T08:00:00'));
    seed(three());
    render(<WeekView state={{ ...state, anchorDate: '2026-05-11' }} config={config} onCommand={() => undefined} />);
    expect(document.querySelector('[data-testid^="calendar-shelf-lineup-"]')).toBeNull();
    expect(document.querySelectorAll('[data-plan-state="missed"]').length).toBe(3);
  });

  it('two plans that fit side by side stay as two blocks', () => {
    seed(three().slice(0, 2));
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    expect(document.querySelector('.cal-shelf')).toBeNull();
    expect(document.querySelector('[data-testid="task-block-t-a"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="task-block-t-b"]')).toBeTruthy();
  });
});
