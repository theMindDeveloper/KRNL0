// @vitest-environment jsdom
/**
 * The hour pager (calendar-clock-visuals F15) lives in the corner above the
 * time gutter — it used to float over the grid's bottom-right and covered
 * Sunday's plans there.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import React from 'react';
import { WeekView } from '../WeekView';
import { useBoardStore } from '../../../../store/boardStore';
import type { CalendarState, CalendarConfig } from '../types';

const state: CalendarState = { selectedDate: null, anchorDate: '2026-05-11', zoom: 1 };
const config: CalendarConfig = { view: 'week', weekStartsOn: 'monday', showHabits: true, showPomoHeatmap: true, hourRange: { start: 0, end: 24 } };

let heightSpy: { mockRestore: () => void } | null = null;

beforeEach(() => {
  useBoardStore.setState({
    board: { version: 1, schemaVersion: 2, savedAt: new Date().toISOString(), viewport: { x: 0, y: 0, zoom: 1 }, nodes: [], edges: [], layoutMode: 'canvas' },
  } as never);
  // A short calendar: only a few hours fit, so the hours page.
  heightSpy = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(240);
  vi.stubGlobal('ResizeObserver', class { observe() { /* none */ } unobserve() { /* none */ } disconnect() { /* none */ } });
});
afterEach(() => {
  heightSpy?.mockRestore();
  vi.unstubAllGlobals();
  cleanup();
  useBoardStore.setState({ board: null });
});

describe('WeekView hour pager', () => {
  it('sits in the header corner above the time gutter, not over the grid', () => {
    render(<WeekView state={state} config={config} onCommand={() => undefined} />);
    const pager = screen.getByTestId('calendar-hour-pager');
    // Same row as the day headers: its next sibling is the first day header.
    expect(pager.nextElementSibling).toBeTruthy();
    expect(pager.style.position).not.toBe('absolute');
    const later = pager.querySelector('button[title="Later hours"]') as HTMLButtonElement;
    const earlier = pager.querySelector('button[title="Earlier hours"]') as HTMLButtonElement;
    expect(later).toBeTruthy();
    expect(earlier).toBeTruthy();
    const before = later.getAttribute('aria-label');
    if (!later.disabled) {
      fireEvent.click(later);
      expect((screen.getByTestId('calendar-hour-pager').querySelector('button[title="Later hours"]') as HTMLButtonElement).getAttribute('aria-label')).not.toBe(before);
    }
  });
});
