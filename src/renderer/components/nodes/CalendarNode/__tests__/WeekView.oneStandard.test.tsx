// @vitest-environment jsdom
/**
 * Decision 61 — one standard for everything on the Calendar:
 *  - a plan and a repeating event at the same time sit side by side (one lane
 *    plan per day), never on top of each other (the owner: "this should never
 *    happen");
 *  - every drag onto or on the Calendar draws ONE ghost, and no browser drag
 *    picture.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { WeekView } from '../WeekView';
import { useBoardStore } from '../../../../store/boardStore';
import { calendarGhost, setCalendarGhost } from '../DropGhost';
import { carryIn, mockCalendarLayout, nextFrame, planItem } from './calendarLayout';
import type { CalendarState, CalendarConfig } from '../types';

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

const habitMother = (habits: unknown[]) => ({ id: 'mother-habit', kind: 'habit', isMother: true, position: { x: 0, y: 0 }, state: { habits }, config: {} });
// Thursday 14 May 2026 (ISO weekday 4), 14:00 for 90 minutes, every week.
const lecture = { id: 'r-lecture', name: 'Lecture', color: 'acid', kind: 'routine', createdAt: '2026-05-01T00:00:00.000Z', log: [], schedule: { kind: 'weekly', days: [4], timeOfDay: '14:00', durationMin: 90 } };

function seed(nodes: unknown[]) {
  useBoardStore.setState({
    board: { version: 1, schemaVersion: 2, savedAt: new Date().toISOString(), viewport: { x: 0, y: 0, zoom: 1 }, nodes: nodes as never, edges: [], layoutMode: 'canvas' },
  });
}

/** "lane/lanes" → the share of the plan area it takes, [from, to). */
const span = (el: Element): [number, number] => {
  const [lane, lanes] = (el.getAttribute('data-lane') ?? '0/1').split('/').map(Number) as [number, number];
  return [lane / lanes, (lane + 1) / lanes];
};
const overlaps = (a: [number, number], b: [number, number]) => Math.min(a[1], b[1]) - Math.max(a[0], b[0]) > 1e-9;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-05-10T08:00:00'));
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  setCalendarGhost(null);
  useBoardStore.setState({ board: null });
});

describe('plans and repeating events never cover each other (Decision 61)', () => {
  it('a plan at 14:30–15:30 and an event at 14:00–15:30 on the same day get their own lanes', () => {
    seed([habitMother([lecture]), task('t-plan', 'Read chapter', '2026-05-14T14:30', 60)]);
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const ev = document.querySelector('[data-testid="calendar-routine-r-lecture"]')!;
    const plan = document.querySelector('[data-testid="task-block-t-plan"]')!;
    expect(ev).toBeTruthy();
    expect(plan).toBeTruthy();
    expect(ev.getAttribute('data-lane')).toBe('0/2');
    expect(plan.getAttribute('data-lane')).toBe('1/2');
    expect(overlaps(span(ev), span(plan))).toBe(false);
  });

  it('two plans and an event at once: three lanes, no two the same', () => {
    seed([habitMother([lecture]), task('t-a', 'Read A', '2026-05-14T14:00', 60), task('t-b', 'Read B', '2026-05-14T14:15', 60)]);
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const els = ['calendar-routine-r-lecture', 'task-block-t-a', 'task-block-t-b'].map((id) => document.querySelector(`[data-testid="${id}"]`)!);
    const spans = els.map(span);
    for (let i = 0; i < spans.length; i++) for (let j = i + 1; j < spans.length; j++) expect(overlaps(spans[i]!, spans[j]!)).toBe(false);
  });

  it('an event alone still takes the whole plan area', () => {
    seed([habitMother([lecture])]);
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    expect(document.querySelector('[data-testid="calendar-routine-r-lecture"]')!.getAttribute('data-lane')).toBe('0/1');
  });
});

