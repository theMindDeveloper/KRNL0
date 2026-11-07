// @vitest-environment jsdom
/**
 * Pen tool, Calendar year view, Clock dial-only, optional task time, month
 * cell chip fitting.
 */
import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { strokePath, strokesHit } from '../../../src/renderer/components/Canvas/DrawLayer';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import { clockSetDialOnly } from '../../../src/renderer/components/nodes/ClockNode/commands';
import { chipsThatFit } from '../../../src/renderer/components/nodes/CalendarNode/MonthView';
import { YearView } from '../../../src/renderer/components/nodes/CalendarNode/YearView';
import { taskSetPlannedMin } from '../../../src/renderer/components/nodes/TaskNode/commands';
import { SysParser } from '../../../src/sys/parser';
import type { Board } from '../../../src/shared/types';
import type { DrawStroke } from '../../../src/shared/types/board';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';
import type { ClockState } from '../../../src/renderer/components/nodes/ClockNode/types';
import type { CalendarState } from '../../../src/renderer/components/nodes/CalendarNode/types';

afterEach(() => { cleanup(); useBoardStore.setState({ board: null, history: [], future: [] }); });

const emptyBoard = (): Board => ({
  version: 1, schemaVersion: 2, savedAt: new Date().toISOString(), layoutMode: 'canvas',
  viewport: { x: 0, y: 0, zoom: 1 }, nodes: [], edges: [],
});

const stroke = (id: string, pts: Array<[number, number]>): DrawStroke => ({
  id, tool: 'pen', color: '#fff', size: 4, createdAt: '', points: pts.map(([x, y]) => [x, y, 0.5]),
});

describe('pen tool', () => {
  it('builds a closed outline path for a stroke', () => {
    const d = strokePath([[0, 0, 0.5], [10, 0, 0.5], [20, 5, 0.5]], 4, 'pen');
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
  });

  it('eraser hits only strokes near the pointer', () => {
    const all = [stroke('a', [[0, 0], [10, 0]]), stroke('b', [[100, 100]])];
    expect(strokesHit(all, 11, 1, 3)).toEqual(['a']);
    expect(strokesHit(all, 50, 50, 3)).toEqual([]);
  });

  it('strokes are added, erased and cleared through the store (undoable)', () => {
    useBoardStore.setState({ board: emptyBoard() });
    const st = useBoardStore.getState();
    st.addStroke(stroke('a', [[0, 0]]));
    st.addStroke(stroke('b', [[5, 5]]));
    expect(useBoardStore.getState().board!.drawings!.map((d) => d.id)).toEqual(['a', 'b']);
    useBoardStore.getState().removeStrokes(['a']);
    expect(useBoardStore.getState().board!.drawings!.map((d) => d.id)).toEqual(['b']);
    useBoardStore.getState().clearDrawings();
    expect(useBoardStore.getState().board!.drawings).toEqual([]);
  });

  it('parses the draw CLI', () => {
    expect(SysParser.parse(['draw', 'list', '--json'])).toMatchObject({ kind: 'draw', sub: 'list', json: true });
    expect(SysParser.parse(['draw', 'clear'])).toMatchObject({ kind: 'draw', sub: 'clear' });
    expect(SysParser.parse(['draw', 'delete', 'stroke-1'])).toMatchObject({ kind: 'draw', sub: 'delete', id: 'stroke-1' });
  });
});

describe('clock dial-only', () => {
  const s: ClockState = { linkedTodoId: null, viewWindow: 0, selectedDate: '2026-11-02' };
  it('toggles and sets explicitly', () => {
    expect(clockSetDialOnly(s, {}).dialOnly).toBe(true);
    expect(clockSetDialOnly({ ...s, dialOnly: true }, {}).dialOnly).toBe(false);
    expect(clockSetDialOnly(s, { on: true }).dialOnly).toBe(true);
  });
  it('parses clock dial', () => {
    expect(SysParser.parse(['clock', 'dial', 'on'])).toMatchObject({ kind: 'clock', sub: 'dial', arg: 'on' });
  });
});

describe('optional task time', () => {
  it('setting a duration closes an open-ended task', () => {
    const open = { plannedMin: 25, durationMin: 25, eta: '~25 min', timeOpen: true } as unknown as TaskState;
    const next = taskSetPlannedMin(open, { minutes: 40 });
    expect(next.timeOpen).toBeUndefined();
    expect(next.plannedMin).toBe(40);
  });
});

describe('month cell chips', () => {
  it('shows only whole chips and keeps a row for +N', () => {
    expect(chipsThatFit(80, 2)).toEqual({ shown: 2, overflow: 0 });
    // One row (18 px) left after the chrome: it goes to "+5", never a chip squeezed over the dots.
    expect(chipsThatFit(60, 5)).toEqual({ shown: 0, overflow: 5 });
    expect(chipsThatFit(78, 5)).toEqual({ shown: 1, overflow: 4 });
    expect(chipsThatFit(30, 5)).toEqual({ shown: 0, overflow: 5 });
  });
});

describe('calendar year view', () => {
  it('renders 12 months and opens a day on click', () => {
    useBoardStore.setState({ board: emptyBoard() });
    const calls: Array<[string, unknown]> = [];
    render(<YearView state={{ selectedDate: null, anchorDate: '2026-11-02' } as CalendarState} onCommand={(c, a) => { calls.push([c, a]); }} />);
    expect(screen.getByTestId('calendar-year-label').textContent).toBe('2026');
    expect(document.querySelectorAll('[data-testid^="calendar-year-month-"]')).toHaveLength(12);
    fireEvent.click(screen.getByTestId('calendar-year-day-2026-03-14'));
    expect(calls).toEqual([['calendar.setAnchor', { date: '2026-03-14' }], ['calendar.setView', { view: 'day' }]]);
  });
  it('parses cal view', () => {
    expect(SysParser.parse(['cal', 'view', 'year'])).toMatchObject({ kind: 'cal', sub: 'view', view: 'year' });
  });
});
