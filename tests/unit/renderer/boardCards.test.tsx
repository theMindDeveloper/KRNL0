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
  it('F2: a habit ticks on today’s square; its week, days and streak', () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 8, 10, 0).getTime(), toFake: ['Date'] });
    seed([{ id: 'h1', name: 'Read', color: 'acid', createdAt: '2026-11-01T00:00:00.000Z', log: ['2026-11-07', '2026-11-06'], schedule: { kind: 'daily' } }]);
    draw('h1');
    expect(screen.getByTestId('habit-lane-root').getAttribute('data-card')).toBe('habit');
    const week = screen.getByTestId('habit-card-week');
    expect(week.children).toHaveLength(7);
    // Sunday the 8th: today is the last square, and it is the button.
    expect(week.children[6]).toBe(screen.getByTestId('habit-card-tick'));
    expect(screen.getByTestId('habit-card-tick').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('every day')).toBeTruthy();
    expect(screen.getByTestId('habit-card-left').textContent).toBe('2 in a row');
  });

  it('F2: an amount adds one on today’s square and shows how far (+1, 3/8)', () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 8, 10, 0).getTime(), toFake: ['Date'] });
    seed([{ id: 'h2', name: 'Water', color: 'cyan', createdAt: '2026-11-01T00:00:00.000Z', log: [], schedule: { kind: 'daily' }, amount: { target: 8, unit: 'glasses' }, counts: { '2026-11-08': 3 } }]);
    draw('h2');
    expect(screen.queryByTestId('habit-card-tick')).toBeNull();
    expect(screen.getByTestId('habit-card-add').textContent).toBe('+13/8');
    expect(screen.getByText('8 glasses a day')).toBeTruthy();
  });

  it('F2: on a day it is not on, today’s square is disabled and the card says when it is next', () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 8, 10, 0).getTime(), toFake: ['Date'] }); // Sun
    seed([{ id: 'h3', name: 'Milk', color: 'acid', createdAt: '2026-11-01T00:00:00.000Z', log: [], schedule: { kind: 'weekly', days: [1] }, amount: { target: 2 } }]);
    draw('h3');
    expect((screen.getByTestId('habit-card-add') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('habit-card-left').textContent).toBe('next: tomorrow');
  });

  it('F3: a repeating event is never ticked; its page shows the next date, its time span and rule', () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 9, 8, 0).getTime(), toFake: ['Date'] }); // Mon 08:00
    seed([{ id: 'e1', name: 'Class', color: 'acid', kind: 'routine', createdAt: '2026-11-01T00:00:00.000Z', log: [], schedule: { kind: 'weekly', days: [1, 3], timeOfDay: '10:00', durationMin: 120 } }]);
    draw('e1');
    expect(screen.getByTestId('habit-lane-root').getAttribute('data-card')).toBe('event');
    expect(screen.queryByTestId('habit-card-tick')).toBeNull();
    expect(screen.getByTestId('event-card-date').textContent).toBe('TODAY9Nov');
    expect(screen.getByTestId('event-card-time').textContent).toBe('10:00 – 12:00');
    expect(screen.getByTestId('habit-card-left').textContent).toBe('Mon Wed · in 2 h');
  });

  it('F3: a weekly event shows the day it is next, not just a time', () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 9, 19, 0).getTime(), toFake: ['Date'] }); // Mon evening
    seed([{ id: 'e2', name: 'Class', color: 'acid', kind: 'routine', createdAt: '2026-11-01T00:00:00.000Z', log: [], schedule: { kind: 'weekly', days: [3], timeOfDay: '17:00', durationMin: 80 } }]);
    draw('e2');
    expect(screen.getByTestId('event-card-date').textContent).toBe('WED11Nov');
    expect(screen.getByTestId('event-card-time').textContent).toBe('17:00 – 18:20');
    expect(screen.getByTestId('habit-card-left').textContent).toBe('Wed · in 2 days');
  });

  it('F6: Skip this one skips that date; Undo skip brings it back', () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 9, 19, 0).getTime(), toFake: ['Date'] });
    seed([{ id: 'e3', name: 'Class', color: 'acid', kind: 'routine', createdAt: '2026-11-01T00:00:00.000Z', log: [], schedule: { kind: 'weekly', days: [3], timeOfDay: '17:00', durationMin: 80 } }]);
    useBoardStore.getState().addNode(card('e3') as never);
    const send = makeCommandHandler('lane-e3');
    send('habit.lane.skip', { date: '2026-11-11' });
    const ex = () => (useBoardStore.getState().board!.nodes.find((n) => n.id === 'mother-habit')!.state as { habits: Array<{ exceptions?: unknown[] }> }).habits[0]!.exceptions;
    expect(ex()).toEqual([{ date: '2026-11-11', skip: true }]);
    send('habit.lane.unskip', { date: '2026-11-11' });
    expect(ex()).toBeUndefined();
  });

  it('F7: habit and event cards have no wire dots (task cards keep theirs)', async () => {
    const { createNodeAdapter } = await import('../../../src/renderer/components/Canvas/rfAdapters');
    seed([{ id: 'h9', name: 'Read', color: 'acid', createdAt: '2026-11-01T00:00:00.000Z', log: [], schedule: { kind: 'daily' } }]);
    const Adapter = createNodeAdapter(HabitLaneNode as never);
    render(<Adapter {...({ id: 'lane-h9', type: 'habit.lane', selected: false, dragging: false, zIndex: 0, isConnectable: true, positionAbsoluteX: 0, positionAbsoluteY: 0,
      data: { node: card('h9'), onCommand: () => {}, onSelect: () => {} } } as never)} />);
    expect(screen.getByTestId('habit-lane-root')).toBeTruthy();
    expect(screen.queryByTestId('rf-handle-target-left')).toBeNull();
    expect(screen.queryByTestId('rf-handle-source-right')).toBeNull();
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
