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
  | 'insights'   // multivariate (scatter, donut, correlations) — added 2026-05-18
  | 'sources';   // raw event stream by source

export const ANALYTICS_VIEWS: readonly AnalyticsView[] = [
  'overview',
  'calendar',
  'patterns',
  'insights',
  'sources',
] as const;

export type AnalyticsMetric = 'taskCount' | 'habitCount' | 'focusMin' | 'sessions';

// Stable IDs for every chart card the node may render. Persisted in
// state.hiddenCards (per-card visibility) and state.pinnedCards (ordering /
// emphasis), so the dashboard remembers the user's curation across reloads.
// Renaming an ID is a migration — keep them stable.
export type AnalyticsCardId =
  // overview
  | 'overview.kpis'
  | 'overview.totals'
  | 'overview.activity'
  | 'overview.dowHour'
  | 'overview.dow'
  | 'overview.hour'
  // calendar
  | 'calendar.heatmap'
  // patterns
  | 'patterns.dow'
  | 'patterns.hour'
  | 'patterns.month'
  | 'patterns.cumulative'
  // insights (multivariate)
  | 'insights.radar'
  | 'insights.donutSessionsByDay'
  | 'insights.donutSources'
  | 'insights.scatterTasksFocus'
  | 'insights.scatterHabitFocus'
  | 'insights.stacked'
  | 'insights.histogramFocus'
  | 'insights.histogramTasks'
  // sources
  | 'sources.list'
  | 'sources.streaks';

export const ANALYTICS_CARD_LABELS: Record<AnalyticsCardId, string> = {
  'overview.kpis':                'KPI tiles',
  'overview.totals':              'Totals',
  'overview.activity':            'Activity strip',
  'overview.dowHour':             'Weekday × hour heatmap',
  'overview.dow':                 'By weekday',
  'overview.hour':                'By hour',
  'calendar.heatmap':             'Year heatmap',
  'patterns.dow':                 'Weekday pattern',
  'patterns.hour':                'Hour pattern',
  'patterns.month':               'Month pattern',
  'patterns.cumulative':          'Cumulative trajectories',
  'insights.radar':               'Multivariate radar',
  'insights.donutSessionsByDay':  'Focus by weekday (donut)',
  'insights.donutSources':        'Sources split (pie)',
  'insights.scatterTasksFocus':   'Tasks × focus (scatter)',
  'insights.scatterHabitFocus':   'Habits × focus (scatter)',
  'insights.stacked':             'Daily mix (stacked)',
  'insights.histogramFocus':      'Focus distribution',
  'insights.histogramTasks':      'Tasks distribution',
  'sources.list':                 'Registered sources',
  'sources.streaks':              'Habit streaks',
};

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
  /** Cards the user has hidden via the settings gear. Stable IDs. */
  hiddenCards?: readonly AnalyticsCardId[];
  /** Cards the user has pinned (sorted to top of their view). Order matters. */
  pinnedCards?: readonly AnalyticsCardId[];
  /** When true, every ChartCard reveals its hide/pin toggles in-place so the
   *  user can curate without a separate modal. */
  settingsOpen?: boolean;
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
  width: 720,
  height: 600,
  hiddenCards: [],
  pinnedCards: [],
  settingsOpen: false,
});

export const defaultAnalyticsConfig = (): AnalyticsConfig => ({});
