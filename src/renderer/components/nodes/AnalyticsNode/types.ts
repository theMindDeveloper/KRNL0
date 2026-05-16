// Issue #134 — AnalyticsNode state contract.
//
// The node is a free-floating child (not a mother). It owns view-state only
// — the underlying numbers come from the analytics engine, which reads from
// the board store. Persisting state.rangeDays / state.view lets a saved
// board reopen the dashboard at the user's last setting.

export type AnalyticsView =
  | 'overview'   // totals + activity strip + dow + hour
  | 'calendar'   // year heatmap
  | 'patterns'   // dow + hour + month
  | 'sources';   // raw event stream by source

export const ANALYTICS_VIEWS: readonly AnalyticsView[] = [
  'overview',
  'calendar',
  'patterns',
  'sources',
] as const;

export type AnalyticsMetric = 'taskCount' | 'habitCount' | 'focusMin' | 'sessions';

export interface AnalyticsState {
  view: AnalyticsView;
  /** Lookback window for day-bucket charts. */
  rangeDays: number;
  /** Metric for ActivityStrip + CalendarHeatmap. */
  metric: AnalyticsMetric;
  /** Year for the byMonth chart. Defaults to the current year on render. */
  year?: number;
  /** Persisted size (NodeResizer). */
  width?: number;
  height?: number;
}

export interface AnalyticsConfig {
  /** Reserved — sources opt-out lives here in v1.1 once we add per-source
   *  toggles. v1 has no config. */
  enabledSources?: readonly string[];
}

export const defaultAnalyticsState = (): AnalyticsState => ({
  view: 'overview',
  rangeDays: 30,
  metric: 'taskCount',
  width: 620,
  height: 520,
});

export const defaultAnalyticsConfig = (): AnalyticsConfig => ({});
