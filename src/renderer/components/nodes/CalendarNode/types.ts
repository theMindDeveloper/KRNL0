// ADR 0001 — CalendarNode state contract.
// Mirrors the hybrid-scheduling design: Calendar owns only its view/navigation
// state; it reads task, habit, and pomo data through direct store selectors.

import { z } from 'zod';
import { toYMD } from '../HabitNode/types';

export type CalendarView = 'week' | 'month' | 'year';

export interface CalendarState {
  selectedDate: string | null; // YYYY-MM-DD (local) — null = no day selected
  anchorDate: string;          // YYYY-MM-DD — controls what week/month/year is in view
}

export interface CalendarConfig {
  view: CalendarView;          // default 'week'
  weekStartsOn: 'monday';      // locked, mirrors HabitConfig
  showHabits: boolean;         // default true
  showPomoHeatmap: boolean;    // default true (mostly relevant in year view)
  hourRange: { start: number; end: number }; // default { start: 6, end: 23 }
}

// Zod schema — state only. Config is plain JSON, healed by the migration layer.
export const CalendarStateSchema = z.object({
  selectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const defaultCalendarState = (): CalendarState => ({
  selectedDate: null,
  anchorDate: toYMD(new Date()),
});

export const defaultCalendarConfig = (): CalendarConfig => ({
  view: 'week',
  weekStartsOn: 'monday',
  showHabits: true,
  showPomoHeatmap: true,
  hourRange: { start: 6, end: 23 },
});
