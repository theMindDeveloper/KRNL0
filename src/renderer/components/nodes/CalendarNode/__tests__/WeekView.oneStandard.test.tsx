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
import { setCalendarGhost } from '../DropGhost';
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
  const dt = () => {
    const data: Record<string, string> = {};
    const setDragImage = vi.fn();
    return {
      data, setDragImage,
      setData: (k: string, v: string) => { data[k] = v; },
      getData: (k: string) => data[k] ?? '',
      get types() { return Object.keys(data); },
      effectAllowed: 'move', dropEffect: 'move',
    };
  };

  it('dragging a plan on the Calendar: the browser gets an empty picture, and the plan steps back', async () => {
    seed([task('t-plan', 'Read chapter', '2026-05-14T10:00', 60)]);
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const block = document.querySelector('[data-testid="task-block-t-plan"]') as HTMLElement;
    const d = dt();
    fireEvent.dragStart(block, { dataTransfer: d });
    expect(d.setDragImage).toHaveBeenCalledTimes(1);
    const pic = d.setDragImage.mock.calls[0]![0] as unknown;
    expect(pic).toBeInstanceOf(HTMLImageElement);
    expect((pic as HTMLImageElement).width).toBe(1);
    await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
    expect((document.querySelector('[data-testid="task-block-t-plan"]') as HTMLElement).style.opacity).toBe('0.35');
    fireEvent.dragEnd(document.querySelector('[data-testid="task-block-t-plan"]')!);
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
