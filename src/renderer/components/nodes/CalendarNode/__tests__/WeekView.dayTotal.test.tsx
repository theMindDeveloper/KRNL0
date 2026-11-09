// @vitest-environment jsdom
/**
 * The week header's tracked total per day counts only that day's part of a
 * session that runs over midnight (it counted the whole session on both days:
 * Mon read 3h48 in the week, 3h18 in the month).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import React from 'react';
import { WeekView } from '../WeekView';
import { useBoardStore } from '../../../../store/boardStore';
import type { CalendarState, CalendarConfig } from '../types';

const state: CalendarState = { selectedDate: null, anchorDate: '2026-05-11', zoom: 1 };
const config: CalendarConfig = { view: 'week', weekStartsOn: 'monday', showHabits: true, showPomoHeatmap: true, hourRange: { start: 0, end: 24 } };

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    constructor(private cb: ResizeObserverCallback) {}
    observe() { this.cb([{ contentRect: { width: 1400 } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
    unobserve() { /* none */ }
    disconnect() { /* none */ }
  });
  useBoardStore.setState({
    board: {
      version: 1, schemaVersion: 2, savedAt: '', viewport: { x: 0, y: 0, zoom: 1 }, edges: [], layoutMode: 'canvas',
      nodes: [{
        id: 'mother-pomo', kind: 'pomo', isMother: true, position: { x: 0, y: 0 }, config: {},
        state: {
          status: 'idle', startedAt: null, history: [
            // Tue 12 May 23:00 → Wed 13 May 01:00 (local).
            { id: 'late', kind: 'work', completed: true, taskId: null, label: '', startedAt: new Date(2026, 4, 12, 23, 0).toISOString(), endedAt: new Date(2026, 4, 13, 1, 0).toISOString() },
          ],
        },
      }],
    } as never,
  });
});
afterEach(() => { vi.unstubAllGlobals(); cleanup(); useBoardStore.setState({ board: null }); });

describe('week header tracked total', () => {
  it('a session over midnight counts 1h on each day, not 2h on both', () => {
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    expect(screen.getByTestId('week-col-tracked-2026-05-12').textContent).toBe('1h');
    expect(screen.getByTestId('week-col-tracked-2026-05-13').textContent).toBe('1h');
  });
});
