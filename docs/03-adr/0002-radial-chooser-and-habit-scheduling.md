# ADR 0002 — RadialChooser primitive + habit drop-to-schedule

**Date:** 2026-05-14
**Status:** Accepted (architect sign-off — implementation may begin)
**Author:** architect
**Cross-reference:** also tracked in `docs/03-architecture/decisions.md` as Decision 25. Builds on ADR 0001 (Calendar mother + scheduling), specifically §9 (typed `dataTransfer` payload) and Decision 24 §"Drop target".

---

## Context

ADR 0001 introduced drag-to-schedule for **tasks** via the `application/krnl-task` MIME. Habits are the second data stream the Calendar mother visualises, and they need an analogous interaction:

- Drag a habit (from `HabitNode`) onto a Calendar surface ⇒ schedule a recurring time-of-day for that habit.
- Unlike tasks, a habit is recurring by nature, so the drop interaction must capture **which days of the week** the schedule applies to, not just a single timestamp.
- The user-facing locked choice is a **radial wedge chooser** — a transient overlay that opens at the cursor when a habit is dragged over a calendar cell and resolves the day-pattern when the user drops on one of its wedges.

The radial chooser is also intended as a **reusable primitive**: future drag interactions (e.g. assigning a Pomo preset, picking an edge type) can reuse the same hook without re-deriving its geometry or trigger model. This ADR locks the primitive's API and the first consumer (habit scheduling) in one document so backend-dev can implement them together without contract drift.

The five user-facing decisions were locked before this ADR:

| Topic | Choice |
|---|---|
| Chooser shape | **Radial wedges** (not a popup menu or modal) |
| Trigger | **Drag-hover** opens, **drop on wedge** confirms, **drag-leave** cancels |
| Habit schedule model | **Discriminated union** — daily / weekly / weekday-set, with `timeOfDay` |
| Visualisation | WeekView habit blocks (behind tasks) + MonthView habit dots; YearView not in scope |
| Out-of-scope | Edit/remove schedule UI, auto-log on schedule fire, recurrence beyond daily/weekly |

## Decision

Adopt the five user-locked choices above. Add a **`useRadialChooser` hook** as a reusable renderer-side primitive owned by `src/renderer/components/ui/RadialChooser/`. Extend `Habit` with an optional `schedule?: HabitSchedule` field (discriminated union). Reserve a second MIME — `application/krnl-habit` — for habit drags, with a payload distinct from `application/krnl-task` so a single drop target can disambiguate by type. Wire a new cross-node command `calendar.scheduleHabit` that routes through the dispatcher to `habit.setSchedule` on the habit mother (mirrors the `calendar.schedule → task.setSchedule` pattern in ADR 0001 §4/§6). WeekView habit blocks render **behind** task blocks at 12px height, 0.7 opacity. MonthView shows a small coloured dot per scheduled habit in the day cell.

## Contract

### 1. RadialChooser API

**Location (binding):**
- `src/renderer/components/ui/RadialChooser/index.tsx` — the visual host component.
- `src/renderer/components/ui/RadialChooser/useRadialChooser.ts` — the hook.
- `src/renderer/components/ui/RadialChooser/types.ts` — `RadialOption<T>`, `RadialChooserOptions<T>`, `RadialChooserHandle<T>`.

**Hook signature:**

```ts
export interface RadialOption<T> {
  id: string;            // stable, used as React key
  label: string;         // short — wedge text, max ~10 chars; truncate with ellipsis
  value: T;              // arbitrary payload returned to onPick
  icon?: string;         // optional single grapheme (emoji or glyph) rendered above label
  color?: string;        // optional CSS color for wedge stroke; defaults to var(--acid)
}

export interface RadialChooserOptions<T> {
  radius?: number;       // outer radius in CSS px; default 88
  innerRadius?: number;  // dead-zone radius; default 24 (also the cancel target)
  wedgeGap?: number;     // gap between wedges in CSS px on the arc; default 4
  onPick: (value: T, option: RadialOption<T>) => void;
  onCancel?: () => void; // fired on drag-leave OR Escape OR drop in dead zone
}

export interface RadialChooserHandle<T> {
  open: (origin: { x: number; y: number }, options: RadialOption<T>[]) => void;
  close: () => void;     // imperative cancel; fires onCancel
  isOpen: boolean;       // for guards in caller's event handlers
}

export function useRadialChooser<T>(options: RadialChooserOptions<T>): RadialChooserHandle<T>;
```

