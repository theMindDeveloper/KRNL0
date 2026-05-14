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
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { WeekView } from '../WeekView';
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
    // 2026-05-11 is a Monday — use it as a stable test anchor.
    anchorDate: '2026-05-11',
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
    },
    config: { showDuration: true },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WeekView — row count', () => {
  beforeEach(() => setEmptyBoard());

  it('renders 18 hour rows for default hourRange {start:6, end:23}', () => {
    render(
      <WeekView
        state={makeState()}
        config={makeConfig()}
        onCommand={noop}
      />,
    );
    // One row per hour: 6,7,...,23 → 18 rows per column.
    // We check via data-testid pattern for a single column (2026-05-11 = Monday).
    const rows = document.querySelectorAll('[data-testid^="week-cell-2026-05-11-"]');
    expect(rows).toHaveLength(18);
  });

  it('row count formula: end - start + 1, not off-by-one', () => {
    render(
      <WeekView
        state={makeState()}
        config={makeConfig({ hourRange: { start: 8, end: 18 } })}
        onCommand={noop}
      />,
    );
    // 8..18 inclusive = 11 rows
    const rows = document.querySelectorAll('[data-testid^="week-cell-2026-05-11-"]');
    expect(rows).toHaveLength(11);
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

  it('drop with valid krnl-task payload fires task.setSchedule with correct scheduledFor', () => {
    const onCommand = vi.fn();
    render(
      <WeekView
        state={makeState({ anchorDate: '2026-05-11' })}
        config={makeConfig()}
        onCommand={onCommand}
      />,
    );
    // Cell for Tuesday (2026-05-12) at 14:00
    const cell = document.querySelector(
      '[data-testid="week-cell-2026-05-12-14"]',
    );
    expect(cell).toBeTruthy();

    const payload = JSON.stringify({ taskId: 'task-abc', durationMin: 50 });
    fireEvent.drop(cell!, {
      dataTransfer: {
        getData: (type: string) => (type === 'application/krnl-task' ? payload : ''),
        types: ['application/krnl-task'],
      },
    });

    expect(onCommand).toHaveBeenCalledWith('task.setSchedule', {
      taskId: 'task-abc',
      scheduledFor: '2026-05-12T14:00',
      scheduledDurationMin: 50,
    });
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

  it('drop with only itemId (no taskId) does nothing in v1', () => {
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

    const payload = JSON.stringify({ itemId: 'item-xyz', durationMin: 25 });
    fireEvent.drop(cell!, {
      dataTransfer: {
        getData: (type: string) => (type === 'application/krnl-task' ? payload : ''),
        types: ['application/krnl-task'],
      },
    });

    expect(onCommand).not.toHaveBeenCalled();
  });
});

describe('WeekView — empty state hint', () => {
  it('shows empty-state hint when no tasks are scheduled this week', () => {
    setEmptyBoard();
    render(
      <WeekView
        state={makeState({ anchorDate: '2026-05-11' })}
        config={makeConfig()}
        onCommand={noop}
      />,
    );
    expect(screen.getByTestId('week-empty-hint')).toBeTruthy();
  });

  it('hides empty-state hint when at least one task is scheduled in the week', () => {
    useBoardStore.setState({
      board: {
        version: 1,
        schemaVersion: 1,
        savedAt: new Date().toISOString(),
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [makeTask('t1', '2026-05-14T10:00')],
        edges: [],
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

describe('WeekView — out-of-range task', () => {
  it('task scheduled before hourRange renders task block with up-caret badge', () => {
    // Task at 03:00, hourRange starts at 06:00 → out of range (before).
    useBoardStore.setState({
      board: {
        version: 1,
        schemaVersion: 1,
        savedAt: new Date().toISOString(),
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [makeTask('early-task', '2026-05-14T03:00')],
        edges: [],
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
    // Should have the up-caret badge text.
    expect(block?.textContent).toContain('↑');
    // Block should be positioned at top (row 0): top = 0.
    const style = (block as HTMLElement)?.style;
    expect(style?.top).toBe('0px');
  });
});
