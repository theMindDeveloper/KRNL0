// @vitest-environment jsdom
/**
 * MonthView — Slice 2 component tests.
 *
 * Covers:
 *   - Renders 6 weeks × 7 days = 42 cells.
 *   - Today cell has the data-today attribute.
 *   - Click on a cell fires onCommand('calendar.selectDate', { date: ymd }).
 *   - Clicking a previously selected cell still calls with the same date
 *     (toggle is in the command handler, not the component).
 *   - Prev/next arrows fire calendar.setAnchor with first day of prev/next month.
 *   - When anchor is 2026-05-15, month label reads "May 2026" and the grid
 *     contains cells from late April through early June (Monday-start fill).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { MonthView } from '../MonthView';
import { useBoardStore } from '../../../../store/boardStore';
import type { CalendarState, CalendarConfig } from '../types';

afterEach(() => {
  cleanup();
  useBoardStore.setState({ board: null });
});

// ── Factories ─────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<CalendarState> = {}): CalendarState {
  return {
    selectedDate: null,
    anchorDate: '2026-05-15',
    ...overrides,
  };
}

function makeConfig(overrides: Partial<CalendarConfig> = {}): CalendarConfig {
  return {
    view: 'month',
    weekStartsOn: 'monday',
    showHabits: true,
    showPomoHeatmap: true,
    hourRange: { start: 6, end: 23 },
    ...overrides,
  };
}

const noop = () => undefined;

// Set the store board with no task nodes (default for most tests).
function setEmptyBoard() {
  useBoardStore.setState({
    board: {
      version: 1,
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [],
      edges: [],
    },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MonthView — grid structure', () => {
  beforeEach(() => setEmptyBoard());

  it('renders exactly 42 day cells (6 weeks × 7 days)', () => {
    render(
      <MonthView
        state={makeState({ anchorDate: '2026-05-15' })}
        config={makeConfig()}
        onCommand={noop}
      />,
    );
    // Each cell has data-testid="month-cell-YYYY-MM-DD"
    const cells = document.querySelectorAll('[data-testid^="month-cell-"]');
    expect(cells).toHaveLength(42);
  });

  it('month label reads "May 2026" when anchor is 2026-05-15', () => {
    render(
      <MonthView
        state={makeState({ anchorDate: '2026-05-15' })}
        config={makeConfig()}
        onCommand={noop}
      />,
    );
    expect(screen.getByTestId('month-label').textContent).toBe('May 2026');
  });

  it('grid contains cells for late April through early June (Monday-start fill)', () => {
    // May 2026: first day is Friday 2026-05-01. Monday-start means the grid
    // starts on 2026-04-27 (Monday of that week). Last row ends on 2026-06-07.
    render(
      <MonthView
        state={makeState({ anchorDate: '2026-05-15' })}
        config={makeConfig()}
        onCommand={noop}
      />,
    );
    // First cell should be 2026-04-27 (Monday before May 1)
    expect(document.querySelector('[data-testid="month-cell-2026-04-27"]')).toBeTruthy();
    // Last cell should be 2026-06-07
    expect(document.querySelector('[data-testid="month-cell-2026-06-07"]')).toBeTruthy();
    // May 1 should be present
    expect(document.querySelector('[data-testid="month-cell-2026-05-01"]')).toBeTruthy();
    // May 31 should be present
    expect(document.querySelector('[data-testid="month-cell-2026-05-31"]')).toBeTruthy();
  });
});

describe('MonthView — today cell', () => {
  it('today cell has data-today="true"', () => {
    // Use a fixed anchor so "today" falls within the month grid.
    // We use a real date — the test just checks that some cell has data-today.
    setEmptyBoard();
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayYMD = `${yyyy}-${mm}-${dd}`;
    // Anchor to the current month so today is visible.
    const anchorDate = `${yyyy}-${mm}-15`;

    render(
      <MonthView
        state={makeState({ anchorDate })}
        config={makeConfig()}
        onCommand={noop}
      />,
    );
    const todayCell = document.querySelector(`[data-testid="month-cell-${todayYMD}"]`);
    expect(todayCell).toBeTruthy();
    expect(todayCell?.getAttribute('data-today')).toBe('true');
  });
});

describe('MonthView — cell click fires calendar.selectDate', () => {
  beforeEach(() => setEmptyBoard());

  it('clicking a cell fires onCommand with the cell date', () => {
    const onCommand = vi.fn();
    render(
      <MonthView
        state={makeState({ anchorDate: '2026-05-15' })}
        config={makeConfig()}
        onCommand={onCommand}
      />,
    );
    const cell = document.querySelector('[data-testid="month-cell-2026-05-10"]');
    expect(cell).toBeTruthy();
    fireEvent.click(cell!);
    expect(onCommand).toHaveBeenCalledWith('calendar.selectDate', { date: '2026-05-10' });
  });

  it('clicking the currently-selected cell still fires onCommand with the same date (toggle is in handler)', () => {
    const onCommand = vi.fn();
    render(
      <MonthView
        state={makeState({ anchorDate: '2026-05-15', selectedDate: '2026-05-10' })}
        config={makeConfig()}
        onCommand={onCommand}
      />,
    );
    const cell = document.querySelector('[data-testid="month-cell-2026-05-10"]');
    expect(cell).toBeTruthy();
    fireEvent.click(cell!);
    // Component always calls with the date; toggle logic lives in the command handler.
    expect(onCommand).toHaveBeenCalledWith('calendar.selectDate', { date: '2026-05-10' });
  });
});

describe('MonthView — navigation arrows', () => {
  beforeEach(() => setEmptyBoard());

  it('prev arrow fires calendar.setAnchor with first day of previous month', () => {
    const onCommand = vi.fn();
    render(
      <MonthView
        state={makeState({ anchorDate: '2026-05-15' })}
        config={makeConfig()}
        onCommand={onCommand}
      />,
    );
    fireEvent.click(screen.getByTestId('month-prev'));
    expect(onCommand).toHaveBeenCalledWith('calendar.setAnchor', { date: '2026-04-01' });
  });

  it('next arrow fires calendar.setAnchor with first day of next month', () => {
    const onCommand = vi.fn();
    render(
      <MonthView
        state={makeState({ anchorDate: '2026-05-15' })}
        config={makeConfig()}
        onCommand={onCommand}
      />,
    );
    fireEvent.click(screen.getByTestId('month-next'));
    expect(onCommand).toHaveBeenCalledWith('calendar.setAnchor', { date: '2026-06-01' });
  });

  it('prev arrow from January navigates to previous year December', () => {
    const onCommand = vi.fn();
    render(
      <MonthView
        state={makeState({ anchorDate: '2026-01-15' })}
        config={makeConfig()}
        onCommand={onCommand}
      />,
    );
    fireEvent.click(screen.getByTestId('month-prev'));
    expect(onCommand).toHaveBeenCalledWith('calendar.setAnchor', { date: '2025-12-01' });
  });

  it('next arrow from December navigates to next year January', () => {
    const onCommand = vi.fn();
    render(
      <MonthView
        state={makeState({ anchorDate: '2026-12-15' })}
        config={makeConfig()}
        onCommand={onCommand}
      />,
    );
    fireEvent.click(screen.getByTestId('month-next'));
    expect(onCommand).toHaveBeenCalledWith('calendar.setAnchor', { date: '2027-01-01' });
  });
});

describe('MonthView — task chips', () => {
  it('renders a task chip for a task scheduled on a visible day', () => {
    useBoardStore.setState({
      board: {
        version: 1,
        schemaVersion: 1,
        savedAt: new Date().toISOString(),
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [
          {
            id: 'task-sched-1',
            kind: 'todo.task',
            position: { x: 0, y: 0 },
            isMother: false,
            state: {
              text: 'Write tests',
              done: false,
              scheduledFor: '2026-05-10T14:00',
              durationMin: 25,
              eta: '~25 min',
              sequenceNumber: 1,
              layer: 0,
              createdAt: '2026-05-01T00:00:00.000Z',
              parentTodoId: 'todo-1',
              parentTaskId: null,
              todoItemId: null,
              pomoSessionsCompleted: 0,
              plannedMin: 25,
              secondsAccumulated: 0,
              currentSessionElapsedSec: 0,
            },
            config: { showDuration: true },
          },
        ],
        edges: [],
      },
    });

    render(
      <MonthView
        state={makeState({ anchorDate: '2026-05-15' })}
        config={makeConfig()}
        onCommand={noop}
      />,
    );

    const cell = document.querySelector('[data-testid="month-cell-2026-05-10"]');
    expect(cell).toBeTruthy();
    // Task chip text should be "Write tests" (under 14 chars, no truncation)
    expect(cell?.textContent).toContain('Write tests');
  });

  it('renders "+N more" when more than 3 tasks are scheduled on same day', () => {
    const makeTask = (id: string, text: string) => ({
      id,
      kind: 'todo.task',
      position: { x: 0, y: 0 },
      isMother: false,
      state: {
        text,
        done: false,
        scheduledFor: '2026-05-10T09:00',
        durationMin: 25,
        eta: '~25 min',
        sequenceNumber: 1,
        layer: 0,
        createdAt: '2026-05-01T00:00:00.000Z',
        parentTodoId: 'todo-1',
        parentTaskId: null,
        todoItemId: null,
        pomoSessionsCompleted: 0,
        plannedMin: 25,
        secondsAccumulated: 0,
        currentSessionElapsedSec: 0,
      },
      config: { showDuration: true },
    });

    useBoardStore.setState({
      board: {
        version: 1,
        schemaVersion: 1,
        savedAt: new Date().toISOString(),
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [
          makeTask('t1', 'Task one'),
          makeTask('t2', 'Task two'),
          makeTask('t3', 'Task three'),
          makeTask('t4', 'Task four'),
          makeTask('t5', 'Task five'),
        ],
        edges: [],
      },
    });

    render(
      <MonthView
        state={makeState({ anchorDate: '2026-05-15' })}
        config={makeConfig()}
        onCommand={noop}
      />,
    );

    const cell = document.querySelector('[data-testid="month-cell-2026-05-10"]');
    expect(cell).toBeTruthy();
    // Should show "+2 more" (5 tasks, max 3 visible)
    expect(cell?.textContent).toContain('+2 more');
  });
});