**Host component:**

```tsx
<RadialChooserHost />   // mount once near the app root (sibling of <CanvasFlow/>)
```

The hook registers itself with the host via a module-level singleton; only one chooser may be open at a time. Opening a second one closes the first with `onCancel`.

**Portal target & z-index:**
- Portal: `document.body` (avoids React Flow transform interference).
- z-index: `2147483000` — above MotherFrame popovers (`1200`), below devtools but above everything else. Constant exported as `RADIAL_CHOOSER_Z` from `types.ts`.

**Geometry:**
- Outer radius default `88px`; min `64`, max `160` (clamped inside `open`).
- Inner dead-zone radius default `24px`. A drop inside the dead zone fires `onCancel` (never `onPick`). The dead zone also shows a faint "×" glyph.
- Wedge angle layout:
  - `N === 1` → single 360° ring with label centred above the dead zone.
  - `N === 2` → two 180° half-discs, split along the **vertical** axis (left = options[0], right = options[1]).
  - `N >= 3` → `360 / N` degrees per wedge, starting at `-90°` (top) and going clockwise, so options[0] is always at the top.
  - `wedgeGap` is subtracted from each wedge's sweep equally (split half on each side).
- Origin: the chooser is centred at the `{x, y}` passed to `open(...)` in **client coordinates** (relative to viewport). It does not auto-flip near screen edges in v1 (out of scope; acceptable risk for a calendar surface that occupies the canvas centre).

### 2. Trigger model

The RadialChooser is **drag-driven** in this ADR's consumer; the hook itself is trigger-agnostic, but the consumer pattern is binding for habit scheduling:

1. **Dragover-to-open.** When a `dragover` event on a calendar cell sees a `application/krnl-habit` payload, the cell calls `e.preventDefault()` (required for HTML5 to allow the drop) and, if the chooser is not already open, calls `chooser.open(cursorXY, options)`. Subsequent `dragover` ticks on the same cell are no-ops (`chooser.isOpen` guard).
2. **Pointer tracking.** When `open` is called, the host installs a `pointermove` listener on `window` to update which wedge is hovered. This is necessary because during an HTML5 drag, mouse events are suppressed by the browser, but `dragover` events on the host overlay still fire — so the host overlay itself listens for `dragover` (not `pointermove`) to compute the hovered wedge. **Correction binding:** the host installs a `dragover` listener (capture-phase, `window`-level) during open, and calls `preventDefault` so the drag remains in `dropEffect: 'move'` state. `pointermove` is installed only as a fallback when `isOpen` is true but no active drag is detected within 200ms (e.g. for non-drag programmatic opens).
3. **Drop-to-confirm.** A `drop` event on a wedge resolves which wedge contains the drop point (by angle from origin) and fires `onPick(option.value, option)`. The chooser closes synchronously inside `onPick` (the caller does not need to call `close`).
4. **Drag-leave-to-cancel.** If `dragleave` fires on the host overlay AND `relatedTarget` is null (i.e. the drag left the window) OR a `dragend` fires anywhere, the chooser closes via `onCancel`. A drop **inside the dead zone** also fires `onCancel`.
5. **Escape-to-cancel.** A `keydown` for `Escape` while `isOpen` fires `onCancel`.

**Binding rule:** the consumer's `dragover` handler **must** call `e.preventDefault()` before opening the chooser. Without it, the browser refuses the drop and the chooser will never receive a `drop` event. Forgetting this is the most likely integration bug; tests for the habit drop path must assert `preventDefault` is called on `dragover`.

