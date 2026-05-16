// Public API — anything outside `src/renderer/analytics/` should import
// from here.

export type {
  AnalyticsEvent,
  AnalyticsResult,
  AnalyticsDataSource,
  BoardLike,
  DayBucket,
  DowBucket,
  HourBucket,
  MonthBucket,
  OpenCounters,
  RangeArg,
  StreakResult,
  Totals,
} from './types';

export { useAnalytics } from './useAnalytics';
export { buildAnalytics } from './engine';
export {
  registerDataSource,
  unregisterDataSource,
  listDataSources,
  clearDataSources,
  collectAllEvents,
} from './registry';
export { lastNDays, yearRange, todayLocal, toYMD } from './dateRange';
export { ActivityStrip } from './charts/ActivityStrip';
export { CalendarHeatmap } from './charts/CalendarHeatmap';
export { DowBars } from './charts/DowBars';
export { HourLine } from './charts/HourLine';
export { MonthBars } from './charts/MonthBars';
export { TotalsPanel } from './charts/TotalsPanel';
