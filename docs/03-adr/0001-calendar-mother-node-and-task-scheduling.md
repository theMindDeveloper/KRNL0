# ADR 0001 — Calendar mother node + system-wide task scheduling

**Date:** 2026-05-13
**Status:** Accepted (architect sign-off — implementation may begin)
**Author:** architect
**Cross-reference:** also tracked in `docs/03-architecture/decisions.md` as Decision 23.

---

## Context

KRNL0 currently ships four mother nodes (Pomo, Todo, Habit, Terminal). Tasks have no temporal dimension — they exist as ordered chains, with `pomoSessionsCompleted` and `secondsAccumulated` for time accounting but no point on a calendar. To support the 2026-07-20 demo we need a fifth mother — **Calendar** — that:

- renders week / month / year views;
- visualises three already-existing data streams (scheduled tasks, habit log, completed pomo history) without owning any of them;
- creates live, observable bidirectional links between Calendar and Todo/Pomo/Habit, preserving the canvas-as-graph metaphor.

The four user-facing decisions were locked before this ADR:

| Topic | Choice |
|---|---|
| Scheduling model | **Hybrid** — `scheduledFor?` field on task + visible edge when user explicitly drags |
| Granularity | **Date + time** — week view has Google-Calendar-style hour grid |
| Layered data | Habit dots + completed-pomo heatmap + today indicator + live now-line |
| Active links | Click day → filter Todo, drag task → schedule, overdue surfacing in TodoNode |

This ADR locks the contract that backend-dev needs in order to start.

## Decision

Adopt the four user-locked choices above. Add `'calendar'` as the fifth permanent mother kind with the contract below. Tasks gain optional `scheduledFor` (ISO local datetime) and optional `scheduledDurationMin`. Cross-mother reads use the existing pattern (direct store selector); cross-mother writes go through `onCommand`. Drop-to-schedule uses a typed HTML5 dataTransfer payload. Persistence migration injects the new mother into existing `board.json` files via a new ordered migration step.

## Contract

### 1. NodeKind addition

`src/shared/types/node.ts` — append `'calendar'` to the `NodeKind` union:

```ts
export type NodeKind =
  | 'pomo' | 'todo' | 'habit' | 'term' | 'calendar'
  | 'pomo.session' | 'todo.task' | 'habit.day'
  | 'text' | 'image';
```

No child kinds in v1. (A future `'calendar.event'` is a clean extension; explicitly deferred.)

### 2. CalendarState / CalendarConfig

New file `src/renderer/components/nodes/CalendarNode/types.ts`:

```ts
export type CalendarView = 'week' | 'month' | 'year';

export interface CalendarState {
  selectedDate: string | null;   // YYYY-MM-DD (local) — null = no day selected
  anchorDate: string;            // YYYY-MM-DD — controls what week/month/year is in view
}

export interface CalendarConfig {
  view: CalendarView;            // default 'week'
  weekStartsOn: 'monday';        // locked, mirrors HabitConfig
  showHabits: boolean;           // default true
  showPomoHeatmap: boolean;      // default true (mostly relevant in year view)
  hourRange: { start: number; end: number }; // default { start: 6, end: 23 }
}

export const defaultCalendarState = (): CalendarState => ({
  selectedDate: null,
  anchorDate: /* todayLocal() */ '',
});

export const defaultCalendarConfig = (): CalendarConfig => ({
  view: 'week',
  weekStartsOn: 'monday',
  showHabits: true,
  showPomoHeatmap: true,
  hourRange: { start: 6, end: 23 },
});
```

Zod schema (state only — config is plain JSON, healed by the migration layer):

```ts
const CalendarStateSchema = z.object({
  selectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
```

### 3. Task / TodoItem field additions

`TaskState` (additive, optional, fully back-compat):

```ts
scheduledFor?: string;          // ISO 8601 local datetime, e.g. "2026-05-20T14:30"
scheduledDurationMin?: number;  // optional override for calendar block height
```

`TodoItem` (additive, optional):

```ts
scheduledFor?: string;          // for items that haven't spawned a TaskNode yet
```

Absence ⇒ unscheduled. No board migration needed for these fields — they're optional.

