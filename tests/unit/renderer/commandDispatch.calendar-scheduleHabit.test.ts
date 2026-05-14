/**
 * commandDispatch calendar.scheduleHabit router test — ADR 0002 §5.
 *
 * Verifies that dispatching 'calendar.scheduleHabit' from a CalendarNode finds
 * the habit mother node by ID and mutates the correct habit's schedule via
 * habitSetSchedule, then persists.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import { makeCommandHandler } from '../../../src/renderer/components/Canvas/commandDispatch';
import type { HabitState } from '../../../src/renderer/components/nodes/HabitNode/types';
import type { CalendarState, CalendarConfig } from '../../../src/renderer/components/nodes/CalendarNode/types';

beforeEach(() => {
  // @ts-expect-error — jsdom doesn't have krnl
  globalThis.window = globalThis.window ?? {};
  // @ts-expect-error
  globalThis.window.krnl = { boardSave: vi.fn().mockResolvedValue(undefined) };
  useBoardStore.setState({ board: null, viewport: { x: 0, y: 0, zoom: 1 } });
});

function makeHabitState(): HabitState {
  return {
    habits: [
      {
        id: 'habit-aaa',
        name: 'Meditate',
        createdAt: '2026-05-01T00:00:00.000Z',
        log: [],
        archived: false,
        color: 'acid',
      },
    ],
  };
}

function makeCalendarState(): CalendarState {
  return { selectedDate: null, anchorDate: '2026-05-12' };
}

function makeCalendarConfig(): CalendarConfig {
  return {
    view: 'week',
    weekStartsOn: 'monday',
    showHabits: true,
    showPomoHeatmap: true,
    hourRange: { start: 6, end: 23 },
  };
}

function setupBoard(calendarId: string, habitMotherId: string) {
  const board = {
    version: 1,
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: calendarId,
        kind: 'calendar' as const,
        position: { x: 0, y: 0 },
        isMother: true,
        state: makeCalendarState(),
        config: makeCalendarConfig(),
      },
      {
        id: habitMotherId,
        kind: 'habit' as const,
        position: { x: 400, y: 0 },
        isMother: true,
        state: makeHabitState(),
        config: { weekStartsOn: 'monday' as const, view: 'week' as const },
      },
    ],
    edges: [],
  };
  useBoardStore.setState({ board });
}

describe('calendar.scheduleHabit cross-node router', () => {
  it('routes to the habit mother and sets the schedule', () => {
    const calId = 'cal-001';
    const habId = 'hab-001';
    setupBoard(calId, habId);

    const handler = makeCommandHandler(calId);
    handler('calendar.scheduleHabit', {
      habitId: 'habit-aaa',
      habitMotherId: habId,
      schedule: { kind: 'daily', timeOfDay: '08:00' },
    });

    const { board } = useBoardStore.getState();
    const habitMother = board?.nodes.find((n) => n.id === habId);
    const habitState = habitMother?.state as HabitState;
    const habit = habitState?.habits.find((h) => h.id === 'habit-aaa');
    expect(habit?.schedule).toEqual({ kind: 'daily', timeOfDay: '08:00' });
  });

  it('routes weekly schedule with normalised days', () => {
    const calId = 'cal-002';
    const habId = 'hab-002';
    setupBoard(calId, habId);

    const handler = makeCommandHandler(calId);
    handler('calendar.scheduleHabit', {
      habitId: 'habit-aaa',
      habitMotherId: habId,
      schedule: { kind: 'weekly', timeOfDay: '07:00', days: [3, 1, 3] },
    });

    const { board } = useBoardStore.getState();
    const habitMother = board?.nodes.find((n) => n.id === habId);
    const habitState = habitMother?.state as HabitState;
    const habit = habitState?.habits.find((h) => h.id === 'habit-aaa');
    expect(habit?.schedule).toEqual({ kind: 'weekly', timeOfDay: '07:00', days: [1, 3] });
  });

  it('no-op when habitMotherId not found', () => {
    const calId = 'cal-003';
    const habId = 'hab-003';
    setupBoard(calId, habId);

    const boardBefore = useBoardStore.getState().board;
    const handler = makeCommandHandler(calId);
    handler('calendar.scheduleHabit', {
      habitId: 'habit-aaa',
      habitMotherId: 'nonexistent',
      schedule: { kind: 'daily', timeOfDay: '08:00' },
    });

    const { board } = useBoardStore.getState();
    // Board should be unchanged.
    expect(board).toEqual(boardBefore);
  });

  it('persists board after scheduling', () => {
    const calId = 'cal-004';
    const habId = 'hab-004';
    setupBoard(calId, habId);

    const handler = makeCommandHandler(calId);
    handler('calendar.scheduleHabit', {
      habitId: 'habit-aaa',
      habitMotherId: habId,
      schedule: { kind: 'weekdays', timeOfDay: '06:30' },
    });

    // @ts-expect-error
    expect(window.krnl.boardSave).toHaveBeenCalled();
  });

  it('no-op when schedule is missing from args', () => {
    const calId = 'cal-005';
    const habId = 'hab-005';
    setupBoard(calId, habId);

    const boardBefore = useBoardStore.getState().board;
    const handler = makeCommandHandler(calId);
    handler('calendar.scheduleHabit', {
      habitId: 'habit-aaa',
      habitMotherId: habId,
      // schedule intentionally omitted
    });

    const { board } = useBoardStore.getState();
    expect(board).toEqual(boardBefore);
  });
});
