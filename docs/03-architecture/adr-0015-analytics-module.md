# ADR-0015 — Analytics module: pluggable selectors + AnalyticsNode

**Date:** 2026-05-16
**Status:** Accepted
**Author:** backend
**Supersedes:** none. **Extends:** Decision 11 (HabitNode log), Decision 22 (PomoSessionRecord history), ADR 0001 (Calendar integration).
**Tracks:** [Issue #134](https://github.com/theMindDeveloper/KRNL0/issues/134).

---

## 1. Context

Three mother nodes already accumulate dated audit data: TodoNode/TaskNode (completion), HabitNode (per-day log), PomoNode (session history). None of it surfaces in the UI today. The KRNL Dock displays hardcoded numbers; users have no way to see weekly patterns, streaks, or focus minutes. Issue #134 specifies a selector layer plus chart components; the user requirement on top is that the module be a **standalone data-science engine** other nodes can plug into.

Two things must not happen:

1. Selectors hardcoded against TaskNode/HabitNode/PomoNode. Every new node that emits dated data would force edits to the analytics module.
2. A second source of truth (e.g. an event log). Analytics must read the same state the rest of the app already persists, so nothing can desync.

---

## 2. Decision

**Pluggable data-source registry.** The engine knows nothing about concrete node types. Each source is a pure function `collect(board) -> AnalyticsEvent[]` that registers itself once:

```ts
registerDataSource({ id: 'task', label: 'Tasks', collect(board) { … } });
```

Built-in sources (`task`, `habit`, `pomo`) live under `src/renderer/analytics/sources/` and self-register on first import of the hook. Future nodes (e.g. a journal node) ship their own source file alongside the node code and call `registerDataSource` — no edits to the engine, charts, or hook.

**Single event shape.** All sources emit `AnalyticsEvent`:

```ts
interface AnalyticsEvent {
  source: string;            // 'task', 'habit', 'pomo'
  type: string;              // 'task.completed', 'habit.checkin', 'pomo.session'
  date: string;              // YYYY-MM-DD local
  isoTimestamp?: string;
  durationMin?: number;
  metadata?: Record<string, unknown>;
}
```

Selectors aggregate by `type` — never by `source`. A new source emitting `task.completed` automatically flows into every existing chart.

**Pure engine, React-only hook.** `buildAnalytics(board)` is pure and synchronous; `useAnalytics()` wraps it in `useMemo` keyed on `board.nodes` + `board.edges`. The dock's per-second tick must not invalidate the memo — Issue #134 §"Memoization rules".

**Charts are props-only React components.** No store coupling. They accept the relevant selector output and render `<svg>` directly (project pattern — no chart lib).

**AnalyticsNode** is a free-floating child node (not a mother). It owns view-state (`view`, `rangeDays`, `metric`, `year`, size) and renders the dashboard via the engine. Spawned via keyboard `A` from the Dock event listener; intentionally **not** rendered as a Dock button (Issue #134: "for now make it a normal child floating node and not in the dock").

---

## 3. Schema additions

- `TaskState.completedAt?: string` — populated by `stampCompletedAt(prev, next, ctx)` in `src/shared/dispatch/task.ts` whenever a task transitions `done: false → true`; cleared on `true → false`. Wired at every toggle site:
  - `taskToggleMirror` (shared dispatch)
  - `commandDispatch.ts` task.toggle branch (renderer)
  - `commandDispatch.ts` todo.toggle → TaskNode mirror branch (renderer)
  - `sys/commands/task.ts` taskToggle (CLI)

  Legacy `done: true` rows without `completedAt` are silently excluded from dated buckets — they appear in `tasksTotal` but not in `byDay`. Documented in `taskSource.collect`.

- `NodeKind` adds `'analytics'`.

---

## 4. File layout

```
src/renderer/analytics/
  types.ts                    public types (AnalyticsEvent, DayBucket, AnalyticsDataSource, …)
  registry.ts                 register/list/collectAllEvents
  dateRange.ts                pure date helpers (toYMD, eachDay, lastNDays, dowOf, …)
  bucketBy.ts                 pure bucketing primitives
  engine.ts                   buildAnalytics() — composes sources + bucketers
  useAnalytics.ts             memoised React hook
  index.ts                    public barrel
  sources/
    taskSource.ts             todo.task → task.completed
    habitSource.ts            habit.log → habit.checkin (+ calcHabitStreak)
    pomoSource.ts             pomo.history → pomo.session
    index.ts                  registerBuiltinSources()
  charts/
    ActivityStrip.tsx
    CalendarHeatmap.tsx
    DowBars.tsx
    HourLine.tsx
    MonthBars.tsx
    TotalsPanel.tsx
    common.ts                 shared color tokens
  __tests__/
    dateRange.test.ts
    bucketBy.test.ts
    registry.test.ts
    sources.test.ts
    engine.test.ts
    analyticsCommands.test.ts
    stampCompletedAt.test.ts

src/renderer/components/nodes/AnalyticsNode/
  index.tsx                   the node component
  types.ts                    AnalyticsState, AnalyticsConfig, default factories
  commands.ts                 pure FSM: setView / setRangeDays / setMetric / setYear / setSize
```

---

## 5. Out of scope (v1, intentional)

- Multi-year longitudinal views (current year only on `byMonth`).
- Correlation analysis ("habit X correlates with focus minutes") — needs a stats helper. Hold for v1.1.
- Export to CSV / JSON. Hold.
- Filtering by tag / project. No tags exist yet.
- A "Wire ActivityStrip into KrnlDockChrome" step from the issue. The Dock today (`Dock/index.tsx`) is a toolbar without an activity strip; once the strip lands in chrome, the strip component is already prop-only and ready.

---

## 6. Adding a new data source

```ts
// src/renderer/components/nodes/MyNewNode/analyticsSource.ts
import { registerDataSource } from '../../../analytics';

registerDataSource({
  id: 'mynewnode',
  label: 'New Node',
  collect(board) {
    const out = [];
    for (const n of board.nodes) {
      if (n.kind !== 'mynewnode') continue;
      // … emit AnalyticsEvent records …
    }
    return out;
  },
});
```

Then import that file once during app boot (the AnalyticsNode's `useAnalytics()` is one good entry point; or call `registerBuiltinSources()` adjacent). Every chart picks it up automatically.

---

## 7. Test plan

- `bucketBy.test.ts` — zero-fill, per-day counts, range filtering, dow/hour/month bucketers.
- `dateRange.test.ts` — addDays month boundaries, dowOf Mon=0, lastNDays inclusiveness, isoToYMD local TZ.
- `sources.test.ts` — taskSource excludes legacy `done:true` without completedAt; habitSource fans log per habit; pomoSource skips cancelled sessions; `calcHabitStreak`.
- `registry.test.ts` — register/replace/unregister; throwing source skipped.
- `engine.test.ts` — merged event stream, stable memo identity per range, open-counters, error isolation.
- `analyticsCommands.test.ts` — view validation, clamps, no-op returns.
- `stampCompletedAt.test.ts` — stamp on false→true, clear on true→false, no-op otherwise.
