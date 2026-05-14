# ADR 0004 — Clock day-anchored rendering, concentric parallel rings, and post-ADR-0003 polish

**Date:** 2026-05-14
**Status:** Accepted (architect sign-off — implementation may begin)
**Author:** architect
**Cross-reference:** also tracked in `docs/03-architecture/decisions.md` as Decision 26.
**Supersedes:** nothing. Extends ADR 0001 (Calendar), ADR 0003 (Cascade scheduling, `selectSchedule`), Decision 24 (Timeline selector).
**Bundles:** four user-reported issues from the post-ADR-0003 test pass. Issues 3 and 4 are the substantive design decisions (Clock rewrite). Issues 1 and 2 are short — a destructive migration bug and a context-menu UX gap — included here to avoid an ADR-0005 for ~50 lines of decision text.

---

## Context

After ADR 0003 landed (cascade scheduling — Calendar now reads `selectScheduledTasksForRange`), the user tested with a complex parallel-fork chain and reported four issues:

1. **Bug — destructive migration.** `migrateTaskChain` in `src/main/persistence/board.ts:146-186` filters out **all** edges where `to.nodeId` is a task id, then rebuilds a linear chain in `createdAt` order. Originally a v0-era safety net, it now runs on every load and silently collapses every parallel fork the user creates. Reproduced: build a chain with parallels in memory, Ctrl-R, all forks gone.
2. **UX — "Add subtask" is invisible.** TaskNode's right-click menu offers "Add subtask" (creates a `parentTaskId = source.id` child, which `walkChain` deliberately omits — Decision 24 Q1). The user creates a "subtask" and sees nothing on the timeline. There is no sequential-successor affordance (the obvious mental-model action: "I want a task that runs after this one").
3. **Feature — Clock should show wall-clock time and have a day selector.** ClockNode currently reads `selectTimeline` (chain-relative time — minute 0 of the chain renders at the 12-o'clock position). The user, who has anchored tasks via drop-to-schedule (ADR 0001) and the cascade (ADR 0003), expects the Clock to project those wall-clock placements onto a 12-hour dial. A task anchored at 14:00 should paint its arc starting at the 2-o'clock position; the user should be able to flip between days.
4. **Feature — Concentric rings for parallel-group branches.** Today parallel branches paint at the same radius with `mixBlendMode: multiply`, which overlaps one branch behind the other (line 280 of `ClockNode/index.tsx`). The user wants concentric: branch 0 outermost, branch 1 inner, etc.

This ADR resolves all four with one ADR document and one decision-log entry. Backend-dev gets five slices in dependency order.

---

## Decision

1. **Issue 1 (bug):** `migrateTaskChain` is **deleted in full** from `src/main/persistence/board.ts`. A regression test fixture locks the parallel-fork survival behaviour.
2. **Issue 2 (UX):** TaskNode context menu gains a new **"Add next task"** item (sequential chain successor — same `parentTaskId` as source, one `task.next` edge from source). The existing "Add sibling task" is renamed **"Add parallel task"** to disambiguate. "Add subtask" is unchanged. New command: `task.addNext`.
3. **Issue 3 (Clock day-anchored rendering):** ClockNode is rewritten to project anchored chains onto a wall-clock 12-hour dial for a user-selected day. `ClockState` gains `selectedDate: string` (YYYY-MM-DD). Arc geometry consumes `selectScheduledTasksForRange(board, dayStart, dayEnd)` from ADR 0003. **Break arcs survive** via a parallel read of `selectTimeline` for the still-visible chain (option A in §6 below) — Clock keeps its existing break-visibility divergence from Calendar. Unanchored todos render an empty dial with a hint message. No fallback to relative-time rendering.
4. **Issue 4 (concentric rings):** Parallel-group branches paint at concentric radii. Outermost branch is `branch[0]`. Per-branch radius offset: `PARALLEL_OFFSET = 12px`. Stroke width is reduced from 18 to 10 for parallel branches so concentric rings have visible gaps; non-parallel tasks keep `strokeWidth = 18` at the default radius. Branches beyond 4 collapse onto the innermost concentric ring with `mixBlendMode: multiply` (the old behaviour, now degrade-only). No `+N` indicator in v1.

All four are binding.

---

## Contract

### 1. Issue 1 — Delete `migrateTaskChain`

**File:** `src/main/persistence/board.ts`

- Delete the function body and its call site in the migration pipeline. The function is at lines 146-186 in HEAD; the call site lives in the `loadBoardFrom` chain (search for `migrateTaskChain(`).
- Do not gate, do not preserve as dead code, do not leave a comment "in case we need it." The git history is the archive.

**Rationale:** the migration's heuristic ("if a task has no incoming `task.next` edge it must be the chain head, rebuild linear by createdAt") is wrong for every board produced after Decision 22.2 (which introduced explicit parallel forks). The destructive filter — `cleaned = edgeArr.filter(e => !taskIds.has(e.to.nodeId))` — drops every fork edge before rebuilding. There is no salvageable signal: a board with zero `task.next` edges and multiple tasks could be a legacy v0 board needing a chain or a mid-edit user-disconnected set. Guessing wrong (the current behaviour) silently destroys data; guessing right (the proposed gate) just makes the wrong guess fire less often. The correct answer is "don't guess."

**Regression test (binding):**

- File: `tests/unit/main/board.persistence.test.ts` (extend the existing file; confirm path with first read).
- Case name: `'preserves parallel task.next forks across save/load'`.
- Fixture: a board with three `todo.task` nodes (taskA, taskB, taskC) and two edges `taskA -task.next-> taskB`, `taskA -task.next-> taskC` (a fork). All three share the same `parentTodoId`.
- Procedure: serialise via `boardSave`-equivalent, then `loadBoardFrom` the result, then assert: both fork edges survive verbatim by `id`, AND no `edge-chain-*` edges have been synthesised. Use `expect.arrayContaining` on edge ids.
- Run the test before deletion to confirm it fails (proves the bug), then after to confirm it passes.

### 2. Issue 2 — TaskNode context menu redesign

**File: `src/renderer/components/nodes/TaskNode/index.tsx`** (around lines 333-365).

The `ctxItems` array becomes (in this order):

1. **Edit text** — unchanged.
2. **Add subtask** — unchanged. (`parentTaskId = source.id`. Rolls into parent's plannedMin per Decision 24 Q1.)
3. **Add next task** — NEW. Dispatches the new command `task.addNext`. Disabled when `state.done`.
4. **Add parallel task** — RENAMED from "Add sibling task". Same handler as today (`setInlineMode('sibling')` — keep the internal mode name `'sibling'` to avoid churning the inline-editor state machine; only the visible label changes).
5. **Delete** — unchanged.

**New command: `task.addNext`.** Handler lives in `src/renderer/components/Canvas/commandDispatch.ts` alongside `task.addSubtask` (the existing handler at line 800). Behaviour:

- Target: a `'todo.task'` node, `nodeId` = source.
- Args: `{ text: string; durationMin?: number }`.
- Creates a new `todo.task` node with:
  - `parentTodoId = source.parentTodoId`
  - `parentTaskId = source.parentTaskId` (**not** `source.id` — the new task is at the same chain level, not a child)
  - `layer = source.layer` (same level)
  - `sequenceNumber` = (count of siblings sharing same `parentTodoId` + `parentTaskId`) + 1
  - `plannedMin`/`durationMin` = `args.durationMin ?? source.plannedMin ?? source.durationMin`
  - Position: `{ x: source.x + 252, y: source.y }` (one card width to the right; horizontal flow). Mirrors the visual grammar of existing chain edges.
- Creates a single `task.next` edge: `source -task.next-> newTask`.
- Also appends a new `TodoItem` to the parent TodoNode (bidirectional link, same as `task.addSubtask` does — see lines 829-846).
- Persists via `addNode` + `addEdge` + `boardSave`, identical to `task.addSubtask`'s tail.

**Difference from "Add parallel task":** parallel replicates the source's incoming and outgoing edges so the new task runs concurrently with the source; "Add next task" creates a single forward edge so the new task runs **after** the source.

**Label-rename touchpoints (no behavioural change):**

- `TaskNode/index.tsx` ctxItems: `'Add sibling task'` → `'Add parallel task'`.
- Any test that asserts the menu label by string match. Grep `'Add sibling task'` across `tests/` and update.
- The internal mode name (`'sibling'`) and the boardStore method (`insertSiblingTaskAfter`) **stay as-is.** They are not user-visible and renaming them invites needless churn. A comment near `insertSiblingTaskAfter` notes: "UI label is 'Add parallel task' since ADR 0004; internal name retained for stability."

### 3. Issue 3 — ClockState extension

**File: `src/renderer/components/nodes/ClockNode/types.ts`** — extend:

```ts
export interface ClockState {
  linkedTodoId: string | null;
  viewWindow: 0 | 1;
  /** ADR 0004 §3 — selected day for wall-clock projection.
   *  YYYY-MM-DD, local. Independent of CalendarState — see §3.1 below. */
  selectedDate: string;
}

export const defaultClockState = (): ClockState => ({
  linkedTodoId: null,
  viewWindow: 0,
  selectedDate: todayLocalYMD(),
});
```

Add `todayLocalYMD` helper if not already importable from a shared util. `STATE_DEFAULTS['clock']` in `src/main/persistence/board.ts` mirrors the same default, so pre-ADR-0004 boards heal cleanly on next load.

#### 3.1 Independence from CalendarState

ClockNode owns its own `selectedDate`. It does **not** read `CalendarState.selectedDate` or `CalendarState.anchorDate`. Rationale:

- Cross-mother coupling would break Clock when no Calendar exists on the board (a user can delete a mother; mothers are not required by the kernel).
- Symmetric to ADR 0001's CalendarState pattern — each viewer owns its temporal cursor.
- A future polish can add a "sync to calendar" toggle if users ask; doing it by default removes user control.

#### 3.2 New ClockNode commands

| Command | Args | Behaviour |
|---|---|---|
| `clock.setSelectedDate` | `{ date: string }` | Validate YYYY-MM-DD; mutate `state.selectedDate`. |
| `clock.advanceDay` | `{ delta: -1 \| 1 }` | Add/subtract one day from `state.selectedDate` via local Date arithmetic. |
| `clock.goToday` | `{}` | Set `state.selectedDate = todayLocalYMD()`. |

Existing commands (`clock.linkTodo`, `clock.setViewWindow`) are unchanged.

#### 3.3 Day-selector UI

A new row above the SVG dial inside ClockNode's body:

```
[ ← ]  Wed 2026-05-14  [TODAY]  [ → ]
```

- Left/right arrow buttons dispatch `clock.advanceDay` with delta `-1` / `+1`.
- Label is `dayOfWeekShort + ' ' + selectedDate` (e.g. `Wed 2026-05-14`).
- `[TODAY]` is a small mono-styled button (same `controlBtnStyle` used by the existing 12h toggle); dispatches `clock.goToday`. Disabled when `selectedDate === todayLocalYMD()`.
- Layout: flex row, gap 8px, justify-content: center.

#### 3.4 Arc geometry — switch to wall-clock projection

Replace the `renderableSegments` + `arcs` construction in `ClockNode/index.tsx` with:

1. Compute the day window: `dayStartISO = selectedDate + 'T00:00'`; `dayEndISO = nextDay(selectedDate) + 'T00:00'`.
2. Fetch task placements: `const placements = selectScheduledTasksForRange(board, dayStartISO, dayEndISO);`. The placement shape does **not** carry `parentTodoId`, so ClockNode performs the filter inline: for each placement, look up `board.nodes.find(n => n.id === placement.taskId)?.state.parentTodoId` and keep only placements where that equals `linkedTodoId`. (Build a `Map<taskId, parentTodoId>` once per render to avoid quadratic cost.)
3. For each placement, derive `startMinOfDay` and `endMinOfDay`:
   - `startMinOfDay = max(0, minutesFromMidnight(placement.startISO))`.
   - `endMinOfDay = min(1440, minutesFromMidnight(placement.endISO))`. (If endISO is on the next day — anchor near midnight with a chain that spills over — clip at midnight. No wraparound. Consistent with ADR 0003 §"Forecloses" on cross-midnight.)
   - If `endMinOfDay <= startMinOfDay`, skip.
4. The existing `viewWindow` (0 or 1) and `TOTAL_MIN = 720` semantics survive — the meaning shifts from "minutes 0–720 of chain" to "minutes 0–720 (or 720–1440) of the selected day." The 0h–12h / 12h–24h toggle still works.
5. For each placement inside the window, compute `arcLength` and `startOffset` from `startMinOfDay - windowStart` and `endMinOfDay - startMinOfDay` (same formula shape as today, just sourced from wall-clock minutes).

The hour-label ring (`ticks` array, lines 83-98) already labels hours as `effectiveWindow * 12 + i`, which is exactly the wall-clock hour. No change there. The `i === 0` top position will now correspond to **midnight or noon** of the selected day depending on `viewWindow`, instead of "minute zero of the chain."

#### 3.5 Break arcs — keep visible (option A)

ClockNode keeps its break visibility from `selectTimeline`. ADR 0003 §4 explicitly preserved this divergence ("ClockNode shows planning-time including breaks; Calendar shows wall-clock placements. Do not 'fix' it."). Rewriting the Clock onto `selectSchedule` alone would silently delete break arcs — a regression the user did not request.

**Binding render rule:** ClockNode reads **both** selectors:

- `selectScheduledTasksForRange` → task placements (wall-clock positions on the dial).
- `selectTimeline(board, linkedTodoId)` → break segments only. Break segments are projected onto the dial by anchoring them to the wall-clock end of their preceding task. Algorithm:
  1. From the timeline, gather break segments in chain order; each carries `afterTaskId`.
  2. For each break, look up `placements.get(break.afterTaskId)` (from `selectSchedule`). If absent (the predecessor task is on a different day or not anchored), the break is **not rendered**. This is intentional — a break has no wall-clock home when its predecessor is off-screen.
  3. If present, the break paints starting at `predecessorPlacement.endISO`, spanning `break.endMin - break.startMin` minutes. Clip at the window edges identically to task arcs.

**Break radius — collision avoidance with ADR 0003 §3.6.** Per ADR 0003 §3.6, successor task placements start exactly at the predecessor's `endISO` (back-to-back, no calendar-time gap). Painting the break at the task ring (`R = 108`) would put the break arc and the next task's arc on the same radius at the same wall-clock minutes — the break would be invisible. To preserve the existing visual divergence, **break arcs render at `BREAK_R = R - 16 = 92`** (inside the task ring), with stroke widths preserved from today's spec (6 for short, 10 for long break — see `BREAK_TOKENS` and lines 244-264 of `ClockNode/index.tsx`). The visual reads as "the next task starts immediately on the outer ring; the break sits on an inner ring at the same wall-clock minutes." This is the v1 break visualisation on the day-anchored Clock and is the binding interpretation of "option A."

This keeps the divergence intact (Calendar drops breaks; Clock keeps them) without expanding `selectSchedule`'s surface (it does not need to know about breaks).

#### 3.6 Unanchored / empty-day rendering

If `linkedTodoId === null` OR the day has zero placements:

- Render the dial outline, tick marks, and centre dot unchanged.
- Do **not** fall back to `selectTimeline`'s relative-time rendering. (The user explicitly reported the old relative-time view as confusing — that fallback is what made the Clock-Calendar inconsistency invisible.)
- Below the SVG, render a hint: `"Drop a task on the calendar to anchor this todo."` Style: `fontSize: 11, color: var(--ink-3), fontFamily: var(--font-mono), textAlign: center`. Show only when `linkedTodoId !== null` and zero placements; if `linkedTodoId === null`, the existing "Link Todo" picker already serves as the hint.

#### 3.7 Existing 12h toggle — behaviour preserved

The `clock.setViewWindow` command stays. Its disable condition shifts: instead of `totalMin > TOTAL_MIN` (chain length), the toggle is **always enabled** in v1 (the dial can flip between 0h–12h and 12h–24h of any day, regardless of whether the day has placements in both halves). The defensive `effectiveWindow` clamp (line 61) is removed — the user explicitly chose a day, and force-flipping windows now would be the wrong correction.

**Empty-window rule:** if the selected day has placements only in one 12h half and the user has the other half selected, the dial renders empty (ticks + outline only) **without auto-flipping.** The user clicks the toggle to navigate. This is symmetric with the day-selector (no auto-pick of "the day that has tasks") and consistent with the user-controlled cursor model.

### 4. Issue 4 — Concentric rings for parallel branches

#### 4.1 Geometry

- Base radius (non-parallel and degraded branches): `R = 108` (unchanged).
- Per-branch radius offset: `PARALLEL_OFFSET = 12` CSS px. Branch `i` paints at radius `R + (i * PARALLEL_OFFSET)`. **Outermost branch is `branch[0]`** — matches the user's "first branch is most prominent" mental model and the existing branch enumeration in `walkChain`.
- Stroke width: `18` for non-parallel tasks (today's value); `10` for parallel branches. The reduced stroke gives `12 - 10 = 2px` of visible gap between concentric rings.
- Maximum concentric branches: **4**. Branches with index `>= 4` paint on the innermost concentric ring (`R + 3 * PARALLEL_OFFSET`) with `mixBlendMode: 'multiply'` — the old overlap behaviour, now degrade-only. No `+N` indicator in v1.

#### 4.2 Selector contribution — branch index

`scheduleSelector.ts` already emits `parallelGroupId` on each placement. It does **not** emit a per-branch index today. ClockNode needs the branch index to compute the radius.

**Binding addition to `ScheduledTaskPlacement`:**

```ts
export interface ScheduledTaskPlacement {
  taskId: string;
  startISO: string;
  endISO: string;
  anchorTaskId: string;
  parallelGroupId: string | null;
  /** ADR 0004 §4.2 — 0-based index of this branch within its parallel group.
   *  Null iff parallelGroupId is null. Stability guarantee: whatever order
   *  `chainWalker.walkChain` emits for `unit.branches` IS the canonical order
   *  for this index. (As of writing, that order is the unvisited-set order
   *  determined by `nextsOf(...)` traversal; treat it as opaque — the
   *  contract is "matches walkChain's branch enumeration," not a sort key.) */
  parallelBranchIndex: number | null;
  isAnchor: boolean;
}
```

Implementation note for backend-dev: inside `scheduleSelector.build` (the `unit.kind === 'group'` branch around lines 271-288 of the current file), iterate `unit.branches.entries()` and pass `idx` to the placement. Set `parallelBranchIndex: idx`. For task units, set `parallelBranchIndex: null`.

This is an additive change — existing consumers (WeekView, MonthView) ignore the new field. The single new caller is ClockNode.

#### 4.3 Render rule

In `ClockNode/index.tsx`, replace the existing `arcs.map` body's radius/strokeWidth choice with:

```ts
const isParallel = placement.parallelGroupId !== null;
const branchIdx = placement.parallelBranchIndex ?? 0;
const clampedIdx = Math.min(branchIdx, 3); // 4+ collapse to innermost
const radius = isParallel ? R + clampedIdx * PARALLEL_OFFSET : R;
const strokeW = isParallel ? 10 : 18;
const useMultiply = isParallel && branchIdx >= 4;
```

Render the `<circle>` at `r={radius}` with `strokeWidth={strokeW}` and `mixBlendMode: useMultiply ? 'multiply' : undefined`.

#### 4.4 Multiple parallel groups in one day

Two parallel groups at different time windows (e.g. group X anchored 10:00, group Y anchored 14:00) lay out independently. Each group's branches occupy their own arc range on the dial, with their own concentric stack. The `parallelGroupId` already discriminates branches across groups; the branch index is local to each group. No cross-group geometry interactions.

#### 4.5 Done-state opacity

`opacity: seg.done ? 0.4 : 1` (today's rule, line 279) carries over unchanged. Concentric rings keep the done-fade.

#### 4.6 Interaction with break ring

Break arcs render at `BREAK_R = R - 16 = 92` (§3.5) — independent of `R` and of `PARALLEL_OFFSET`. Concentric parallel-branch rings extend **outward** from `R` (radii `R + i * 12`), so breaks (inside) and parallel branches (outside) never share a radius. This is geometrically clean and matches the user's mental model: parallel branches fan outward (more prominent); breaks tuck inward (less prominent, ambient).

### 5. Files affected (binding)

**Modified:**

- `src/main/persistence/board.ts` — delete `migrateTaskChain` and its call site.
- `src/renderer/components/nodes/TaskNode/index.tsx` — add "Add next task" to `ctxItems`; rename label "Add sibling task" → "Add parallel task".
- `src/renderer/components/Canvas/commandDispatch.ts` — register `task.addNext` handler alongside `task.addSubtask` (~line 800). Also register the three new Clock commands: `clock.setSelectedDate`, `clock.advanceDay`, `clock.goToday`.
- `src/renderer/components/nodes/ClockNode/types.ts` — extend `ClockState` with `selectedDate: string`.
- `src/renderer/components/nodes/ClockNode/index.tsx` — full rewrite of the day-anchored arc geometry, day-selector UI, dual-selector read for break preservation, concentric-ring radius logic.
- `src/renderer/store/scheduleSelector.ts` — add `parallelBranchIndex` to `ScheduledTaskPlacement`; populate inside the group-unit branch.
- `src/renderer/store/timelineSelector.ts` — unchanged.

**Tests (new / updated):**

- `tests/unit/main/board.persistence.test.ts` — add fork-survival regression test (§1).
- `tests/unit/renderer/scheduleSelector.test.ts` — assert `parallelBranchIndex` matches branch order for a 3-branch parallel group; null for non-parallel placements.
- `tests/unit/renderer/ClockNode.test.tsx` (new file if absent) — at minimum:
  1. With one anchored task at 14:00 on `selectedDate`, an arc renders at the 2-o'clock position on `viewWindow = 1` (12h–24h) and nothing on `viewWindow = 0`.
  2. With a parallel group of two branches anchored at 10:00, two arcs render at radii `R` and `R + 12` (outermost is `branch[0]`).
  3. With no anchored placements and a linked todo, the hint message renders and no arcs paint.
  4. `clock.advanceDay` with `delta: 1` updates `selectedDate` to the next day's YYYY-MM-DD.
- TaskNode menu test (existing — find via `grep "Add sibling task"`) updated to assert "Add parallel task" and the new "Add next task".
- `commandDispatch.test.ts` (or equivalent) — add a unit test for `task.addNext`: dispatching against a source task creates one new node with matching `parentTaskId`, one new `task.next` edge from source, and one new TodoItem.

**Not modified (deliberate):**

- `src/renderer/components/nodes/CalendarNode/WeekView.tsx`, `MonthView.tsx` — Calendar already consumes `selectScheduledTasksForRange`; the new `parallelBranchIndex` field is additive and ignored.
- `src/renderer/store/chainWalker.ts` — branch order already stable (sorted by branch root taskId ascending per ADR 0003 §2). No change.
- `src/renderer/store/boardStore.ts` — `insertSiblingTaskAfter` keeps its name. UI-label-only rename.

### 6. Open design questions resolved

| Q | Resolution |
|---|---|
| Migration: delete vs gate | **Delete.** Heuristic was never correct; gating makes the wrong guess fire less often, not more correctly. Regression test locks fork survival. |
| Subtask UX | **Add a fourth menu item.** "Add next task" (sequential chain successor) is the missing affordance. "Add subtask" keeps its hidden-roll-up semantics; "Add parallel task" (renamed) keeps replicated-edge semantics. Four items, one clean answer. |
| Clock day cursor: own field vs cross-mother read | **Own field.** `ClockState.selectedDate`. Independent of `CalendarState.selectedDate` for the reasons in §3.1. |
| Break visibility on Clock | **Option A — keep, via dual selector read.** Clock reads `selectScheduledTasksForRange` for task placements and `selectTimeline` for break shapes. Preserves the documented divergence in ADR 0003 §4. Calendar drops breaks; Clock keeps them. |
| Unanchored fallback | **No fallback.** Empty dial + hint message. Old relative-time view was the user-reported confusion source. |
| Concentric direction | **Outermost = branch[0].** First branch is most prominent visually. |
| Max concentric branches | **4.** Branches 5+ collapse onto innermost ring with multiply blend (degrade-only). No `+N` indicator in v1. |
| Cross-midnight chains | **Clip at midnight.** Consistent with ADR 0003 §"Forecloses" on cross-midnight cascades. |
| Sub-hour anchor times (e.g. anchored at 14:23) | Supported — `selectScheduledTasksForRange` already emits sub-hour ISO times; the arc-length math is minute-precise. The tick ring only labels whole hours; the arc starts at the exact minute. |

---

## Consequences

**Enables:**

- The Clock becomes a true day-projection view: anchored chains paint at wall-clock positions, parallel branches separate visually, the user can navigate days. Together with the Calendar (ADR 0001) and the cascade selector (ADR 0003), KRNL0 now has a coherent "where does my plan live in time" story across three views.
- The migration deletion removes the only known data-destroying code path on board load.
- `task.addNext` closes the "I created a task, where did it go" loop — every menu item now produces a visible result.
- `parallelBranchIndex` on `ScheduledTaskPlacement` is reusable by any future view that wants to render parallel-group lanes (e.g. a Gantt strip in Calendar's WeekView).

**Forecloses (deferred, out of v1 scope):**

- Cross-midnight chain projection on the Clock (chains that genuinely span days). Same posture as Calendar.
- A `+N` indicator for parallel groups with more than 4 branches. Degrade is silent in v1; a future ADR can add a count badge.
- Cross-mother sync between Clock and Calendar selected dates (no auto-sync; users navigate each independently).
- Sub-hour tick labels on the dial. The dial labels hours only; sub-hour positions are visible but unlabelled.
- A "schedule chain from root at <time>" action (mentioned in ADR 0003 §6). Still out of scope.

**Risks accepted:**

- Deleting the migration cannot be undone if a v0-era board exists in the wild that genuinely depended on the synthetic chain. The user has confirmed all current boards have proper edges; the regression test locks the new behaviour. If a pre-v1 user surfaces post-launch, a one-off heal script is the answer, not a re-enabled migration.
- The "Add subtask" item remains in the menu despite producing no visible timeline result. We considered removing it, but subtasks still roll up plannedMin into the parent (Decision 24 Q1) which is a real planning use case. Naming it "Add subtask (rolls into parent)" was rejected as menu clutter; the new "Add next task" provides the obvious user-visible alternative.
- Dual-selector read in ClockNode (both `selectScheduledTasksForRange` and `selectTimeline`) doubles the selector dependency surface. Both are reference-identity-memoized; the cost is negligible. The alternative (extending `selectSchedule` to emit break placements) widens that selector's surface beyond ADR 0003's lock and would force Calendar to filter breaks out.
- Reducing stroke width to 10 for parallel branches makes single-task arcs and parallel arcs visually different (18 vs 10). Acceptable: parallelism is itself a visual signal, and the user asked for separation, not uniformity.
- The 4-branch cap is a heuristic; users with a 5-way parallel group will see the 5th branch overlap the 4th. The collapse-to-multiply degrade is the same UX the user complained about, just confined to the rare 5+ case. Adopting a "+N more" indicator is a clean follow-up.

---

## Alternatives rejected

- **Gate `migrateTaskChain` on "zero `task.next` edges exist."** Rejected (§1 rationale). The heuristic is wrong; gating just makes it fire less, not more correctly.
- **Rename `insertSiblingTaskAfter` to `insertParallelTaskAfter` in `boardStore.ts`.** Rejected — internal-only naming churn; the public surface is the menu label.
- **Make subtasks visible on the timeline.** Rejected — would invert Decision 24 Q1's contract that subtasks roll up into the parent's plannedMin. The planning model depends on the roll-up; surfacing them would either double-count time (subtask + parent on the dial) or replace the parent's arc (a separate, larger UX rework).
- **Drop breaks from the Clock (option B).** Rejected — silent regression of ADR 0003 §4's documented divergence.
- **Extend `selectSchedule` to emit break placements (option C).** Rejected — widens that selector beyond ADR 0003's lock and forces every other consumer (Calendar week/month views) to filter breaks out. The dual-read pattern in ClockNode is the cheaper and more local fix.
- **Cross-mother read of `CalendarState.selectedDate` for the clock's day cursor.** Rejected — couples nodes that should be independently navigable (§3.1).
- **`PARALLEL_OFFSET = 8` keeping `strokeWidth = 18` on parallel branches.** Rejected — 8px offset on an 18px stroke means rings overlap by 10px, defeating the user's intent. The chosen `12 - 10 = 2px` gap reads cleanly.
- **Concentric direction reversed (innermost = branch[0]).** Rejected — branch[0] is the "first" branch in `walkChain`'s sorted order and is the visual anchor; placing it outermost gives it visual prominence.
- **A "+N more" badge for 5+ parallel branches.** Deferred — useful but adds an icon/text geometry to the dial that needs its own UX pass. The multiply-degrade is acceptable for the rare case.

---

## Slice ordering recommended for backend-dev

1. **Bug-fix slice (Issue 1, standalone PR):** delete `migrateTaskChain` + call site; add the fork-survival regression test. Smallest possible diff. Ships first.
2. **Menu UX slice (Issue 2, standalone PR):** add `task.addNext` command handler in `commandDispatch.ts`; add the "Add next task" menu item and rename "Add sibling task" → "Add parallel task" in `TaskNode/index.tsx`. Update any tests that match the old label string. Ships independently of the Clock work.
3. **Selector slice (Issue 4 data prep):** add `parallelBranchIndex: number | null` to `ScheduledTaskPlacement` and populate it in `scheduleSelector.build`. Extend `scheduleSelector.test.ts` to assert ordering. This slice is a data-only change with no UI effect; landing it first de-risks the Clock render slice.
4. **Clock state + commands slice (Issue 3 part 1):** extend `ClockState` with `selectedDate`; backfill `STATE_DEFAULTS['clock']` in `board.ts`; register `clock.setSelectedDate`, `clock.advanceDay`, `clock.goToday` commands. No render changes yet. Day-selector UI can ship in this slice or the next — backend-dev's call based on diff size.
5. **Clock render slice (Issue 3 part 2 + Issue 4 render):** rewrite ClockNode's arc geometry to consume `selectScheduledTasksForRange` + `selectTimeline` (dual read); add concentric-ring radius logic using `parallelBranchIndex`; render the day-selector UI if not already in slice 4; render the empty-day hint. Largest slice — ships last because every preceding slice is a prerequisite.

Slices 1 and 2 are fully independent of 3–5 and may be parallelised or interleaved. Slices 3 → 4 → 5 are strictly sequential.
