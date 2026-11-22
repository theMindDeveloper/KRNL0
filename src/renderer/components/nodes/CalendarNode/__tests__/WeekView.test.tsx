// @vitest-environment jsdom
/**
 * WeekView — Slice 3 component tests.
 *
 * Covers:
 *   - Renders correct row count for default hourRange (18 rows).
 *   - Renders 7 day columns with Mon-Sun labels.
 *   - Today's column has the data-today-col attribute on its header.
 *   - Prev/next arrows dispatch calendar.setAnchor with anchorDate ±7 days.
 *   - Drop on a cell with valid application/krnl-task payload fires task.setSchedule.
 *   - Drop with non-matching MIME does nothing.
 *   - Empty state hint visible when no tasks; hidden when at least one scheduled.
 *   - Out-of-range task (scheduled at 03:00 with default start=6) renders at row 0
 *     with up-caret badge.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import React from 'react';
import { WeekView } from '../WeekView';
import { useBoardStore } from '../../../../store/boardStore';
import type { CalendarState, CalendarConfig } from '../types';
import { beginCalendarDrag } from '../calendarDrag';
import { carryIn, mockCalendarLayout, planItem } from './calendarLayout';

afterEach(() => {
  cleanup();
  useBoardStore.setState({ board: null });
});

// ── Factories ─────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<CalendarState> = {}): CalendarState {
  return {
    selectedDate: null,
    // 2026-05-11 is a Monday — use it as a stable test anchor.
    anchorDate: '2026-05-11',
    // Pixel assertions below are written for 1× (28px/hour); the product
    // default is 2× (see WeekView).
    zoom: 1,
    ...overrides,
  };
}

function makeConfig(overrides: Partial<CalendarConfig> = {}): CalendarConfig {
  return {
    view: 'week',
    weekStartsOn: 'monday',
    showHabits: true,
    showPomoHeatmap: true,
    hourRange: { start: 6, end: 23 },
    ...overrides,
  };
}

const noop = () => undefined;

// Helper: click the weekly or daily card in the HabitSwapModal (pre-selects kind).
function pickSwapOption(kind: 'weekly' | 'daily') {
  const testId = kind === 'weekly' ? 'habit-swap-weekly' : 'habit-swap-daily';
  const btn = document.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
  if (!btn) throw new Error(`${testId} button not found in DOM`);
  fireEvent.click(btn);
}

// Helper: set the duration input value in the HabitSwapModal, then click confirm.
// The time input keeps its default value (derived from drop hour).
function confirmSwapModal(durationMin: number) {
  const durationInput = document.querySelector(
    '[data-testid="habit-swap-duration-input"]',
  ) as HTMLInputElement | null;
  if (!durationInput) throw new Error('habit-swap-duration-input not found in DOM');
  fireEvent.change(durationInput, { target: { value: String(durationMin) } });

  const confirmBtn = document.querySelector(
    '[data-testid="habit-swap-confirm"]',
  ) as HTMLButtonElement | null;
  if (!confirmBtn) throw new Error('habit-swap-confirm button not found in DOM');
  fireEvent.click(confirmBtn);
}

function setEmptyBoard() {
  useBoardStore.setState({
    board: {
      version: 1,
      schemaVersion: 2,
      savedAt: new Date().toISOString(),
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [],
      edges: [],
      layoutMode: 'canvas',
    },
  });
}

// Make a minimal habit-mother node for the board store.
function makeHabitNode(
  id: string,
  habits: Array<{
    id: string;
    name: string;
    color?: string;
    schedule?: {
      kind: 'daily' | 'weekly' | 'weekdays';
      timeOfDay: string;
      days?: number[];
    };
  }>,
) {
  return {
    id,
    kind: 'habit',
    position: { x: 0, y: 0 },
    isMother: true,
    state: {
      habits: habits.map((h) => ({
        id: h.id,
        name: h.name,
        createdAt: '2026-01-01T00:00:00.000Z',
        log: [],
        archived: false,
        color: h.color ?? 'acid',
        ...(h.schedule ? { schedule: h.schedule } : {}),
      })),
    },
    config: { weekStartsOn: 'monday', view: 'week' },
  };
}

function makeTask(id: string, scheduledFor: string, plannedMin = 25) {
  return {
    id,
    kind: 'todo.task',
    position: { x: 0, y: 0 },
    isMother: false,
    state: {
      text: `Task ${id}`,
      done: false,
      scheduledFor,
      durationMin: plannedMin,
      eta: `~${plannedMin} min`,
      sequenceNumber: 1,
      layer: 0,
      createdAt: '2026-05-01T00:00:00.000Z',
      parentTodoId: 'todo-1',
      parentTaskId: null,
      todoItemId: null,
      pomoSessionsCompleted: 0,
      plannedMin,
      secondsAccumulated: 0,
      currentSessionElapsedSec: 0,
      kind: 'event' as const,
    },
    config: { showDuration: true },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WeekView — row count', () => {
  beforeEach(() => setEmptyBoard());

  it('always renders 24 hour rows regardless of persisted hourRange (PR #122)', () => {
    render(
      <WeekView
        state={makeState()}
        config={makeConfig()}
        onCommand={noop}
      />,
    );
    // PR #122: WeekView ignores persisted hourRange and always renders 0..23.
    const rows = document.querySelectorAll('[data-testid^="week-cell-2026-05-11-"]');
    expect(rows).toHaveLength(24);
  });

  it('still renders 24 rows even when hourRange config is narrowed (PR #122)', () => {
    render(
      <WeekView
        state={makeState()}
        config={makeConfig({ hourRange: { start: 8, end: 18 } })}
        onCommand={noop}
      />,
    );
    // PR #122: hourRange config is intentionally ignored — 24 rows always.
    const rows = document.querySelectorAll('[data-testid^="week-cell-2026-05-11-"]');
    expect(rows).toHaveLength(24);
  });
});

describe('WeekView — 7 day columns', () => {
  beforeEach(() => setEmptyBoard());

  it('renders 7 day column headers', () => {
    render(
      <WeekView
        state={makeState({ anchorDate: '2026-05-11' })}
        config={makeConfig()}
        onCommand={noop}
      />,
    );
    // Anchor 2026-05-11 is Monday; week is May 11-17.
    expect(document.querySelector('[data-testid="week-col-header-2026-05-11"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="week-col-header-2026-05-12"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="week-col-header-2026-05-13"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="week-col-header-2026-05-14"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="week-col-header-2026-05-15"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="week-col-header-2026-05-16"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="week-col-header-2026-05-17"]')).toBeTruthy();
  });

  it('renders columns with Mon-Sun label prefixes', () => {
    render(
      <WeekView
        state={makeState({ anchorDate: '2026-05-11' })}
        config={makeConfig()}
        onCommand={noop}
      />,
    );
    // Each header should contain its day label.
    const monHeader = document.querySelector('[data-testid="week-col-header-2026-05-11"]');
    expect(monHeader?.textContent).toMatch(/MON/i);
    const sunHeader = document.querySelector('[data-testid="week-col-header-2026-05-17"]');
    expect(sunHeader?.textContent).toMatch(/SUN/i);
  });
});

describe('WeekView — today column', () => {
  it('today column header has data-today-col="true"', () => {
    setEmptyBoard();
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const todayYMD = `${y}-${m}-${d}`;

    // Build the Monday of this week.
    const dayOfWeek = today.getDay(); // 0=Sun
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diff);
    const mondayYMD = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;

    render(
      <WeekView
        state={makeState({ anchorDate: mondayYMD })}
        config={makeConfig()}
        onCommand={noop}
      />,
    );

    const todayHeader = document.querySelector(
      `[data-testid="week-col-header-${todayYMD}"]`,
    );
    expect(todayHeader).toBeTruthy();
    expect(todayHeader?.getAttribute('data-today-col')).toBe('true');
  });
});

describe('WeekView — navigation arrows', () => {
  beforeEach(() => setEmptyBoard());

  it('prev arrow fires calendar.setAnchor with anchor minus 7 days', () => {
    const onCommand = vi.fn();
    render(
      <WeekView
        state={makeState({ anchorDate: '2026-05-11' })}
        config={makeConfig()}
        onCommand={onCommand}
      />,
    );
    fireEvent.click(screen.getByTestId('week-prev'));
    expect(onCommand).toHaveBeenCalledWith('calendar.setAnchor', { date: '2026-05-04' });
  });

  it('next arrow fires calendar.setAnchor with anchor plus 7 days', () => {
    const onCommand = vi.fn();
    render(
      <WeekView
        state={makeState({ anchorDate: '2026-05-11' })}
        config={makeConfig()}
        onCommand={onCommand}
      />,
    );
    fireEvent.click(screen.getByTestId('week-next'));
    expect(onCommand).toHaveBeenCalledWith('calendar.setAnchor', { date: '2026-05-18' });
  });
});

describe('WeekView — drop to schedule', () => {
  beforeEach(() => setEmptyBoard());

  it('a plan carried in (Decision 63) fires calendar.schedule with the time it is let go on', async () => {
    const onCommand = vi.fn();
    render(
      <WeekView
        state={makeState({ anchorDate: '2026-05-11' })}
        config={makeConfig()}
        onCommand={onCommand}
      />,
    );
    const restore = mockCalendarLayout();
    try {
      // Tuesday (2026-05-12) is the 2nd column; 14:00.
      await act(async () => { await carryIn(planItem('task-abc', 50), { x: 150, y: 14 * 40 + 5 }); });
      expect(onCommand).toHaveBeenCalledWith('calendar.schedule', {
        taskId: 'task-abc',
        scheduledFor: '2026-05-12T14:00',
        scheduledDurationMin: 50,
      });
    } finally { restore(); }
  });

  it('a Todo row with no task yet fires calendar.schedule with its itemId', async () => {
    const onCommand = vi.fn();
    render(
      <WeekView
        state={makeState({ anchorDate: '2026-05-11' })}
        config={makeConfig()}
        onCommand={onCommand}
      />,
    );
    const restore = mockCalendarLayout();
    try {
      await act(async () => { await carryIn(planItem('item-1', 25, { itemOnly: true }), { x: 150, y: 9 * 40 + 5 }); });
      expect(onCommand).toHaveBeenCalledWith('calendar.schedule', {
        itemId: 'item-1',
        scheduledFor: '2026-05-12T09:00',
        scheduledDurationMin: 25,
      });
    } finally { restore(); }
  });

  it('drop with non-matching MIME type does nothing', () => {
    const onCommand = vi.fn();
    render(
      <WeekView
        state={makeState({ anchorDate: '2026-05-11' })}
        config={makeConfig()}
        onCommand={onCommand}
      />,
    );
    const cell = document.querySelector(
      '[data-testid="week-cell-2026-05-12-14"]',
    );
    expect(cell).toBeTruthy();

    fireEvent.drop(cell!, {
      dataTransfer: {
        getData: (_type: string) => '',
        types: ['text/plain'],
      },
    });

    expect(onCommand).not.toHaveBeenCalled();
  });

});

describe('WeekView — empty state hint', () => {
  it('an empty week shows no overlay, and the ANY TIME strip is always there (Decision 40)', () => {
    setEmptyBoard();
    render(
      <WeekView
        state={makeState({ anchorDate: '2026-05-11' })}
        config={makeConfig()}
        onCommand={noop}
      />,
    );
    expect(screen.queryByTestId('week-empty-hint')).toBeNull();
    expect(screen.getByTestId('calendar-day-only-row')).toBeTruthy();
  });

  it('hides empty-state hint when at least one task is scheduled in the week', () => {
    useBoardStore.setState({
      board: {
        version: 1,
        schemaVersion: 2,
        savedAt: new Date().toISOString(),
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [makeTask('t1', '2026-05-14T10:00')],
        edges: [],
        layoutMode: 'canvas',
      },
    });

    render(
      <WeekView
        state={makeState({ anchorDate: '2026-05-11' })}
        config={makeConfig()}
        onCommand={noop}
      />,
    );
    expect(screen.queryByTestId('week-empty-hint')).toBeNull();
  });
});

describe('WeekView — early-morning task (PR #122 24h grid)', () => {
  it('task scheduled at 03:00 renders inline at its actual minute (no clipping, no caret)', () => {
    // PR #122 forces 24h: a 03:00 task is just rendered in the row for hour 3.
    useBoardStore.setState({
      board: {
        version: 1,
        schemaVersion: 2,
        savedAt: new Date().toISOString(),
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [makeTask('early-task', '2026-05-14T03:00')],
        edges: [],
        layoutMode: 'canvas',
      },
    });

    render(
      <WeekView
        state={makeState({ anchorDate: '2026-05-11' })}
        config={makeConfig()}
        onCommand={noop}
      />,
    );

    const block = document.querySelector('[data-testid="task-block-early-task"]');
    expect(block).toBeTruthy();
    // No continuation arrow on a single-day, head slice.
    expect(block?.textContent ?? '').not.toContain('↑');
    // Row height is 28px and the task starts at hour 3 → top = 3 * 28 = 84px.
    const style = (block as HTMLElement)?.style;
    // On its start line (the gap between stacked blocks is at the bottom).
    expect(style?.top).toBe('84px');
  });
});

// ── ADR 0002 A1 — Habit drag-to-schedule (WeekView) ──────────────────────────
// A1 binding: HabitSwapModal opens on DROP (not dragover). Cell context = drop cell.

describe('WeekView — a habit from the Habit window: letting go opens the swap card (A1, Decision 63)', () => {
  // Anchor: 2026-05-11 (Monday). Columns (jsdom layout, calendarLayout.ts):
  // Mon 05-11 x 0-100, Tue 100-200, Wed 200-300, Thu 300-400. One hour = 40 px.
  const seedHabits = () => useBoardStore.setState({
    board: {
      version: 1, schemaVersion: 2, savedAt: new Date().toISOString(), viewport: { x: 0, y: 0, zoom: 1 }, edges: [], layoutMode: 'canvas',
      nodes: [makeHabitNode('hm1', [
        { id: 'h1', name: 'Run', color: 'acid' }, { id: 'h2', name: 'Yoga', color: 'cyan' },
        { id: 'h3', name: 'Swim', color: 'acid' },
      ])],
    } as never,
  });
  const habitItem = (id: string, name: string) => ({ kind: 'habit' as const, id, name, tone: 'var(--acid)', lenMin: 30, choose: true });
  let restore: () => void = () => undefined;
  beforeEach(() => { seedHabits(); });
  afterEach(() => restore());

  const show = (onCommand = vi.fn()) => {
    render(<WeekView state={makeState({ anchorDate: '2026-05-11' })} config={makeConfig()} onCommand={onCommand} />);
    restore = mockCalendarLayout();
    return onCommand;
  };

  it('moving over the hours does not open it; letting go does, and daily schedules it there', async () => {
    const onCommand = show();
    beginCalendarDrag({ clientX: -50, clientY: -50, button: 0 }, { item: habitItem('h1', 'Run') });
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 50, clientY: 9 * 40 + 5 }));
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    expect(document.querySelector('[data-testid="habit-swap-modal"]')).toBeNull();
    // Let go on Wednesday 09:00.
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 250, clientY: 9 * 40 + 5 }));
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    act(() => {
      window.dispatchEvent(new MouseEvent('pointerup', { clientX: 250, clientY: 9 * 40 + 5 }));
      // The browser's click that follows a release (the engine swallows it).
      window.dispatchEvent(new MouseEvent('click', { clientX: 250, clientY: 9 * 40 + 5 }));
    });
    expect(document.querySelector('[data-testid="habit-swap-modal"]')).toBeTruthy();
    act(() => { pickSwapOption('daily'); });
    act(() => { confirmSwapModal(30); });
    expect(onCommand).toHaveBeenCalledWith('calendar.scheduleHabit', {
      habitId: 'h1',
      habitMotherId: 'hm1',
      schedule: { kind: 'daily', timeOfDay: '09:00', durationMin: 30 },
    });
  });

  it('weekly uses the day it was let go on (Thursday 07:00 is ISO day 4)', async () => {
    const onCommand = show();
    await act(async () => { await carryIn(habitItem('h2', 'Yoga'), { x: 350, y: 7 * 40 + 5 }); });
    expect(document.querySelector('[data-testid="habit-swap-modal"]')).toBeTruthy();
    act(() => { pickSwapOption('weekly'); });
    act(() => { confirmSwapModal(45); });
    expect(onCommand).toHaveBeenCalledWith('calendar.scheduleHabit', {
      habitId: 'h2',
      habitMotherId: 'hm1',
      schedule: { kind: 'weekly', timeOfDay: '07:00', days: [4], durationMin: 45 },
    });
  });

  it('the day and time are where it is let go, whatever it passed on the way', async () => {
    const onCommand = show();
    beginCalendarDrag({ clientX: -50, clientY: -50, button: 0 }, { item: habitItem('h3', 'Swim') });
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 50, clientY: 9 * 40 + 5 }));
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 250, clientY: 14 * 40 + 5 }));
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    act(() => {
      window.dispatchEvent(new MouseEvent('pointerup', { clientX: 250, clientY: 14 * 40 + 5 }));
      // The browser's click that follows a release (the engine swallows it).
      window.dispatchEvent(new MouseEvent('click', { clientX: 250, clientY: 14 * 40 + 5 }));
    });
    act(() => { pickSwapOption('weekly'); });
    act(() => { confirmSwapModal(15); });
    expect(onCommand).toHaveBeenCalledWith('calendar.scheduleHabit', {
      habitId: 'h3',
      habitMotherId: 'hm1',
      schedule: { kind: 'weekly', timeOfDay: '14:00', days: [3], durationMin: 15 }, // Wednesday
    });
  });
});

describe('WeekView — habit block visualisation', () => {
  // Anchor 2026-05-11 (Monday). Week Mon–Sun = 05-11 … 05-17.
  // 2026-05-13 = Wednesday = ISO dow 3.

  it('daily habit block renders in all 7 day columns', () => {
    useBoardStore.setState({
      board: {
        version: 1,
        schemaVersion: 2,
        savedAt: new Date().toISOString(),
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [
          makeHabitNode('hm1', [
            { id: 'h1', name: 'Run', color: 'acid', schedule: { kind: 'daily', timeOfDay: '08:00' } },
          ]),
        ],
        edges: [],
        layoutMode: 'canvas',
      },
    });

    render(
      <WeekView
        state={makeState({ anchorDate: '2026-05-11' })}
        config={makeConfig()}
        onCommand={noop}
      />,
    );

    // All 7 days of the week should have a habit block for h1.
    const weekDays = ['2026-05-11', '2026-05-12', '2026-05-13', '2026-05-14', '2026-05-15', '2026-05-16', '2026-05-17'];
    for (const day of weekDays) {
      const block = document.querySelector(`[data-testid="habit-block-h1-${day}"]`);
      expect(block, `Expected habit block in column ${day}`).toBeTruthy();
    }
  });

  it('weekly habit block renders only in the matching weekday column', () => {
    // Schedule on Wednesday (ISO dow 3 = days:[3]).
    useBoardStore.setState({
      board: {
        version: 1,
        schemaVersion: 2,
        savedAt: new Date().toISOString(),
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [
          makeHabitNode('hm1', [
            {
              id: 'h2',
              name: 'Yoga',
              color: 'cyan',
              schedule: { kind: 'weekly', timeOfDay: '07:00', days: [3] },
            },
          ]),
        ],
        edges: [],
        layoutMode: 'canvas',
      },
    });

    render(
      <WeekView
        state={makeState({ anchorDate: '2026-05-11' })}
        config={makeConfig()}
        onCommand={noop}
      />,
    );

    // Wednesday column should have the block.
    expect(document.querySelector('[data-testid="habit-block-h2-2026-05-13"]')).toBeTruthy();

    // All other columns should not have the block.
    const nonWedDays = ['2026-05-11', '2026-05-12', '2026-05-14', '2026-05-15', '2026-05-16', '2026-05-17'];
    for (const day of nonWedDays) {
      expect(
        document.querySelector(`[data-testid="habit-block-h2-${day}"]`),
        `Expected NO habit block in column ${day}`,
      ).toBeNull();
    }
  });
});

// ── #6 / #7 — overlap disambiguation + reality info ────────────────────────────

function makePomoWithHistory(id: string, startISO: string, endISO: string, kind: 'work' | 'break' = 'work') {
  return {
    id,
    kind: 'pomo',
    position: { x: 0, y: 0 },
    isMother: true,
    state: {
      status: 'idle',
      startedAt: null,
      activeTaskId: null,
      label: '',
      history: [
        { id: 'seg-1', startedAt: startISO, endedAt: endISO, durationMin: 25, completed: true, kind, label: '' },
      ],
    },
    config: {},
  };
}

function boardWith(nodes: unknown[]) {
  useBoardStore.setState({
    board: {
      version: 1,
      schemaVersion: 2,
      savedAt: new Date().toISOString(),
      viewport: { x: 0, y: 0, zoom: 1 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nodes: nodes as any,
      edges: [],
      layoutMode: 'canvas',
    },
  });
}

describe('WeekView — overlap disambiguation (#6/#7)', () => {
  // Decision 58 — recorded time is not drawn or clickable on the Calendar (the Clock keeps its popup).
  it.skip('right-click where a task and a tracked-reality segment overlap opens the layer picker', () => {
    // Both span 09:00–09:25 on Monday 2026-05-11.
    boardWith([
      makeTask('task-a', '2026-05-11T09:00', 25),
      makePomoWithHistory('mother-pomo', '2026-05-11T09:00:00', '2026-05-11T09:25:00'),
    ]);
    render(<WeekView state={makeState({ anchorDate: '2026-05-11' })} config={makeConfig()} onCommand={noop} />);

    const col = document.querySelector('[data-testid="week-col-2026-05-11"]') as HTMLElement;
    // rowHeight = 28 (zoom 1); minute 540 (09:00) → clientY 252.
    fireEvent.contextMenu(col, { clientY: 252, clientX: 6 });

    const menu = document.querySelector('[data-testid="calendar-layer-menu"]');
    expect(menu).toBeTruthy();
    expect(document.querySelector('[data-testid="calendar-layer-item-task"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="calendar-layer-item-reality"]')).toBeTruthy();
  });

  // Decision 58 — recorded time is not drawn or clickable on the Calendar (the Clock keeps its popup).
  it.skip('picking the reality item shows the tracked-reality info popup with start/end', () => {
    boardWith([
      makePomoWithHistory('mother-pomo', '2026-05-11T09:00:00', '2026-05-11T09:25:00'),
    ]);
    render(<WeekView state={makeState({ anchorDate: '2026-05-11' })} config={makeConfig()} onCommand={noop} />);

    const col = document.querySelector('[data-testid="week-col-2026-05-11"]') as HTMLElement;
    // Right-click on recorded time opens the same popup as a left click (#207).
    fireEvent.contextMenu(col, { clientY: 252, clientX: 6 });

    const popup = document.querySelector('[data-testid="calendar-reality-popup"]');
    expect(popup).toBeTruthy();
    expect(popup?.textContent).toMatch(/09:00/);
    expect(popup?.textContent).toMatch(/09:25/);
    expect(popup?.textContent).toMatch(/25 min/);
  });
});

describe('WeekView — delete tracked-reality segment (#12)', () => {
  // Decision 58 — recorded time is not drawn or clickable on the Calendar (the Clock keeps its popup).
  it.skip('delete button removes the segment from the pomo history (and thus analytics)', () => {
    boardWith([
      makePomoWithHistory('mother-pomo', '2026-05-11T09:00:00', '2026-05-11T09:25:00'),
    ]);
    render(<WeekView state={makeState({ anchorDate: '2026-05-11' })} config={makeConfig()} onCommand={noop} />);

    const col = document.querySelector('[data-testid="week-col-2026-05-11"]') as HTMLElement;
    fireEvent.contextMenu(col, { clientY: 252, clientX: 6 });

    // Right-click menu → Delete segment.
    const del = screen.getByRole('button', { name: 'Delete segment' });
    act(() => { fireEvent.click(del); });

    const pomo = useBoardStore.getState().board!.nodes.find((n) => n.kind === 'pomo')!;
    expect((pomo.state as { history: unknown[] }).history).toEqual([]);
  });
});

// ── #203 — left-click a recorded span opens its details ───────────────────────

describe('WeekView — left-click on a recorded span (#203)', () => {
  // Decision 58 — recorded time is not drawn or clickable on the Calendar (the Clock keeps its popup).
  it.skip('a left click on a tracked span opens the details popup', () => {
    boardWith([
      makePomoWithHistory('mother-pomo', '2026-05-11T09:00:00', '2026-05-11T09:25:00'),
    ]);
    render(<WeekView state={makeState({ anchorDate: '2026-05-11' })} config={makeConfig()} onCommand={noop} />);

    const col = document.querySelector('[data-testid="week-col-2026-05-11"]') as HTMLElement;
    fireEvent.click(col, { clientY: 252, clientX: 6 });

    const popup = document.querySelector('[data-testid="calendar-reality-popup"]');
    expect(popup).toBeTruthy();
    expect(popup?.textContent).toMatch(/09:25/);
  });

  // Decision 58 — recorded time is not drawn or clickable on the Calendar (the Clock keeps its popup).
  it.skip('a click in the day beside the line, at a recorded time, opens nothing — only the line itself does', () => {
    boardWith([
      makePomoWithHistory('mother-pomo', '2026-05-11T09:00:00', '2026-05-11T09:25:00'),
    ]);
    render(<WeekView state={makeState({ anchorDate: '2026-05-11' })} config={makeConfig()} onCommand={noop} />);

    const col = document.querySelector('[data-testid="week-col-2026-05-11"]') as HTMLElement;
    fireEvent.click(col, { clientY: 252, clientX: 100 });
    expect(document.querySelector('[data-testid="calendar-reality-popup"]')).toBeNull();
    fireEvent.click(col, { clientY: 252, clientX: 6 });
    expect(document.querySelector('[data-testid="calendar-reality-popup"]')).toBeTruthy();
  });

  it('a left click on empty grid opens nothing', () => {
    boardWith([
      makePomoWithHistory('mother-pomo', '2026-05-11T09:00:00', '2026-05-11T09:25:00'),
    ]);
    render(<WeekView state={makeState({ anchorDate: '2026-05-11' })} config={makeConfig()} onCommand={noop} />);

    const col = document.querySelector('[data-testid="week-col-2026-05-11"]') as HTMLElement;
    fireEvent.click(col, { clientY: 28 * 14, clientX: 100 }); // 14:00 — nothing there
    expect(document.querySelector('[data-testid="calendar-reality-popup"]')).toBeNull();
  });

  // Decision 58 — recorded time is not drawn or clickable on the Calendar (the Clock keeps its popup).
  it.skip('a left click where two spans overlap opens the picker, and a row opens its details', () => {
    const pomo = makePomoWithHistory('mother-pomo', '2026-05-11T09:00:00', '2026-05-11T09:25:00');
    (pomo.state.history as unknown[]).push(
      { id: 'seg-2', startedAt: '2026-05-11T09:05:00', endedAt: '2026-05-11T09:20:00', durationMin: 15, completed: false, kind: 'work', label: '' },
    );
    boardWith([pomo]);
    render(<WeekView state={makeState({ anchorDate: '2026-05-11' })} config={makeConfig()} onCommand={noop} />);

    const col = document.querySelector('[data-testid="week-col-2026-05-11"]') as HTMLElement;
    fireEvent.click(col, { clientY: 252 + 5, clientX: 6 }); // ≈ 09:10
    const rows = document.querySelectorAll('[data-testid="calendar-layer-item-reality"]');
    expect(rows.length).toBe(2);
    fireEvent.click(rows[0]!);
    expect(document.querySelector('[data-testid="calendar-reality-popup"]')).toBeTruthy();
  });
});

// ── #204 — a tagged span names its task everywhere ────────────────────────────

describe('WeekView — tagged span shows its task (#204)', () => {
  function taggedPomo(taskId: string, label: string) {
    const pomo = makePomoWithHistory('mother-pomo', '2026-05-11T09:00:00', '2026-05-11T09:25:00');
    const rec = pomo.state.history[0] as Record<string, unknown>;
    rec['taskId'] = taskId;
    rec['label'] = label;
    return pomo;
  }

  // Decision 58 — recorded time is not on the Calendar any more (the Clock shows it).
  it.skip('the band, the popup title and the menu header name the task — even once it is done', () => {
    const task = makeTask('task-a', '2026-05-12T09:00', 25);
    (task.state as Record<string, unknown>)['done'] = true;
    (task.state as Record<string, unknown>)['completedAt'] = '2026-05-11T09:25:00';
    boardWith([task, taggedPomo('task-a', 'Task task-a')]);
    render(<WeekView state={makeState({ anchorDate: '2026-05-11' })} config={makeConfig()} onCommand={noop} />);

    const band = document.querySelector('[data-testid="calendar-reality-block"]');
    expect(band?.getAttribute('data-reality-task')).toBe('Task task-a');

    const col = document.querySelector('[data-testid="week-col-2026-05-11"]') as HTMLElement;
    // One popup for left and right click (#207): title and "Counts toward" name the task.
    fireEvent.contextMenu(col, { clientY: 252, clientX: 6 });
    const popup = document.querySelector('[data-testid="calendar-reality-popup"]');
    expect(popup?.textContent).toMatch(/Task task-a/);
    expect(document.querySelector('[data-testid="calendar-reality-retag"]')?.textContent).toMatch(/Task task-a/);
  });

  // Decision 58 — recorded time is not drawn or clickable on the Calendar (the Clock keeps its popup).
  it.skip('a span whose task was deleted still names it (orphan option)', () => {
    boardWith([taggedPomo('task-gone', 'build cluster')]);
    render(<WeekView state={makeState({ anchorDate: '2026-05-11' })} config={makeConfig()} onCommand={noop} />);

    const col = document.querySelector('[data-testid="week-col-2026-05-11"]') as HTMLElement;
    fireEvent.click(col, { clientY: 252, clientX: 6 });
    const popup = document.querySelector('[data-testid="calendar-reality-popup"]');
    expect(popup?.textContent).toMatch(/build cluster/);
    expect(document.querySelector('[data-testid="calendar-reality-retag"]')?.textContent).toMatch(/build cluster \(deleted\)/);
  });
});
