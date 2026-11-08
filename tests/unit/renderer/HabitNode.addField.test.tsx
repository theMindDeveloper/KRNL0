// @vitest-environment jsdom
/** Decision 40 — the habit add card: habits only, sensible defaults, Enter adds; the button says what. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { HabitNode, tickableOn } from '../../../src/renderer/components/nodes/HabitNode';
import { defaultHabitState } from '../../../src/renderer/components/nodes/HabitNode/types';
import { cardToAnswer, cardSummary, DEFAULT_CARD } from '../../../src/renderer/components/nodes/HabitNode/HabitAddAsk';
import type { Node } from '../../../src/shared/types/node';
import type { HabitState, HabitConfig } from '../../../src/renderer/components/nodes/HabitNode/types';

afterEach(cleanup);

const node = { id: 'mother-habit', kind: 'habit', isMother: true, position: { x: 0, y: 0 }, state: defaultHabitState(), config: {} } as unknown as Node<HabitState, HabitConfig>;

function setup(n = node) {
  const onCommand = vi.fn();
  render(<HabitNode node={n} selected={false} onCommand={onCommand} onSelect={() => undefined} />);
  const input = screen.getByPlaceholderText('add a habit') as HTMLInputElement;
  return { onCommand, input };
}

describe('habit add field', () => {
  it('the card opens as you type; Escape closes it and clears what was typed', () => {
    const { input, onCommand } = setup();
    fireEvent.change(input, { target: { value: 'gym' } });
    expect(screen.getByTestId('habit-ask')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('habit-ask')).toBeNull();
    expect(input.value).toBe('');
    expect(onCommand).not.toHaveBeenCalled();
  });

  it('Enter adds with the defaults: every day, any time, a plain tick', () => {
    const { input, onCommand } = setup();
    fireEvent.change(input, { target: { value: 'Read 20 pages' } });
    expect(screen.getByTestId('habit-ask-add').textContent).toContain('every day');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommand).toHaveBeenCalledWith('habit.add', { name: 'Read 20 pages', schedule: { kind: 'daily' } });
  });

  it('days and a time: the button says them; no day picked turns it off', () => {
    const { input, onCommand } = setup();
    fireEvent.change(input, { target: { value: 'Gym' } });
    for (const d of [2, 4, 6, 7]) fireEvent.click(screen.getByTestId(`habit-ask-day-${d}`));
    fireEvent.change(screen.getByTestId('habit-ask-time'), { target: { value: '18:00' } });
    expect(screen.getByTestId('habit-ask-add').textContent).toContain('M W F · 18:00');
    fireEvent.click(screen.getByTestId('habit-ask-add'));
    expect(onCommand).toHaveBeenCalledWith('habit.add', { name: 'Gym', schedule: { kind: 'weekly', days: [1, 3, 5], timeOfDay: '18:00' } });
  });

  it('never asks "habit or routine": the card has no such question', () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: 'Class' } });
    expect(screen.queryByTestId('habit-ask-yes')).toBeNull();
    expect(screen.queryByTestId('habit-ask-no')).toBeNull();
    expect(screen.getByTestId('habit-ask-calendar').textContent).toContain('Calendar');
  });
});

describe('a name already in the node', () => {
  it('is said in the card (a second "Gym" makes every krnl habit command ambiguous)', () => {
    const withGym = { ...node, state: { habits: [{ id: 'g', name: 'Gym', createdAt: '2026-11-01T08:00:00.000Z', log: [], archived: false, color: 'acid' }] } } as unknown as typeof node;
    const { input } = setup(withGym);
    fireEvent.change(input, { target: { value: 'gym' } });
    expect(screen.getByTestId('habit-ask-dup')).toBeTruthy();
  });
  it('an archived one is offered back, with its history', () => {
    const archived = { ...node, state: { habits: [{ id: 'g', name: 'Gym', createdAt: '2026-11-01T08:00:00.000Z', log: ['2026-11-01'], archived: true, color: 'acid' }] } } as unknown as typeof node;
    const { input, onCommand } = setup(archived);
    fireEvent.change(input, { target: { value: 'gym ' } });
    expect(screen.getByTestId('habit-ask-archived').textContent).toContain('Restore "Gym" from the archive');
    fireEvent.click(screen.getByTestId('habit-ask-restore'));
    expect(onCommand).toHaveBeenCalledWith('habit.unarchive', { id: 'g' });
  });
});

describe('cardToAnswer / cardSummary', () => {
  it('the defaults are every day, any time', () => {
    expect(cardToAnswer(DEFAULT_CARD)).toEqual({ kind: 'habit', schedule: { kind: 'daily' } });
    expect(cardSummary(DEFAULT_CARD)).toBe('every day');
  });
  it('weekdays and weekends read as words; no day is not addable', () => {
    expect(cardToAnswer({ ...DEFAULT_CARD, days: [1, 2, 3, 4, 5] })?.schedule).toEqual({ kind: 'weekdays' });
    expect(cardSummary({ ...DEFAULT_CARD, days: [6, 7] })).toBe('weekends');
    expect(cardToAnswer({ ...DEFAULT_CARD, days: [] })).toBeNull();
  });
  it('times a week: any days, the target, an optional time', () => {
    const d = { ...DEFAULT_CARD, mode: 'week' as const, perWeek: 3 };
    expect(cardToAnswer(d)).toEqual({ kind: 'habit', schedule: { kind: 'daily' }, perWeek: 3 });
    expect(cardSummary(d)).toBe('3× a week');
  });
  it('an amount is optional; once chosen it needs 2 or more', () => {
    expect(cardToAnswer({ ...DEFAULT_CARD, amount: { target: 1, unit: '' } })).toBeNull();
    const eight = { ...DEFAULT_CARD, amount: { target: 8, unit: 'glasses' } };
    expect(cardToAnswer(eight)).toEqual({ kind: 'habit', schedule: { kind: 'daily' }, amount: { target: 8, unit: 'glasses' } });
    expect(cardSummary(eight)).toBe('every day · 8 glasses');
  });
  it('a half-typed time is not added', () => {
    expect(cardToAnswer({ ...DEFAULT_CARD, time: '25:9' })).toBeNull();
    expect(cardToAnswer({ ...DEFAULT_CARD, time: '07:30' })?.schedule).toEqual({ kind: 'daily', timeOfDay: '07:30' });
  });
});

describe('tickableOn', () => {
  const mondays = { kind: 'weekly', days: [1] } as never;
  it('fixed days only, unless the habit has a weekly target (any days count)', () => {
    expect(tickableOn({ schedule: mondays }, '2026-11-04')).toBe(false); // a Wednesday
    expect(tickableOn({ schedule: mondays }, '2026-11-02')).toBe(true);  // a Monday
    expect(tickableOn({ schedule: mondays, perWeek: 3 }, '2026-11-04')).toBe(true);
  });
});
