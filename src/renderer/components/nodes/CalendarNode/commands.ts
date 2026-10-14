// ADR 0001 — CalendarNode pure command handlers.
// Each handler is pure: (state | config, args) => state | config.
// calendar.schedule is a cross-node router handled in commandDispatch.ts.

import type { CalendarConfig, CalendarState, CalendarView } from './types';
import { CAL_ZOOM_MIN, CAL_ZOOM_MAX } from './types';

// calendar.setView — mutates config.view.
export const calendarSetView = (
  config: CalendarConfig,
  args: { view: CalendarView },
): CalendarConfig => ({ ...config, view: args.view });

// calendar.selectDate — mutates state.selectedDate.
// Passing the currently-selected date clears it (toggle behaviour).
export const calendarSelectDate = (
  state: CalendarState,
  args: { date: string | null },
): CalendarState => {
  const date = args.date ?? null;
  // Toggle: clicking the same date again clears the selection.
  const next = state.selectedDate === date ? null : date;
  return { ...state, selectedDate: next };
};

// calendar.setZoom — set the WeekView ruler zoom (row-height multiplier).
// Clamped to [CAL_ZOOM_MIN, CAL_ZOOM_MAX]; non-finite input is ignored.
export const calendarSetZoom = (
  state: CalendarState,
  args: { zoom: number },
): CalendarState => {
  if (typeof args.zoom !== 'number' || !Number.isFinite(args.zoom)) return state;
  const zoom = Math.min(CAL_ZOOM_MAX, Math.max(CAL_ZOOM_MIN, args.zoom));
  return { ...state, zoom };
};

// calendar.setAnchor — mutates state.anchorDate.
// Used by year-drill-down and week/month navigation arrows.
export const calendarSetAnchor = (
  state: CalendarState,
  args: { date: string },
): CalendarState => ({ ...state, anchorDate: args.date });