### 4. Calendar commands (handled by the calendar mother)

| Command | Args | Behaviour |
|---|---|---|
| `calendar.setView` | `{ view: CalendarView }` | Mutates `config.view`. |
| `calendar.selectDate` | `{ date: string \| null }` | Mutates `state.selectedDate`. Passing the currently-selected date clears it (toggle). |
| `calendar.setAnchor` | `{ date: string }` | Mutates `state.anchorDate`. Used by year-drill-down and week/month navigation. |
| `calendar.schedule` | `{ taskId: string, scheduledFor: string, scheduledDurationMin?: number }` | Looks up the target task node and dispatches `task.setSchedule` to it. Cosmetic edge creation is the caller's responsibility (drop handler). |

### 5. Events emitted by the calendar mother

| Event | Args | When |
|---|---|---|
| `calendar.daySelected` | `{ date: string }` | User clicks a day cell. Also fires when year-view drill-down selects a day. |
| `calendar.taskScheduled` | `{ taskId, scheduledFor, scheduledDurationMin? }` | After drop-to-schedule succeeds. |
| `calendar.viewChanged` | `{ view: CalendarView }` | After `calendar.setView` resolves. |

### 6. New TaskNode / TodoNode command: `task.setSchedule`

Handled by `'todo.task'` (primary) and `'todo'` (for items without a spawned TaskNode):

```ts
// command name: 'task.setSchedule'
// target: a Node of kind 'todo.task' OR 'todo' (resolves TodoItem by item id)
// args:
{
  scheduledFor: string | null;       // null clears the schedule
  scheduledDurationMin?: number;     // optional; absence keeps current durationMin
  // when target is a 'todo' node, also requires:
  itemId?: string;                   // id of the TodoItem to mutate
}
```

Pure handler signature mirrors existing `taskEdit` / `todoEdit`:

```ts
function taskSetSchedule(state: TaskState, args: { scheduledFor: string | null; scheduledDurationMin?: number }): TaskState;
function todoSetItemSchedule(state: TodoState, args: { itemId: string; scheduledFor: string | null }): TodoState;
```

Dispatcher (`commandDispatch.ts`) wires both cases. When `task.setSchedule` lands on a `'todo.task'` node, the dispatcher additionally mirrors `scheduledFor` to the linked `TodoItem` (bidirectional invariant, same pattern as `task.toggle`).

### 7. Cross-mother read rule

Locked rule (already used between TaskNode and PomoNode):

> **Reads via direct store selector; writes via `onCommand`.**

TodoNode reads `board.nodes.find(n => n.kind === 'calendar')?.state.selectedDate` to filter visible rows. It MUST NOT subscribe to the calendar node's full state; it derives the single field via a memoised selector and re-renders only when that field changes. To write back (e.g., a TodoNode UI button that selects a day), use `onCommand('calendar.selectDate', { date })` resolved against the calendar mother id, exactly as TaskNode dispatches `pomo.cancel`.

### 8. Cosmetic edge created on drag-schedule

Locked shape:

```ts
{
  id: `edge-${uuid()}`,
  from: { nodeId: <calendarId>, event: 'calendar.daySelected' },
  to:   { nodeId: <taskId>,     command: 'task.activate' },
  enabled: true,
}
```

This is the **semantically active** variant. Clicking the calendar day pulses the linked task chain via the existing `task.activate` command (which is already a no-op safe operation). The edge renders with the existing cyan `task-flow` styling because `srcKind !== 'todo.task'` — we override the edge type at adapter time. Adapter change:

`rfAdapters.toRfEdge` — when `edge.from.event === 'calendar.daySelected'`, force `type: 'task-flow'` and `animated: true` so the cyan march renders regardless of endpoint kinds.

