// Pure FSM commands for the AnalyticsNode. Mutations route through onCommand
// like every other node so undo/redo, board persistence, and replay work.

import type { AnalyticsConfig, AnalyticsMetric, AnalyticsState, AnalyticsView } from './types';
import { ANALYTICS_VIEWS } from './types';

export const analyticsSetView = (
  state: AnalyticsState,
  args: { view: AnalyticsView },
): AnalyticsState => {
  if (!ANALYTICS_VIEWS.includes(args.view)) return state;
  if (state.view === args.view) return state;
  return { ...state, view: args.view };
};

export const analyticsSetRangeDays = (
  state: AnalyticsState,
  args: { days: number },
): AnalyticsState => {
  if (!Number.isFinite(args.days)) return state;
  const days = Math.max(1, Math.min(365, Math.round(args.days)));
  if (days === state.rangeDays) return state;
  return { ...state, rangeDays: days };
};

export const analyticsSetMetric = (
  state: AnalyticsState,
  args: { metric: AnalyticsMetric },
): AnalyticsState => {
  if (state.metric === args.metric) return state;
  return { ...state, metric: args.metric };
};

export const analyticsSetYear = (
  state: AnalyticsState,
  args: { year: number },
): AnalyticsState => {
  if (!Number.isFinite(args.year)) return state;
  const y = Math.round(args.year);
  if (y === state.year) return state;
  return { ...state, year: y };
};

export const analyticsSetSize = (
  state: AnalyticsState,
  args: { width: number; height: number },
): AnalyticsState => {
  const w = Math.max(360, Math.round(args.width));
  const h = Math.max(280, Math.round(args.height));
  if (w === state.width && h === state.height) return state;
  return { ...state, width: w, height: h };
};

export type AnalyticsCommand =
  | 'analytics.setView'
  | 'analytics.setRangeDays'
  | 'analytics.setMetric'
  | 'analytics.setYear'
  | 'analytics.setSize';

export const ANALYTICS_COMMANDS: readonly AnalyticsCommand[] = [
  'analytics.setView',
  'analytics.setRangeDays',
  'analytics.setMetric',
  'analytics.setYear',
  'analytics.setSize',
] as const;

// Re-export configs for parity with other node modules.
export type { AnalyticsConfig };