### 3. Habit data model extension

`src/renderer/components/nodes/HabitNode/types.ts` — add optional `schedule` to `Habit`:

```ts
// ISO day-of-week, 1 = Monday … 7 = Sunday. Matches ISO-8601.
export type IsoDow = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type HabitSchedule =
  | { kind: 'daily';   timeOfDay: string }                // "HH:MM" local, 24h
  | { kind: 'weekly';  timeOfDay: string; days: IsoDow[] } // non-empty, sorted asc, deduped
  | { kind: 'weekdays'; timeOfDay: string };               // Mon–Fri shortcut, equivalent to weekly+[1..5]

export interface Habit {
  id: string;
  name: string;
  createdAt: string;
  log: string[];
  archived: boolean;
  color: HabitColor;
  icon?: string;
  schedule?: HabitSchedule;   // NEW — absence = unscheduled
}
```

**Encoding rules:**
- `timeOfDay` is `"HH:MM"` zero-padded, local time. Validation: `/^(?:[01]\d|2[0-3]):[0-5]\d$/`.
- `days` for `weekly` is an array of `IsoDow`, **sorted ascending**, **non-empty**, **deduplicated**. The reducer enforces this on every write (sort + Set). If empty after dedup, the schedule field is removed (treated as unschedule).
- `weekdays` is a sugar variant — kept distinct from `weekly+[1..5]` so the RadialChooser can offer it as a single wedge labelled "WEEKDAYS" and render it as such in the habit's settings popover. The visualisation layer expands it to days 1..5 at render time.

No board migration is required — `schedule?` is optional and absence is the default.

### 4. MIME contract

**Reserved MIME:** `application/krnl-habit`.

**Payload shape (binding):**

```ts
interface KrnlHabitDragPayload {
  habitId: string;            // the Habit.id (not the habit-mother node id)
  habitMotherId: string;      // id of the 'habit' node that owns this habit
  color: HabitColor;          // duplicated for fast preview rendering on the drop target
  name: string;               // duplicated for chooser labels / tooltips
}
```

Serialised as JSON. The drop target reads it via `e.dataTransfer.getData('application/krnl-habit')`.

**Who emits:** the `HabitNode` row for each habit in the habit list. The row gains `draggable={true}` and an `onDragStart` that:

```ts
e.dataTransfer.setData('application/krnl-habit', JSON.stringify(payload));
e.dataTransfer.effectAllowed = 'copy';   // copy, not move — habits are not consumed
e.dataTransfer.setDragImage(rowEl, 0, rowEl.offsetHeight / 2);
```

**Who accepts:** Calendar `WeekView` hour cells and `MonthView` day cells. Both inspect `e.dataTransfer.types` on `dragover`:

```ts
function onDragOver(e: DragEvent) {
  const types = e.dataTransfer.types;
  if (types.includes('application/krnl-habit')) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    openHabitChooserIfNeeded(e);
    return;
  }
  if (types.includes('application/krnl-task')) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    return;  // task path — ADR 0001 §9
  }
}
```

Cells **must** disambiguate by MIME — never by inspecting payload shape. If both MIMEs were ever set on a single drag (they will not be in v1), the habit branch wins because it precedes the task branch in the conditional.

### 5. Commands

#### `calendar.scheduleHabit` — cross-node router (Calendar mother)

Dispatched by Calendar drop handlers. Routes through `commandDispatch` to the habit mother that owns `habitId`.

```ts
// command: 'calendar.scheduleHabit'
// target: the calendar mother node
// args:
{
  habitId: string;
  habitMotherId: string;
  schedule: HabitSchedule;   // already-resolved by the RadialChooser pick
}
```

Dispatcher behaviour: looks up the node `habitMotherId` (must have `kind === 'habit'`), then dispatches `habit.setSchedule` against it with `{ habitId, schedule }`. The calendar mother does **not** mutate any habit state directly. After the inner dispatch resolves, calendar emits a `calendar.habitScheduled` event with the same args.

