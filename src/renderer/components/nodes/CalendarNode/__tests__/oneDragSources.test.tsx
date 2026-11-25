// @vitest-environment jsdom
/**
 * Decision 63 — every source carries through the one drag engine:
 *  - a Todo row (not from its checkbox or buttons, not when done);
 *  - canvas cards: a task, a habit, a repeating or one-time event;
 *  - what each lands as on the week: a habit gets the time, a weekly event
 *    keeps its days and gets the time, a one-time event moves to that date.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { WeekView } from '../WeekView';
import { TodoNode } from '../../TodoNode';
import { defaultTodoConfig, defaultTodoState } from '../../TodoNode/types';
import { todoAdd, todoToggle } from '../../TodoNode/commands';
import { useBoardStore } from '../../../../store/boardStore';
import { setCalendarGhost } from '../DropGhost';
import { registerCalendarSurface, type CalendarSurface } from '../calendarDrag';
import { canvasDragItem } from '../../../Canvas/calendarCarry';
import { carryIn, mockCalendarLayout, pageSurfaceEl, release } from './calendarLayout';
import type { CalendarState, CalendarConfig } from '../types';
import type { Node } from '../../../../../shared/types/node';

const habitCmd = vi.fn(async (_cmd: string, _args: Record<string, unknown>) => undefined);
vi.mock('../../../../store/scheduleActions', async (orig) => ({
  ...(await orig<typeof import('../../../../store/scheduleActions')>()),
  habitMotherCommand: (cmd: string, args: Record<string, unknown>) => habitCmd(cmd, args),
}));

const state: CalendarState = { selectedDate: null, anchorDate: '2026-05-11', zoom: 1 };
const config: CalendarConfig = { view: 'week', weekStartsOn: 'monday', showHabits: true, showPomoHeatmap: true, hourRange: { start: 0, end: 24 } };

const run = { id: 'h-run', name: 'Run', color: 'rust', createdAt: '2026-05-01T00:00:00.000Z', log: [], archived: false, schedule: { kind: 'daily', timeOfDay: '07:00', durationMin: 30 } };
const lecture = { id: 'ev-lecture', name: 'Lecture', color: 'acid', kind: 'routine', createdAt: '2026-05-01T00:00:00.000Z', log: [], archived: false, schedule: { kind: 'weekly', days: [4], timeOfDay: '14:00', durationMin: 90 } };
const dentist = { id: 'ev-dentist', name: 'Dentist', color: 'acid', kind: 'routine', createdAt: '2026-05-01T00:00:00.000Z', log: [], archived: false, startsOn: '2026-05-12', endsOn: '2026-05-12', schedule: { kind: 'weekly', days: [2], timeOfDay: '09:00', durationMin: 60 } };
const standup = { ...lecture, id: 'ev-standup', name: 'Standup', schedule: { kind: 'daily', timeOfDay: '09:00', durationMin: 15 } };

function seed(nodes: unknown[]) {
  useBoardStore.setState({ board: { version: 1, schemaVersion: 2, savedAt: '', viewport: { x: 0, y: 0, zoom: 1 }, nodes: nodes as never, edges: [], layoutMode: 'canvas' } });
}
const habitMother = { id: 'mother-habit', kind: 'habit', isMother: true, position: { x: 0, y: 0 }, config: {}, state: { habits: [run, lecture, dentist, standup] } };
const lane = (habitId: string): Node => ({ id: `lane-${habitId}`, kind: 'habit.lane', isMother: false, position: { x: 0, y: 0 }, config: {}, state: { habitId } } as Node);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-05-10T08:00:00'));
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  setCalendarGhost(null);
  useBoardStore.setState({ board: null });
  habitCmd.mockClear();
  vi.restoreAllMocks();
});

describe('canvas cards as the engine carries them', () => {
  it('a task card, a habit, a weekly, a daily and a one-time event', () => {
    seed([habitMother]);
    const taskNode = { id: 't-1', kind: 'todo.task', isMother: false, position: { x: 0, y: 0 }, config: {}, state: { text: 'Write', plannedMin: 50 } } as unknown as Node;
    expect(canvasDragItem(taskNode)).toMatchObject({ kind: 'task', id: 't-1', lenMin: 50, plannedMin: 50 });
    expect(canvasDragItem(lane('h-run'))).toMatchObject({ kind: 'habit', id: 'h-run', name: 'Run', lenMin: 30, tone: 'var(--rust)' });
    expect(canvasDragItem(lane('ev-lecture'))).toMatchObject({ kind: 'event', repeat: 'weekly', lenMin: 90 });
    expect(canvasDragItem(lane('ev-standup'))).toMatchObject({ kind: 'event', repeat: 'daily' });
    expect(canvasDragItem(lane('ev-dentist'))).toMatchObject({ kind: 'event', repeat: 'once' });
    expect(canvasDragItem(lane('gone'))).toBeNull();
    expect(canvasDragItem({ id: 'x', kind: 'text', isMother: false, position: { x: 0, y: 0 }, config: {}, state: {} } as unknown as Node)).toBeNull();
  });
});

describe('what a carried card lands as on the week', () => {
  const drop = async (habitId: string, x: number, hour: number) => {
    seed([habitMother]);
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const restore = mockCalendarLayout();
    try {
      await act(async () => { await carryIn(canvasDragItem(lane(habitId))!, { x, y: hour * 40 + 1 }); });
    } finally { restore(); }
  };

  it('a habit gets the time it is let go on (its days stay)', async () => {
    await drop('h-run', 250, 18);
    expect(habitCmd).toHaveBeenCalledWith('habit.setSchedule', { habitId: 'h-run', schedule: { kind: 'daily', timeOfDay: '18:00', durationMin: 30 } });
  });

  it('a weekly event gets the time; its days stay', async () => {
    await drop('ev-lecture', 50, 10);
    expect(habitCmd).toHaveBeenCalledWith('habit.setSchedule', { habitId: 'ev-lecture', schedule: { kind: 'weekly', days: [4], timeOfDay: '10:00', durationMin: 90 } });
    expect(habitCmd).not.toHaveBeenCalledWith('routine.setOn', expect.anything());
  });

  it('a one-time event moves to the day and time it is let go on', async () => {
    // Friday 15 May, 16:00.
    await drop('ev-dentist', 450, 16);
    expect(habitCmd).toHaveBeenCalledWith('habit.setSchedule', expect.objectContaining({ habitId: 'ev-dentist', schedule: expect.objectContaining({ timeOfDay: '16:00' }) }));
    expect(habitCmd).toHaveBeenCalledWith('routine.setOn', { id: 'ev-dentist', date: '2026-05-15' });
  });
});

describe('a Todo row starts the one drag', () => {
  const surface = () => {
    const commit = vi.fn<Parameters<CalendarSurface['commit']>, ReturnType<CalendarSurface['commit']>>(() => null);
    const off = registerCalendarSurface({ el: pageSurfaceEl(), slotAt: () => ({ day: '2026-05-12', min: 600 }), gran: () => 15, commit });
    const d = document as unknown as { elementsFromPoint?: ((x: number, y: number) => Element[]) | undefined };
    const before = d.elementsFromPoint;
    d.elementsFromPoint = () => [document.body];
    return { commit, restore: () => { off(); d.elementsFromPoint = before; } };
  };
  const renderTodo = () => {
    let s = defaultTodoState();
    const env = (id: string) => ({ uuid: () => id, now: () => '2026-05-10T07:00:00.000Z' });
    s = todoAdd(s, { text: 'Write report' }, env('row-open'));
    s = todoAdd(s, { text: 'Old one' }, env('row-done'));
    s = todoToggle(s, { id: 'row-done' }, env('x'));
    render(React.createElement(TodoNode, {
      node: { id: 'todo-1', kind: 'todo', position: { x: 0, y: 0 }, isMother: true, state: s, config: defaultTodoConfig() },
      selected: false, onCommand: vi.fn(), onSelect: vi.fn(),
    } as never));
  };
  const carry = async (el: Element) => {
    fireEvent.pointerDown(el, { button: 0, clientX: 10, clientY: 10 });
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 200, clientY: 200 }));
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    await act(async () => { await release(200, 200); });
  };

  it('from the row: carried as a plan of that row (no browser drag)', async () => {
    renderTodo();
    const { commit, restore } = surface();
    try {
      const row = document.querySelector('[data-item-id="row-open"]')!;
      expect(row.getAttribute('draggable')).toBeNull();
      await carry(row.querySelector('.todo-text') ?? row);
      expect(commit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'task', id: 'row-open', itemOnly: true, name: 'Write report' }), expect.objectContaining({ day: '2026-05-12', startMin: 600 }), null, 'move');
    } finally { restore(); }
  });

  it('not from its checkbox', async () => {
    renderTodo();
    const { commit, restore } = surface();
    try {
      const box = document.querySelector('[data-item-id="row-open"] button')!;
      await carry(box);
      expect(commit).not.toHaveBeenCalled();
    } finally { restore(); }
  });
});
