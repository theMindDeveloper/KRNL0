// @vitest-environment jsdom
/**
 * Decision 62 — the Calendar adds only events (once or repeating); tasks come
 * from the Todo node. A one-time event is drawn like a repeating one, without
 * the repeat mark and without "every week".
 */
import { describe, it, expect, vi, afterEach, beforeEach, beforeAll } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { WeekView } from '../WeekView';
import { useBoardStore } from '../../../../store/boardStore';
import { setCalendarGhost } from '../DropGhost';
import type { CalendarState, CalendarConfig } from '../types';

const state: CalendarState = { selectedDate: null, anchorDate: '2026-05-11', zoom: 1 };
const config: CalendarConfig = { view: 'week', weekStartsOn: 'monday', showHabits: true, showPomoHeatmap: true, hourRange: { start: 0, end: 24 } };

function seed(habits: unknown[] = []) {
  useBoardStore.setState({
    board: {
      version: 1, schemaVersion: 2, savedAt: new Date().toISOString(), viewport: { x: 0, y: 0, zoom: 1 }, edges: [], layoutMode: 'canvas',
      nodes: [
        { id: 'mother-habit', kind: 'habit', isMother: true, position: { x: 0, y: 0 }, state: { habits }, config: {} },
        { id: 'mother-todo', kind: 'todo', isMother: true, position: { x: 0, y: 0 }, state: { items: [] }, config: {} },
      ] as never,
    },
  });
}
const habits = () => ((useBoardStore.getState().board!.nodes.find((n) => n.id === 'mother-habit')!.state as { habits: Array<Record<string, unknown>> }).habits);
const todoItems = () => ((useBoardStore.getState().board!.nodes.find((n) => n.id === 'mother-todo')!.state as { items: unknown[] }).items);
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

// Adding goes through the command dispatcher, loaded on first use: load it
// once here so each add lands within its own test.
beforeAll(async () => { await import('../../../Canvas/commandDispatch'); });
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

function typeInField(text: string) {
  fireEvent.click(document.querySelector('[data-testid="calendar-new"]')!);
  const input = document.querySelector('[data-testid="calendar-add-input"]') as HTMLInputElement;
  fireEvent.change(input, { target: { value: text } });
  return input;
}

describe('the Calendar adds only events (Decision 62)', () => {
  it('its field says so', () => {
    seed();
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    expect(document.querySelector('[data-testid="calendar-new"]')!.textContent).toBe('add an event');
    const input = typeInField('');
    expect(input.placeholder).toContain('Add an event');
  });

  it('"Dentist thu 15:00 1h" adds a one-time event on Thursday — and nothing to Todo', async () => {
    seed();
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const input = typeInField('Dentist thu 15:00 1h');
    // While typing, the event's ghost shows where it lands.
    await settle();
    const ghost = document.querySelector('[data-testid="calendar-add-ghost"]') as HTMLElement | null;
    expect(ghost?.getAttribute('data-day')).toBe('2026-05-14');
    expect(ghost?.getAttribute('data-start-min')).toBe('900');
    fireEvent.keyDown(input, { key: 'Enter' });
    await settle();
    expect(habits()).toHaveLength(1);
    expect(habits()[0]).toMatchObject({ name: 'Dentist', kind: 'routine', startsOn: '2026-05-14', endsOn: '2026-05-14', schedule: { kind: 'weekly', days: [4], timeOfDay: '15:00', durationMin: 60 } });
    expect(todoItems()).toHaveLength(0);
  });

  it('the event card shows while you type (as in Todo): Once, filled from the words; Enter adds it — never a task', async () => {
    seed();
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const input = typeInField('Dentist thu');
    await settle();
    expect(document.querySelector('[data-testid="event-card"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="event-name"]')!.textContent).toBe('Dentist');
    expect(document.querySelector('[data-testid="event-mode-once"]')!.getAttribute('aria-selected')).toBe('true');
    expect(document.querySelector('[data-testid="event-submit"]')!.textContent).toContain('Add event');
    // The field keeps the focus while the card is up.
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    await settle();
    expect(habits()[0]).toMatchObject({ name: 'Dentist', startsOn: '2026-05-14', schedule: { timeOfDay: '09:00' } });
    expect(todoItems()).toHaveLength(0);
  });

  it('a change on the card is kept: Repeats with its days, then Enter', async () => {
    seed();
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const input = typeInField('Choir thu 19:00');
    await settle();
    fireEvent.click(document.querySelector('[data-testid="event-mode-repeat"]')!);
    await settle();
    expect(document.querySelector('[data-testid="event-mode-repeat"]')!.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(input, { key: 'Enter' });
    await settle();
    expect(habits()[0]).toMatchObject({ name: 'Choir', kind: 'routine', schedule: { kind: 'weekly', days: [4], timeOfDay: '19:00' } });
    expect(habits()[0]!['startsOn']).toBeUndefined();
  });

  it('"every monday 10:00" shows the card on Repeats', async () => {
    seed();
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    typeInField('Class every monday 10:00');
    await settle();
    expect(document.querySelector('[data-testid="event-mode-repeat"]')!.getAttribute('aria-selected')).toBe('true');
  });
});

describe('a one-time event on the week (Decision 62)', () => {
  it('shows its time, no repeat mark and no "every week"', () => {
    seed([{ id: 'ev-1', name: 'Dentist', color: 'acid', kind: 'routine', createdAt: '2026-05-01T00:00:00.000Z', log: [], archived: false, startsOn: '2026-05-14', endsOn: '2026-05-14', schedule: { kind: 'weekly', days: [4], timeOfDay: '15:00', durationMin: 60 } }]);
    render(<WeekView state={{ ...state, zoom: 4 }} config={config} onCommand={() => undefined} />);
    const band = document.querySelector('[data-testid="calendar-routine-ev-1"]')!;
    expect(band).toBeTruthy();
    expect(band.getAttribute('data-date')).toBe('2026-05-14');
    expect(band.textContent).toContain('15:00');
    expect(band.textContent).not.toContain('every week');
    expect(document.querySelectorAll('[data-testid^="calendar-routine-ev-1"]')).toHaveLength(1);
  });
});