Dedup rule: refuse to create a second `calendar.daySelected → task.activate` edge for the same `(calendarId, taskId)` pair (same pattern as `onConnect`'s dedup at CanvasFlow:458-464).

### 9. Drop-to-schedule payload (NEW PATTERN)

No existing precedent in the codebase for HTML5 drop onto interior node cells. Locked here:

- **Drag source** (TodoNode row, TaskNode body, week-view existing block): on `mousedown`/`dragstart` calls
  ```ts
  e.dataTransfer.setData('application/krnl-task', JSON.stringify({ taskId, durationMin }));
  e.dataTransfer.effectAllowed = 'move';
  ```
- **Drop target** (calendar week-view hour cell, month-view day cell): on `dragover` checks `e.dataTransfer.types.includes('application/krnl-task')` and calls `preventDefault()`. On `drop`:
  1. Parse JSON.
  2. Compute `scheduledFor` from the cell's date (and hour/minute for week view).
  3. Dispatch `task.setSchedule` via the calendar's `onCommand` (which proxies to the target task — actually fired by the dispatcher routing through `calendar.schedule`).
  4. Optionally create the cosmetic edge above.

The MIME `application/krnl-task` is reserved for this contract. Future drag sources of different shapes use distinct MIMEs.

### 10. Persistence migration

The existing `loadBoardFrom` pipeline must be extended. Add **before** `migrateNodeStates`:

```ts
const NEW_MOTHER_POSITIONS = {
  'mother-pomo':     { x: -808, y: 0 },
  'mother-todo':     { x: -396, y: 0 },
  'mother-habit':    { x:   16, y: 0 },
  'mother-term':     { x:  428, y: 0 },
  'mother-calendar': { x:  840, y: 0 },   // slot 5
};

function migrateAddCalendarMother(board): board {
  if (!hasNode(board, 'mother-calendar')) {
    board.nodes.push({
      id: 'mother-calendar',
      kind: 'calendar',
      position: { x: 840, y: 0 },
      isMother: true,
      state: { selectedDate: null, anchorDate: todayLocal() },
      config: { view: 'week', weekStartsOn: 'monday',
                showHabits: true, showPomoHeatmap: true,
                hourRange: { start: 6, end: 23 } },
    });
  }
  return board;
}
```

`seedBoard()` also gains the 5th entry. The migration runs on every load so a board.json written before this change picks up the calendar mother on its next open. The injection is idempotent (no-op if `mother-calendar` already exists).

Schema (`board.schema.ts`) is unchanged — `kind` is `z.string()`, `state`/`config` are `z.unknown()`. No `BoardSchema.version` bump required because all additions are additive.

### 11. Files affected (binding)

**New:**
- `src/renderer/components/nodes/CalendarNode/index.tsx`
- `src/renderer/components/nodes/CalendarNode/types.ts`
- `src/renderer/components/nodes/CalendarNode/commands.ts`
- `src/renderer/components/nodes/CalendarNode/WeekView.tsx`
- `src/renderer/components/nodes/CalendarNode/MonthView.tsx`
- `src/renderer/components/nodes/CalendarNode/YearView.tsx`
- `src/renderer/components/nodes/CalendarNode/NowLine.tsx`
- `src/renderer/components/nodes/CalendarNode/__tests__/CalendarNode.test.tsx`

**Modified:**
- `src/shared/types/node.ts` — add `'calendar'`.
- `src/renderer/components/nodes/MotherFrame/index.tsx` — `MOTHER_TOTAL = 4 → 5`.
- `src/renderer/components/nodes/registry.ts` — register `calendar` in both maps.
- `src/renderer/components/Canvas/rfAdapters.tsx` — add `calendar: { width: 380, height: 600 }` to `INITIAL_DIMS_BY_KIND`. When `edge.from.event === 'calendar.daySelected'`, force `type: 'task-flow'` and `animated: true`.
- `src/main/persistence/board.ts` — add `migrateAddCalendarMother`, extend `seedBoard()`, add `'mother-calendar'` to `NEW_MOTHER_POSITIONS`. Add `CONFIG_DEFAULTS['calendar']` and `STATE_DEFAULTS['calendar']` entries so reloaded boards heal cleanly.
- `src/renderer/components/Canvas/commandDispatch.ts` — register `calendar.setView`, `calendar.selectDate`, `calendar.setAnchor`, `calendar.schedule`. Register `task.setSchedule` for both `'todo.task'` and `'todo'`. Add mirroring (task↔TodoItem) for the schedule field.
- `src/renderer/components/nodes/TaskNode/types.ts` — add optional `scheduledFor`, `scheduledDurationMin`.
- `src/renderer/components/nodes/TaskNode/commands.ts` — add `taskSetSchedule`.
- `src/renderer/components/nodes/TodoNode/types.ts` — add optional `scheduledFor` to `TodoItem`.
- `src/renderer/components/nodes/TodoNode/commands.ts` — add `todoSetItemSchedule`.
- `src/renderer/components/nodes/TodoNode/index.tsx` — selector reading calendar's `selectedDate`; overdue red-dot indicator; drag payload emission on row.
- `src/renderer/styles/reactflow-theme.css` — `.calendar-cell--drop-target` ring; reuse existing `krnl-task-flow-dash`.

### 12. NowLine performance rule

Locked pattern (already proven in `PomoNode/index.tsx:79`):

```ts
useEffect(() => {
  const id = setInterval(() => setTick((t) => t + 1), 60_000);
  return () => clearInterval(id);
}, []);
```

`NowLine.tsx` MUST own a local `tick` state and recompute its position from `new Date()`. It MUST NOT subscribe to the Zustand store. It MUST NOT use the canvas-tick or any 60fps loop. This is the contract that prevents the StatusBar-style regression.

## Consequences

**Enables:**
- A demoable Calendar mother for 2026-07-20 with three views, drop-to-schedule, day selection filtering Todo, and live now-line.
- A reusable cross-mother selector pattern (read direct, write via command), generalisable beyond Calendar↔Todo.
- A typed drop payload (`application/krnl-task`) that future drag-and-drop interactions (e.g., dragging tasks between Todo lists) can reuse.

**Forecloses (deferred — out of scope for v1):**
- Recurrence rules.
- Notifications / system-tray reminders.
- Multi-day task spans, cross-midnight scheduling.
- Time-zone handling beyond local time.
- "Click day → start a Pomo on its tasks" launchpad.
- iCal / Google Calendar import/export.
- Sharing / multi-user calendars.

**Risks accepted:**
- The cosmetic edge approach repurposes the cyan task-flow visual for a calendar→task link, which dilutes its semantic specificity. Mitigated by using `calendar.daySelected → task.activate` so the visual still means "energy flowing between connected things".
- `MOTHER_TOTAL = 5` is only a fallback; real `slotTotal` is computed in `CanvasFlow` from `motherNodes.length`. Test stubs that import `MOTHER_TOTAL` will pick up the new value automatically.
- Migration injects `mother-calendar` at fixed coordinates. If the user has already placed something at `(840, 0)` in a custom board, the calendar mother overlaps until the user moves either node. Acceptable for v1 (mothers are pinned by convention).

## Alternatives rejected

- **Pure-edge scheduling** (no field on task — schedule lives only as an edge). Rejected: querying "is this task scheduled?" requires an O(E) scan of edges; the calendar view becomes O(N×E). The field is the source of truth; the edge is cosmetic.
- **Versioned schema bump** for the task field addition. Rejected: optional fields are back-compat by Zod construction; no `schemaVersion` bump needed. Reserved for a future shape-breaking change.
- **Custom DOM drag library** for the drop interaction. Rejected: native HTML5 drag-and-drop with a typed MIME is sufficient and matches the existing image-file drop precedent in `CanvasFlow.onDrop`.

## Slice ordering recommended for backend-dev

1. **Data + migration slice** (one PR, no UI): types, registry, `INITIAL_DIMS_BY_KIND`, `seedBoard`, `migrateAddCalendarMother`, `STATE_DEFAULTS`/`CONFIG_DEFAULTS`, `MOTHER_TOTAL = 5`, `task.setSchedule` command + handler, `TaskState`/`TodoItem` field additions. CalendarNode component stubs that render an empty MotherFrame.
2. **Three view slices, parallelisable**: WeekView, MonthView, YearView. Each can ship independently behind `config.view`. NowLine ships with WeekView.
3. **Cross-cutting slice last**: TodoNode filter sync, overdue red-dot, drag payload emission, drop wiring, cosmetic edge creation in the drop handler, calendar→task edge adapter override.
