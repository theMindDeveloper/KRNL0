// @vitest-environment jsdom
/** The habit add field asks first: Enter never adds with settings you did not choose. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { HabitNode } from '../../../src/renderer/components/nodes/HabitNode';
import { defaultHabitState } from '../../../src/renderer/components/nodes/HabitNode/types';
import { askMissing, askToAnswer, summary, EMPTY_ASK } from '../../../src/renderer/components/nodes/HabitNode/HabitAddAsk';
import { endsPastMidnight, isRepeatValid } from '../../../src/renderer/components/ui/RepeatEditor';
import type { Node } from '../../../src/shared/types/node';
import type { HabitState, HabitConfig } from '../../../src/renderer/components/nodes/HabitNode/types';

afterEach(cleanup);

const node = { id: 'mother-habit', kind: 'habit', isMother: true, position: { x: 0, y: 0 }, state: defaultHabitState(), config: {} } as unknown as Node<HabitState, HabitConfig>;

function setup() {
  const onCommand = vi.fn();
  render(<HabitNode node={node} selected={false} onCommand={onCommand} onSelect={() => undefined} />);
  const input = screen.getByPlaceholderText('add a habit or routine') as HTMLInputElement;
  return { onCommand, input };
}

describe('habit add field', () => {
  it('Escape clears what was typed', () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: 'gym' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('');
  });

  it('Enter asks "do you want to tick it off?" and adds nothing yet; Esc cancels', () => {
    const { input, onCommand } = setup();
    fireEvent.change(input, { target: { value: 'Gym' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('habit-ask')).toBeTruthy();
    expect(onCommand).not.toHaveBeenCalledWith('habit.add', expect.anything());
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('habit-ask')).toBeNull();
    expect(onCommand).not.toHaveBeenCalled();
  });

  it('yes → a habit: Add stays off until how often and when are answered', () => {
    const { input, onCommand } = setup();
    fireEvent.change(input, { target: { value: 'Gym' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(screen.getByTestId('habit-ask-yes'));
    const add = screen.getByTestId('habit-ask-add') as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(screen.getByTestId('habit-ask-missing').textContent).toBe('Pick how often');
    fireEvent.click(screen.getByTestId('habit-ask-often-weekdays'));
    expect(screen.getByTestId('habit-ask-missing').textContent).toBe('Pick any time or a set time');
    fireEvent.click(screen.getByTestId('habit-ask-when-any'));
    expect(add.disabled).toBe(false);
    expect(add.textContent).toBe('Add · weekdays, any time');
    fireEvent.click(add);
    expect(onCommand).toHaveBeenCalledWith('habit.add', { name: 'Gym', schedule: { kind: 'weekdays' } });
    expect(input.value).toBe('');
  });

  it('no → a routine: needs days, a start time and a length', () => {
    const { input, onCommand } = setup();
    fireEvent.change(input, { target: { value: 'Class' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(window, { key: 'n' });
    expect(screen.getByTestId('habit-ask-missing').textContent).toBe('Pick its days');
    fireEvent.click(screen.getByTestId('habit-ask-day-1'));
    fireEvent.click(screen.getByTestId('habit-ask-day-3'));
    fireEvent.change(screen.getByTestId('habit-ask-time'), { target: { value: '10:00' } });
    fireEvent.click(screen.getByTestId('habit-ask-len-120'));
    const add = screen.getByTestId('habit-ask-add');
    expect(add.textContent).toBe('Add · Mon Wed 10:00–12:00');
    fireEvent.click(add);
    expect(onCommand).toHaveBeenCalledWith('habit.add', {
      name: 'Class', kind: 'routine', schedule: { kind: 'weekly', days: [1, 3], timeOfDay: '10:00', durationMin: 120 },
    });
  });
});

describe('a name already in the node', () => {
  it('is said in the card (a second "Gym" makes every krnl habit command ambiguous)', () => {
    const withGym = { ...node, state: { habits: [{ id: 'g', name: 'Gym', createdAt: '2026-11-01T08:00:00.000Z', log: [], archived: false, color: 'acid' }] } } as unknown as typeof node;
    render(<HabitNode node={withGym} selected={false} onCommand={vi.fn()} onSelect={() => undefined} />);
    const input = screen.getByPlaceholderText('add a habit or routine') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'gym' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('habit-ask-dup')).toBeTruthy();
  });
});

describe('askMissing / askToAnswer', () => {
  it('nothing is answered by default', () => {
    expect(askMissing(EMPTY_ASK)).toBe('Answer yes or no');
    expect(askToAnswer(EMPTY_ASK)).toBeNull();
  });
  it('a habit at a set time needs the time and the length', () => {
    const d = { ...EMPTY_ASK, kind: 'habit' as const, often: 'daily' as const, when: 'at' as const };
    expect(askMissing(d)).toBe('Pick a time');
    expect(askMissing({ ...d, timeOfDay: '07:00' })).toBe('Pick how long');
    expect(askToAnswer({ ...d, timeOfDay: '07:00', durationMin: 30 })).toEqual({ kind: 'habit', schedule: { kind: 'daily', timeOfDay: '07:00', durationMin: 30 } });
  });
  it('a timed habit past midnight is refused; a routine may run past it (a night shift)', () => {
    const habitNight = { ...EMPTY_ASK, kind: 'habit' as const, often: 'daily' as const, when: 'at' as const, timeOfDay: '23:00', durationMin: 120 };
    expect(askMissing(habitNight)).toBe('Ends after midnight: start earlier or make it shorter');
    const shift = { ...EMPTY_ASK, kind: 'routine' as const, days: [5] as never, timeOfDay: '22:00', durationMin: 480 };
    expect(askMissing(shift)).toBeNull();
    expect(summary(shift)).toBe('Fri 22:00–06:00 next day');
    expect(isRepeatValid({ kind: 'daily', days: [], timeOfDay: '23:00', durationMin: 120, itemKind: 'habit' })).toBe(false);
    expect(isRepeatValid({ kind: 'daily', days: [], timeOfDay: '22:00', durationMin: 480, itemKind: 'routine' })).toBe(true);
    expect(endsPastMidnight({ kind: 'daily', days: [], timeOfDay: '23:30', durationMin: 60 })).toBe(true);
  });
  it('an amount is optional; once opened it needs a number (or none)', () => {
    const base = { ...EMPTY_ASK, kind: 'habit' as const, often: 'daily' as const, when: 'any' as const };
    expect(askMissing(base)).toBeNull();
    expect(askMissing({ ...base, amount: { target: 0, unit: '' } })).toBe('Pick how much, or none');
    const eight = { ...base, amount: { target: 8, unit: 'glasses' } };
    expect(askToAnswer(eight)).toEqual({ kind: 'habit', schedule: { kind: 'daily' }, amount: { target: 8, unit: 'glasses' } });
    expect(summary(eight)).toBe('every day, any time, 8 glasses');
    expect(askToAnswer({ ...base, amount: null })).toEqual({ kind: 'habit', schedule: { kind: 'daily' } });
  });
  it('a routine on all five weekdays is saved as weekdays', () => {
    const d = { ...EMPTY_ASK, kind: 'routine' as const, days: [1, 2, 3, 4, 5] as const, timeOfDay: '09:00', durationMin: 480 };
    expect(askToAnswer({ ...d, days: [...d.days] })?.schedule).toEqual({ kind: 'weekdays', timeOfDay: '09:00', durationMin: 480 });
  });
});