#### `habit.setSchedule` — pure handler on the habit mother

```ts
// command: 'habit.setSchedule'
// target: a node of kind 'habit'
// args:
{
  habitId: string;
  schedule: HabitSchedule | null;   // null clears the schedule
}

function habitSetSchedule(
  state: HabitState,
  args: { habitId: string; schedule: HabitSchedule | null },
): HabitState;
```

Handler rules (binding):
- Looks up `habits.find(h => h.id === habitId)`. If absent, returns state unchanged (no throw).
- For `schedule.kind === 'weekly'`, normalises `days` via `[...new Set(days)].sort((a, b) => a - b)`. If the result is empty, treats as `null` (clears).
- For `schedule.kind === 'weekdays'`, no normalisation needed beyond `timeOfDay` validation.
- `null` removes the `schedule` field entirely (`delete habit.schedule`, not `schedule: undefined` — keeps board.json clean).
- Validates `timeOfDay` against the regex above; on failure, returns state unchanged.

Registered in `commandDispatch.ts` against `kind === 'habit'`. No mirroring to any other node (unlike `task.setSchedule`).

#### `calendar.habitScheduled` — event

```ts
// emitted by calendar after a successful scheduleHabit
{ habitId: string; habitMotherId: string; schedule: HabitSchedule }
```

### 6. Visualisation rules

#### WeekView habit blocks

For every habit with `schedule`, render one horizontal block in each applicable day-column at `timeOfDay`:

