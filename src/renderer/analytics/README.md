# Analytics module

Pluggable data-science engine for KRNL0. Reads every dated signal already in
the board store and exposes it through a single `useAnalytics()` hook plus a
set of pure SVG chart components.

See [`docs/03-architecture/adr-0015-analytics-module.md`](../../../docs/03-architecture/adr-0015-analytics-module.md)
for the architecture rationale.

## Quick start

```tsx
import {
  useAnalytics,
  ActivityStrip,
  lastNDays,
} from '../analytics';

function MyDashboardSurface() {
  const a = useAnalytics();
  const range = lastNDays(30);
  return <ActivityStrip data={a.byDay(range)} metric="taskCount" />;
}
```

## Selector surface

`useAnalytics(): AnalyticsResult` — memoised, returns:

| method                          | shape                                                 |
| ------------------------------- | ----------------------------------------------------- |
| `byDay(range)`                  | `DayBucket[]` — zero-filled across the range          |
| `totals(range)`                 | `{ tasksDone, habitCheckins, focusMin, sessions }`    |
| `streaks()`                     | longest + per-habit                                   |
| `open()`                        | `{ tasksOpen, tasksTotal, sessionsToday, focusMinToday }` |
| `byDayOfWeek(range)`            | 7 buckets, Mon=0 .. Sun=6                              |
| `byHourOfDay(range)`            | 24 buckets                                            |
| `byMonth(year)`                 | 12 buckets                                            |
| `events()`                      | raw merged event stream (for custom consumers/tests)  |

All methods are deterministic and stable across renders for the same args.

## Adding a new data source

```ts
import { registerDataSource } from 'src/renderer/analytics';

registerDataSource({
  id: 'journal',
  label: 'Journal',
  collect(board) {
    const out = [];
    for (const n of board.nodes) {
      if (n.kind !== 'journal') continue;
      // … emit AnalyticsEvent records …
    }
    return out;
  },
});
```

Import the file once during app boot (anywhere reachable from the React tree
before `useAnalytics` is first called). Every chart picks the source up
automatically — no edits to the engine, charts, or hook.

## File layout

```
analytics/
  types.ts            public types
  registry.ts         pluggable data-source registry
  dateRange.ts        pure date helpers
  bucketBy.ts         pure bucketing primitives
  engine.ts           buildAnalytics()
  useAnalytics.ts     React hook (memoised)
  index.ts            public barrel
  sources/
    taskSource.ts
    habitSource.ts
    pomoSource.ts
    index.ts          registerBuiltinSources()
  charts/
    ActivityStrip.tsx
    CalendarHeatmap.tsx
    DowBars.tsx
    HourLine.tsx
    MonthBars.tsx
    TotalsPanel.tsx
    common.ts
  __tests__/
    *.test.ts
```

## AnalyticsNode

`src/renderer/components/nodes/AnalyticsNode/` is the first consumer — a
free-floating child node spawned via keyboard **A** (intentionally not in
the Dock toolbar per Issue #134). Four views:

- **Overview** — totals, activity strip, weekday bars, hour line.
- **Calendar** — heatmap across the lookback window.
- **Patterns** — weekday × hour × month.
- **Sources** — every registered source + per-habit streaks (debug surface).

Range presets: 7 / 30 / 90 / 365 days. Metrics: tasks, habits, focus min,
sessions. State is persisted to `board.json` (range, metric, view, size).
