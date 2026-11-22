// @vitest-environment jsdom
/**
 * The Calendar's menu button is in its header in every view (owner: it went
 * away in Month and Year, and the header jumped). Month has the Habits layer
 * and the events list; Year has the events list (it opens in the week).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import React from 'react';
import { CalendarNode } from '../index';
import { useBoardStore } from '../../../../store/boardStore';
import type { CalendarConfig, CalendarState } from '../types';

const node = (view: CalendarConfig['view'], layers?: CalendarState['layers']) => ({
  id: 'mother-calendar', kind: 'calendar', isMother: true, position: { x: 0, y: 0 },
  state: { selectedDate: null, anchorDate: '2026-05-11', ...(layers ? { layers } : {}) },
  config: { view, weekStartsOn: 'monday', showHabits: true, showPomoHeatmap: true, hourRange: { start: 0, end: 24 } },
});
const show = (view: CalendarConfig['view'], onCommand = vi.fn(), layers?: CalendarState['layers']) => {
  const n = node(view, layers);
  useBoardStore.setState({ board: { version: 1, schemaVersion: 2, savedAt: '', viewport: { x: 0, y: 0, zoom: 1 }, edges: [], layoutMode: 'canvas', nodes: [n] } as never });
  return render(React.createElement(CalendarNode, { node: n, onCommand } as never));
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-05-12T08:00:00'));
});
afterEach(() => { vi.useRealTimers(); cleanup(); useBoardStore.setState({ board: null }); });

describe('the Calendar menu in every view', () => {
  it('day, week, month and year all have it in the header', () => {
    for (const v of ['day', 'week', 'month', 'year'] as const) {
      const { unmount } = show(v);
      expect(document.querySelectorAll('[data-testid="week-legend"]')).toHaveLength(1);
      unmount();
    }
  });

  it('week: the layers, the events list and zoom', () => {
    show('week');
    fireEvent.click(screen.getByTestId('week-legend'));
    const menu = screen.getByTestId('context-menu').textContent ?? '';
    expect(menu).toContain('Habits');
    expect(menu).toContain('Repeating events');
    expect(menu).toContain('Bigger hours');
  });

  it('month: Habits hides the dots; the events list opens in the week', () => {
    const onCommand = vi.fn();
    show('month', onCommand);
    fireEvent.click(screen.getByTestId('week-legend'));
    const menu = screen.getByTestId('context-menu');
    expect(menu.textContent).toContain('Habits');
    expect(menu.textContent).not.toContain('Bigger hours');
    fireEvent.click(screen.getByText('Habits'));
    expect(onCommand).toHaveBeenCalledWith('calendar.setLayers', { habits: false });
    fireEvent.click(screen.getByTestId('week-legend'));
    fireEvent.click(screen.getByText('Repeating events…'));
    expect(onCommand).toHaveBeenCalledWith('calendar.setView', { view: 'week' });
    cleanup();
    show('week');
    expect(screen.getByTestId('calendar-events-popover')).toBeTruthy();
  });

  it('year: only the events list', () => {
    show('year');
    fireEvent.click(screen.getByTestId('week-legend'));
    const menu = screen.getByTestId('context-menu').textContent ?? '';
    expect(menu).toContain('Repeating events');
    expect(menu).not.toContain('Habits');
  });
});
