import { describe, it, expect } from 'vitest';
import {
  calendarSelectDate,
  calendarSetAnchor,
  calendarSetView,
  calendarSetZoom,
} from '../../../src/renderer/components/nodes/CalendarNode/commands';
import { CAL_ZOOM_MIN, CAL_ZOOM_MAX } from '../../../src/renderer/components/nodes/CalendarNode/types';
import type { CalendarState, CalendarConfig } from '../../../src/renderer/components/nodes/CalendarNode/types';
import { defaultCalendarConfig } from '../../../src/renderer/components/nodes/CalendarNode/types';

function makeState(overrides: Partial<CalendarState> = {}): CalendarState {
  return {
    selectedDate: null,
    anchorDate: '2026-05-14',
    ...overrides,
  };
}

describe('calendarSelectDate — toggle behaviour', () => {
  it('sets selectedDate when none is selected', () => {
    const result = calendarSelectDate(makeState({ selectedDate: null }), { date: '2026-05-10' });
    expect(result.selectedDate).toBe('2026-05-10');
  });

  it('clears selectedDate when the same date is passed (toggle)', () => {
    const result = calendarSelectDate(makeState({ selectedDate: '2026-05-10' }), { date: '2026-05-10' });
    expect(result.selectedDate).toBeNull();
  });

  it('replaces selectedDate when a different date is passed', () => {
    const result = calendarSelectDate(makeState({ selectedDate: '2026-05-10' }), { date: '2026-05-15' });
    expect(result.selectedDate).toBe('2026-05-15');
  });

  it('handles null date arg (clears selection)', () => {
    const result = calendarSelectDate(makeState({ selectedDate: '2026-05-10' }), { date: null });
    // state.selectedDate ('2026-05-10') !== null, so toggle does NOT fire — result is null
    expect(result.selectedDate).toBeNull();
  });

  it('does not mutate the original state', () => {
    const original = makeState({ selectedDate: '2026-05-01' });
    calendarSelectDate(original, { date: '2026-05-01' });
    expect(original.selectedDate).toBe('2026-05-01');
  });

  it('preserves anchorDate when toggling selectedDate', () => {
    const result = calendarSelectDate(
      makeState({ anchorDate: '2026-05-14', selectedDate: null }),
      { date: '2026-05-10' },
    );
    expect(result.anchorDate).toBe('2026-05-14');
  });
});

describe('calendarSetAnchor', () => {
  it('updates anchorDate', () => {
    const result = calendarSetAnchor(makeState({ anchorDate: '2026-05-14' }), { date: '2026-06-01' });
    expect(result.anchorDate).toBe('2026-06-01');
  });

  it('does not affect selectedDate', () => {
    const result = calendarSetAnchor(
      makeState({ anchorDate: '2026-05-14', selectedDate: '2026-05-10' }),
      { date: '2026-06-01' },
    );
    expect(result.selectedDate).toBe('2026-05-10');
  });

  it('does not mutate original state', () => {
    const original = makeState({ anchorDate: '2026-05-14' });
    calendarSetAnchor(original, { date: '2026-06-01' });
    expect(original.anchorDate).toBe('2026-05-14');
  });
});

describe('calendarSetZoom', () => {
  it('sets a zoom within range', () => {
    expect(calendarSetZoom(makeState(), { zoom: 2.5 }).zoom).toBe(2.5);
  });

  it('clamps below min and above max', () => {
    expect(calendarSetZoom(makeState(), { zoom: 0.1 }).zoom).toBe(CAL_ZOOM_MIN);
    expect(calendarSetZoom(makeState(), { zoom: 999 }).zoom).toBe(CAL_ZOOM_MAX);
  });

  it('ignores non-finite input (returns state unchanged)', () => {
    const s = makeState({ zoom: 2 });
    expect(calendarSetZoom(s, { zoom: NaN }).zoom).toBe(2);
  });

  it('does not mutate original state', () => {
    const original = makeState({ zoom: 1 });
    calendarSetZoom(original, { zoom: 3 });
    expect(original.zoom).toBe(1);
  });
});

describe('calendarSetView', () => {
  it('sets view to week', () => {
    const config = defaultCalendarConfig() as CalendarConfig;
    const result = calendarSetView(config, { view: 'week' });
    expect(result.view).toBe('week');
  });

  it('sets view to year', () => {
    const config = defaultCalendarConfig() as CalendarConfig;
    const result = calendarSetView(config, { view: 'year' });
    expect(result.view).toBe('year');
  });

  it('keeps view as month', () => {
    const config = defaultCalendarConfig() as CalendarConfig;
    const result = calendarSetView(config, { view: 'month' });
    expect(result.view).toBe('month');
  });

  it('does not mutate original config', () => {
    const config = defaultCalendarConfig() as CalendarConfig;
    const originalView = config.view;
    calendarSetView(config, { view: 'week' });
    expect(config.view).toBe(originalView);
  });
});