- **Height:** `12px` (fixed; not derived from any duration).
- **Opacity:** `0.7`.
- **Background:** the habit's `color` token at full saturation.
- **Border:** none.
- **Layering:** rendered **behind** task blocks. Use `zIndex: 1` for habits, `zIndex: 2` for tasks within the day-column. The day-column itself remains `position: relative`.
- **Width:** spans the full column inner-width (minus 2px horizontal padding).
- **Top:** computed from `timeOfDay` via `hoursFromStart * rowHeight`; minute offset uses `(minutes / 60) * rowHeight`. Fractional pixels rounded.
- **Click:** habit blocks are **pointer-events: none** in v1. They are purely decorative. Editing happens in the HabitNode settings popover (out of scope for this ADR's UI work, but the data field is writable from the popover via the same `habit.setSchedule` command).

For `kind === 'daily'`, render in all 7 columns. For `kind === 'weekly'`, render only in columns whose `IsoDow` is in `days`. For `kind === 'weekdays'`, render in columns 1..5.

If `timeOfDay` falls outside `hourRange`, the block is **not rendered** in WeekView (no up/down badges like tasks — habits are recurring; the cue is unnecessary).

#### MonthView habit dots

For each day-cell in the month grid, render one dot per habit scheduled for that day's `IsoDow`:

- **Dot:** `6px × 6px` circle, habit's `color` at `0.85` opacity.
- **Layout:** horizontal row at the bottom of the cell, 2px gap between dots, max 6 visible; if more, the 6th becomes a `"+N"` text glyph in `ink-3`.
- **Order:** stable — sort by `habit.id` ascending so the dot order does not jitter across renders.
- **Click:** `pointer-events: none` (same rationale as WeekView blocks).

#### YearView

Out of scope. YearView already renders the completed-pomo heatmap (ADR 0001); layering habit data on top is deferred.

### 7. Out of scope for v1

- **Editing or removing a schedule via the Calendar surface.** All schedule mutations happen via drag-to-schedule (create/replace) or via the HabitNode settings popover (full edit). There is no "click block → edit" path on Calendar.
- **Auto-log on schedule fire.** A scheduled habit does NOT auto-mark itself complete when its `timeOfDay` arrives. The user still ticks the habit manually. The schedule is a planning artefact, not a trigger.
- **Recurrence patterns beyond daily / weekly / weekdays.** No bi-weekly, no "every Nth day of month", no end-date, no skip-on-holiday. The discriminated union has room to grow — adding `{ kind: 'biweekly'; ... }` is a non-breaking extension.
- **Multiple schedules per habit.** `Habit.schedule` is a single optional field, not an array. A habit that needs "8am Mon-Wed and 6pm Thu-Fri" must wait for v2.
- **Notifications / reminders.** No system-tray, no in-app toast, no audio cue. Strictly visual.
- **Time-zone handling.** All times are local, same convention as task `scheduledFor`.

## Consequences

**Enables:**
- A reusable RadialChooser primitive for any future drag-resolves-to-choice interaction (edge-type picker, Pomo preset assignment, multi-target drop).
- A second typed drag MIME (`application/krnl-habit`) that establishes the pattern: each draggable node-data shape gets its own MIME, drop targets disambiguate by MIME.
- The Calendar mother becomes a true unified planner: tasks **and** habits both surface on the same grid with consistent interaction grammar.
- The `HabitSchedule` discriminated union gives the renderer a single field to read; renderers do not need to query the calendar mother for habit positions.

**Forecloses (out of scope for v1, listed above):**
- Schedule editing on Calendar, auto-log, multi-schedule, advanced recurrence, reminders, time zones.

**Risks accepted:**
- The `dragover`-to-open trigger competes with the cell's own `dragover` (which also calls `preventDefault` for the task path). Mitigated by the MIME-disambiguation rule in §4 — the habit branch opens the chooser; the task branch never does.
- The RadialChooser overlay is portaled to `document.body`, bypassing React Flow's transform. This is correct (the chooser is screen-space, not canvas-space) but means the chooser does not pan with the canvas if the user scrolls mid-drag. Acceptable — drags are short-lived.
- `pointer-events: none` on habit blocks/dots in v1 means no hover tooltip showing the habit name. The drop interaction labels the chooser wedges with habit names, so users see the name at schedule time. A tooltip is a clean follow-up that does not require schema changes.
- The `weekdays` sugar variant duplicates information that could be expressed as `weekly + [1..5]`. We keep it because the chooser UX requires a distinct wedge labelled "WEEKDAYS" — without the variant, the chooser would need to invent a synthetic value and the renderer would need a heuristic to label `weekly+[1..5]` as "weekdays" on display. The variant makes round-trips lossless.

## Alternatives rejected

- **Popup menu instead of radial.** Rejected: radial preserves Fitts's-law parity across wedges and is faster for a 3-option pick during an active drag. Popup menus also misalign with the drag-cursor on monitor edges.
- **Single `schedule: { dows: IsoDow[]; timeOfDay }` shape (no union).** Rejected: collapses the `weekdays` UX shortcut and forces every renderer to compare arrays to detect the daily/weekday cases. The union costs one extra type but pays for itself in render and chooser logic.
- **Reuse `application/krnl-task` for habits.** Rejected outright: the payload shapes are incompatible (no `taskId`/`itemId` for habits) and overloading one MIME forces drop targets to inspect payload contents to disambiguate.

## Slice ordering recommended for backend-dev

1. **Primitive slice (one PR, no consumer):** `useRadialChooser` hook, `RadialChooserHost`, types, geometry, host singleton, portal mount, `Escape`/dead-zone cancel. Storybook-style smoke harness or a temporary debug trigger is acceptable for verifying the hook in isolation.
2. **Data slice (one PR, no UI):** `HabitSchedule` types, `habit.setSchedule` command + handler, `calendar.scheduleHabit` router + event, dispatcher wiring. No drop UI yet.
3. **Drop integration slice:** HabitNode row `draggable` + `onDragStart`, WeekView hour-cell `onDragOver`/`onDrop` with MIME disambiguation, RadialChooser opened from the cell's dragover, picks dispatched as `calendar.scheduleHabit`.
4. **Visualisation slice:** WeekView habit blocks (12px, opacity 0.7, z-index 1), MonthView habit dots. May ship in the same PR as the drop integration if the diff stays under ~250 lines.

---

## Amendments (2026-05-14)

User-driven amendments after testing v1 of PR #116. Both amendments are **binding** and **supersede** the corresponding original sections. Implementation must conform to these rules; conflicts with §2 or §6 above resolve in favour of the amendments.

### A1 — Trigger model revised (supersedes §2)

**Status of original §2:** SUPERSEDED. The dragover-to-open / drop-to-confirm flow is OUT. Two-phase replaces it.

**Problem with v1:** dragover-to-open captured the **first** cell hovered (usually Monday) as the schedule target instead of the cell where the user released. Even with cell-tracking fixed, seeing the chooser while still dragging is undesired UX. The new model defers chooser appearance to drop time and confirms the pick via a separate pointer phase.

**New binding rules:**

1. **Drop opens the chooser, not dragover.** During the HTML5 drag, calendar cells only render the standard `data-drop-target` highlight (same affordance as task drops). No chooser geometry is mounted, no `chooser.open` is called, no `pointermove`/`dragover` capture listeners are installed during the drag.
2. **Chooser appears at the drop point** — `{ x: e.clientX, y: e.clientY }` captured from the `drop` event. This is the origin passed to `chooser.open(origin, options)`.
3. **Two-phase interaction.** HTML5 drag has ended by drop time (mouse button is up). The chooser therefore **cannot** rely on drag's release-to-confirm. It accepts a second pointer phase:
   - On open: install a `window`-level `pointermove` listener for wedge-highlight tracking. The wedge under the cursor's angular position is highlighted.
   - **Confirm:** user **clicks** a wedge. The click target IS the confirmation — `mousedown` → `mouseup` on the same wedge fires `onPick(value, option)`.
   - **Cancel:** any of:
     - Click inside the dead zone (the inner circle) → `onCancel`.
     - Press `Escape` → `onCancel`.
     - Click outside the chooser's bounding box (outside the outer radius) → `onCancel`.
4. **Cell context is captured at drop time, period.** The cell receiving the `drop` event is the schedule target. There is no dragover bookkeeping, no "last hovered cell" memo, no Monday-bias. The drop handler reads `dataTransfer`, captures `{ clientX, clientY, cellIso }`, and only then calls `chooser.open`.
5. **Hook API is unchanged.** `onPick`/`onCancel` callback shape stays. The change is purely in **when** the consumer calls `open()` — at `drop`, not at `dragover` — and in the host's internal listener set (`pointermove` + `click`, not `dragover` + `drop`).

**Binding contract for the consumer (WeekView/MonthView cells):**

```ts
function onDrop(e: DragEvent, cellIso: string) {
  const raw = e.dataTransfer?.getData('application/krnl-habit');
  if (!raw) return;
  e.preventDefault();
  const payload = JSON.parse(raw) as KrnlHabitDragPayload;
  chooser.open(
    { x: e.clientX, y: e.clientY },
    buildHabitWedges(payload, cellIso),  // returns RadialOption<HabitSchedule>[]
  );
  // onPick (set up once at host mount) dispatches calendar.scheduleHabit.
}
```

**Binding contract for the host (`RadialChooserHost`):**

- On `open`: install `window.addEventListener('pointermove', ...)`, `window.addEventListener('click', ...)`, `window.addEventListener('keydown', ...)` (capture phase for keydown to catch Escape pre-routing).
- On `close` (pick or cancel): remove all three listeners synchronously.
- The `pointermove` handler computes the hovered wedge by angle from origin; updates internal state to drive the hover style.
- The `click` handler:
  - If click point is inside dead zone → `onCancel`.
  - Else if click point is inside a wedge → `onPick(option.value, option)`.
  - Else (outside outer radius) → `onCancel`.
- No `dragover`/`drop` listeners on the host. Those concerns belong to the cell, before `open` is called.

**Tests must assert:**
- `chooser.open` is **not** called during `dragover`.
- `chooser.open` **is** called inside the `drop` handler with `{ x: e.clientX, y: e.clientY }`.
- A click on a wedge fires `onPick` with the correct option.
- A click in the dead zone fires `onCancel`.
- A click outside the outer radius fires `onCancel`.
- `Escape` fires `onCancel`.

### A2 — Visual styling revised (supersedes §6 styling, not §6 data rules)

**Status of original §6:** the **data/layout** rules for WeekView blocks and MonthView dots are unchanged. Only the **chooser's own visual material** is replaced. The original §6 did not specify chooser styling in detail — these rules now do, and lock the visual language as **Apple Liquid Glass** (recent macOS/iOS material).

**Scope:** these rules apply to the `RadialChooserHost` render output only. WeekView habit blocks and MonthView dots keep the §6 spec verbatim.

**Binding visual rules:**

1. **Backdrop.** Wrap the SVG chooser in a `<div>` host (SVG does not honour `backdrop-filter` directly). The wrapper carries:
   ```css
   backdrop-filter: blur(24px) saturate(180%);
   -webkit-backdrop-filter: blur(24px) saturate(180%);
   ```
   Wrapper sized to the chooser's outer-radius bounding box; clipped to a circle via `clip-path: circle(<radius>px at center)` so the blur tracks the wedge silhouette.
2. **Wedge fill.** Translucent dark glass.
   - Baseline: `rgba(20, 20, 20, 0.55)`.
   - Hover: `rgba(30, 30, 30, 0.75)`.
3. **Wedge stroke.** `1.5px` solid; colour = the option's `color` field (default `var(--acid)`).
   - Hover: stroke thickens to `2.5px` and glows: `filter: drop-shadow(0 0 8px <color>)`.
4. **Edge accent colours for the habit-drop caller (two-option case):**
   - Weekly wedge stroke: `var(--purple)` if defined, else `#a78bfa`.
   - Daily wedge stroke: `var(--cyan)` if defined, else `#22d3ee`.
   - For `N >= 3` callers, each `RadialOption.color` is used directly as both stroke and icon/label tint. No theme override.
5. **Inner highlight.** Subtle 1px inset `rgba(255, 255, 255, 0.08)` on each wedge — implemented either as an additional inner stroke on a slightly-inset wedge path, or via an SVG `<filter>` with a soft `feGaussianBlur`. Either approach is acceptable; the inner stroke is simpler and preferred.
6. **Dead zone.** Dark translucent circle, `rgba(0, 0, 0, 0.4)` + the wrapper's backdrop blur applies. "×" glyph in `var(--ink-3)`. Hover: brighten "×" to `var(--ink-1)` and scale the dead-zone group to `1.05` (transform-origin: centre).
7. **Animation.**
   - Enter: `180ms cubic-bezier(0.34, 1.56, 0.64, 1)`, scale `0.6 → 1.0`, opacity `0 → 1`.
   - Exit: `120ms ease-out`, scale `1.0 → 0.85`, opacity `1 → 0`.
   - Transform-origin: centre of the chooser (the origin point).
8. **Typography.** Option label: `var(--font-mono)`, `10px`, `text-transform: uppercase`, `letter-spacing: 0.08em`, colour = the wedge's stroke colour (so purple-stroke wedge ⇒ purple label; cyan-stroke wedge ⇒ cyan label).
9. **Icon.** `18px`, centred above label inside the wedge. Colour matches stroke.
10. **Outer glow / depth.** Whole chooser group carries `filter: drop-shadow(0 4px 24px rgba(0, 0, 0, 0.5))` for a floating-sheet impression.

**Notes for backend-dev:**
- Define `--purple` and `--cyan` design tokens in the existing theme CSS if absent. Fall back inline only if the tokens cannot be added in the same slice.
- The backdrop blur requires the wrapper to sit above an element with visible content; portaling to `document.body` is fine — the page background and any canvas pixels below contribute to the blur.
- The dead-zone hover scale must not affect wedge geometry. Keep the dead zone in its own SVG `<g>` with an independent `transform`.

---
