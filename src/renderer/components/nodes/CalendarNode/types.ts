// ADR 0001 — CalendarNode state contract.
// Mirrors the hybrid-scheduling design: Calendar owns only its view/navigation
// state; it reads task, habit, and pomo data through direct store selectors.

import { z } from 'zod';
import { toYMD } from '../HabitNode/types';

export type CalendarView = 'week' | 'month' | 'year';

export interface CalendarState {
  selectedDate: string | null; // YYYY-MM-DD (local) — null = no day selected
  anchorDate: string;          // YYYY-MM-DD — controls what week/month/year is in view
  // Ruler zoom for WeekView — a row-height multiplier. 1 = default 28px/hour;
  // higher values stretch the grid so pomo/task blocks are easier to read and
  // the gutter shows :30 / :15 sub-marks. Clamped to [CAL_ZOOM_MIN, CAL_ZOOM_MAX].
  zoom?: number;
}

export const CAL_ZOOM_MIN = 1;
export const CAL_ZOOM_MAX = 6;
export const CAL_ZOOM_STEP = 0.5;

export interface CalendarConfig {
  view: CalendarView;          // default 'week'
  weekStartsOn: 'monday';      // locked, mirrors HabitConfig
  showHabits: boolean;         // default true
  showPomoHeatmap: boolean;    // default true (mostly relevant in year view)
  hourRange: { start: number; end: number }; // default { start: 0, end: 23 }
}

// Zod schema — state only. Config is plain JSON, healed by the migration layer.
export const CalendarStateSchema = z.object({
  selectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  zoom: z.number().min(CAL_ZOOM_MIN).max(CAL_ZOOM_MAX).optional(),
});

export const defaultCalendarState = (): CalendarState => ({
  selectedDate: null,
  anchorDate: toYMD(new Date()),
  zoom: 1,
});

export const defaultCalendarConfig = (): CalendarConfig => ({
  view: 'week',
  weekStartsOn: 'monday',
  showHabits: true,
  showPomoHeatmap: true,
  hourRange: { start: 0, end: 23 },
});