describe('one ghost, no browser picture (Decision 61)', () => {
  it('moving a plan (Decision 63): no browser drag, the plan steps back, the ghost shows where with its mark', async () => {
    seed([task('t-plan', 'Read chapter', '2026-05-14T10:00', 60)]);
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const restore = mockCalendarLayout();
    try {
      const block = document.querySelector('[data-testid="task-block-t-plan"]') as HTMLElement;
      expect(block.getAttribute('draggable')).toBeNull();
      // Thursday is the 4th column (x 300-400); grabbed at 10:15, carried two hours down.
      fireEvent.pointerDown(block, { button: 0, clientX: 350, clientY: 10.25 * 40 });
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 350, clientY: 12.25 * 40 }));
      await act(async () => { await nextFrame(); });
      expect((document.querySelector('[data-testid="task-block-t-plan"]') as HTMLElement).style.opacity).toBe('0.35');
      expect(calendarGhost()).toMatchObject({ day: '2026-05-14', startMin: 12 * 60, endMin: 13 * 60, mark: 'list', refId: 't-plan' });
      act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
      expect((document.querySelector('[data-testid="task-block-t-plan"]') as HTMLElement).style.opacity).toBe('1');
      expect(calendarGhost()).toBeNull();
    } finally { restore(); }
  });

  it('there is one ghost element per grid, whatever is carried', () => {
    seed([habitMother([lecture]), task('t-plan', 'Read chapter', '2026-05-14T10:00', 60)]);
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    expect(document.querySelectorAll('.cal-drop-ghost')).toHaveLength(1);
  });

  it('the ghost sits on the slot it is given, in that day', async () => {
    seed([]);
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    act(() => setCalendarGhost({ day: '2026-05-14', startMin: 600, endMin: 660, name: 'Read', times: '10:00–11:00', tone: 'var(--acid)', testId: 'calendar-snap-band' }));
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    const g = document.querySelector('[data-testid="calendar-snap-band"]') as HTMLElement;
    expect(g).toBeTruthy();
    expect(g.getAttribute('data-day')).toBe('2026-05-14');
    expect(g.getAttribute('data-start-min')).toBe('600');
    expect(g.textContent).toContain('Read');
    expect(g.textContent).toContain('10:00–11:00');
    expect(g.style.visibility).toBe('visible');
    act(() => setCalendarGhost(null));
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    expect(g.style.visibility).toBe('hidden');
  });
});

describe('a plan keeps the spot it was grabbed by (Decision 61, like an event)', () => {
  it('grabbed 10 minutes into it, let go at 10:55: it moves by whole steps from where it was (11:00), not to the pointer (10:00)', async () => {
    seed([task('t-plan', 'Read chapter', '2026-05-14T15:00', 60)]);
    const onCommand = vi.fn();
    render(<WeekView state={state} config={config} onCommand={onCommand} />);
    const restore = mockCalendarLayout();
    try {
      // At this zoom the step is one hour.
      fireEvent.pointerDown(document.querySelector('[data-testid="task-block-t-plan"]')!, { button: 0, clientX: 350, clientY: (15 + 10 / 60) * 40 });
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 350, clientY: (10 + 55 / 60) * 40 }));
      await act(async () => { await nextFrame(); });
      act(() => { window.dispatchEvent(new MouseEvent('pointerup', { clientX: 350, clientY: (10 + 55 / 60) * 40 })); });
      expect(onCommand).toHaveBeenCalledWith('calendar.schedule', { taskId: 't-plan', scheduledFor: '2026-05-14T11:00', scheduledDurationMin: 60 });
    } finally { restore(); }
  });

  it('from Todo (no grab spot): it starts where it is let go', async () => {
    seed([task('t-plan', 'Read chapter', '2026-05-14T15:00', 60)]);
    const onCommand = vi.fn();
    render(<WeekView state={state} config={config} onCommand={onCommand} />);
    const restore = mockCalendarLayout();
    try {
      await act(async () => { await carryIn(planItem('t-plan', 60), { x: 350, y: 10 * 40 }); });
      expect(onCommand).toHaveBeenCalledWith('calendar.schedule', { taskId: 't-plan', scheduledFor: '2026-05-14T10:00', scheduledDurationMin: 60 });
    } finally { restore(); }
  });
});
