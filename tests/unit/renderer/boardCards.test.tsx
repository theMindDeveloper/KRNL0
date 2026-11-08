// @vitest-environment jsdom
/** Decision 42 — board cards for habits and repeating events (board-cards.md F1–F5). */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { HabitLaneNode } from '../../../src/renderer/components/nodes/HabitLaneNode';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import { makeCommandHandler } from '../../../src/renderer/components/Canvas/commandDispatch';
import type { Board } from '../../../src/shared/types';

vi.mock('../../../src/renderer/store/eventLog', async (orig) => ({ ...(await orig<object>()), saveBoard: vi.fn(async () => {}) }));

afterEach(() => { cleanup(); vi.useRealTimers(); });

type H = Record<string, unknown>;
function seed(habits: H[]) {
  useBoardStore.getState().setBoard({
    version: 1, savedAt: '', viewport: { x: 0, y: 0, zoom: 1 }, edges: [], layoutMode: 'station',
    nodes: [{ id: 'mother-habit', kind: 'habit', isMother: true, position: { x: 0, y: 0 }, config: {}, state: { habits } }],
  } as unknown as Board);
}
const card = (habitId: string) => ({ id: `lane-${habitId}`, kind: 'habit.lane', isMother: false, position: { x: 0, y: 0 }, state: { habitId }, config: { days: 28 } });
const draw = (habitId: string) => render(<HabitLaneNode node={card(habitId) as never} selected={false} onCommand={() => {}} onSelect={() => {}} />);
const lanes = () => (useBoardStore.getState().board?.nodes ?? []).filter((n) => n.kind === 'habit.lane');

describe('the card (F1–F3)', () => {
  it('F2: a habit has a tick box, its days and time, its week and streak', () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 8, 10, 0).getTime(), toFake: ['Date'] });
    seed([{ id: 'h1', name: 'Read', color: 'acid', createdAt: '2026-11-01T00:00:00.000Z', log: ['2026-11-07', '2026-11-06'], schedule: { kind: 'daily' } }]);
    draw('h1');
    expect(screen.getByTestId('habit-lane-root').getAttribute('data-card')).toBe('habit');
    expect(screen.getByTestId('habit-card-tick')).toBeTruthy();
    expect(screen.getByText('every day')).toBeTruthy();
    expect(screen.getByTestId('habit-card-week').children).toHaveLength(7);
    expect(screen.getByTestId('habit-card-left').textContent).toBe('2 days in a row');
  });

  it('F2: an amount counts up instead of a tick', () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 8, 10, 0).getTime(), toFake: ['Date'] });
    seed([{ id: 'h2', name: 'Water', color: 'cyan', createdAt: '2026-11-01T00:00:00.000Z', log: [], schedule: { kind: 'daily' }, amount: { target: 8, unit: 'glasses' }, counts: { '2026-11-08': 3 } }]);
    draw('h2');
    expect(screen.queryByTestId('habit-card-tick')).toBeNull();
    expect(screen.getByTestId('habit-card-add').textContent).toBe('3');
    expect(screen.getByText('3 of 8 glasses today')).toBeTruthy();
  });

  it('F3: a repeating event is never ticked and says when it is next', () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 9, 8, 0).getTime(), toFake: ['Date'] }); // Mon 08:00
    seed([{ id: 'e1', name: 'Class', color: 'acid', kind: 'routine', createdAt: '2026-11-01T00:00:00.000Z', log: [], schedule: { kind: 'weekly', days: [1, 3], timeOfDay: '10:00', durationMin: 120 } }]);
    draw('e1');
    expect(screen.getByTestId('habit-lane-root').getAttribute('data-card')).toBe('event');
    expect(screen.queryByTestId('habit-card-tick')).toBeNull();
    expect(screen.getByText(/Mon Wed · 10:00/)).toBeTruthy();
    expect(screen.getByTestId('habit-card-left').textContent).toBe('Today 10:00');
  });
});

describe('cards appear on their own (F4)', () => {
  it('adding a habit or an event puts exactly one card on the board', () => {
    seed([]);
    const send = makeCommandHandler('mother-habit');
    send('habit.add', { name: 'Read' });
    expect(lanes()).toHaveLength(1);
    send('habit.add', { name: 'Class', kind: 'routine', schedule: { kind: 'weekly', days: [1], timeOfDay: '10:00', durationMin: 60 } });
    expect(lanes()).toHaveLength(2);
    const habits = (useBoardStore.getState().board!.nodes.find((n) => n.id === 'mother-habit')!.state as { habits: Array<{ id: string }> }).habits;
    expect(lanes().map((n) => (n.state as { habitId: string }).habitId).sort()).toEqual(habits.map((h) => h.id).sort());
  });
  it('F5: deleting a habit takes its card off the board', () => {
    seed([]);
    const send = makeCommandHandler('mother-habit');
    send('habit.add', { name: 'Read' });
    const id = (lanes()[0]!.state as { habitId: string }).habitId;
    send('habit.remove', { id });
    expect(lanes()).toHaveLength(0);
  });
});
