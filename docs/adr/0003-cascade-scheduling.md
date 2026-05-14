# ADR 0003 — Cascade scheduling: one anchor per chain, derive successors

**Date:** 2026-05-14
**Status:** Accepted (architect sign-off — implementation may begin)
**Author:** architect
**Cross-reference:** also tracked in `docs/03-architecture/decisions.md` as Decision 25.
**Supersedes:** nothing. Extends ADR 0001 §3 (`scheduledFor` field semantics) and Decision 24 (Unified Task Timeline Selector).

---

## Context

ADR 0001 introduced `TaskState.scheduledFor` as an optional per-task ISO datetime, written by drop-to-schedule in WeekView. Today each `task.setSchedule` only mutates one task — chain-linked successors stay unscheduled until the user drops each one manually. The user wants **scheduling one task to automatically place its entire `task.next` successor graph back-to-back** (parallel forks share a start time), with calendar and clock reading from one source of truth.

Decision 24 already established the pattern: derive timeline-shaped data from `task.next` edges + `plannedMin` via a pure memoized selector (`selectTimeline`). ClockNode is already the v1 consumer. Calendar still reads `scheduledFor` directly (ADR 0001 §3 + WeekView.tsx:157-182). This ADR closes that gap and locks the contract for the cascade.

The seven open questions in the brief discriminate between three families of design: eager write-fanout (denormalized), pure-derived (SSOT), and hybrid. Each affects every consumer that touches `scheduledFor`.

## Decision

Adopt **single-anchor cascade scheduling**, derived at read time. The dropped task's `scheduledFor` is the **only** persisted time in its chain; all successor times are computed by a new pure selector `selectSchedule(board)` that walks the `task.next` DAG from each anchored root and emits a `Map<taskId, { startISO, endISO, parallelGroupId? }>`. Calendar (week + month), Clock (no time anchor needed — already pure-derived), and any future view read from this selector. Direct reads of `TaskState.scheduledFor` for the purpose of placing tasks on a calendar are **forbidden** for backend-dev from this ADR forward.

The chain-walking logic (`walkChain`, `WalkUnit`, `buildChainIndex`) is **extracted** from `timelineSelector.ts` to a new shared module `src/renderer/store/chainWalker.ts`. Both selectors import from it. This is a deliberate, scoped exception to hard rule #2 (no cross-import between selector modules) — the alternative is a duplicated ~200-line fork/convergence walker, which is a correctness time bomb.

## Contract

### 1. Invariant: one anchor per chain

A **chain** is a connected component of the `task.next` DAG restricted to tasks within a single todo. At any moment, **at most one task in a chain has `scheduledFor !== undefined`**. That task is the chain's **anchor**.

Backend-dev must enforce this invariant on every write that touches a `scheduledFor` field:

- `task.setSchedule` with `scheduledFor !== null`:
  1. Determine the chain containing the target task using `chainWalker.buildChainIndex(board.edges)` + the existing reachability traversal already used by `selectTaskChain`.
  2. For **every other task in that chain** whose `scheduledFor` is set, dispatch a `task.setSchedule` clear (`scheduledFor: null`) **before** writing the new anchor. Mirror the clear to the linked `TodoItem` using the same path as ADR 0001 §6.
  3. Write the new anchor on the target task.
- `task.setSchedule` with `scheduledFor: null`: clears the anchor on the target only. The chain becomes unscheduled. No fanout.

This is the only invariant that keeps the derived successor times well-defined. It is also the only invariant that keeps WeekView's existing `if (!st.scheduledFor) continue` filter from showing the same task twice (anchor + derived placement).

### 2. New module `src/renderer/store/chainWalker.ts`

Move the following symbols **out** of `src/renderer/store/timelineSelector.ts` into the new module, exporting each:

- `ChainEntry` (interface)
- `buildChainIndex` (function)
- `WalkUnit` (discriminated union type — keep as `'task' | 'group'`)
- `walkChain` (function)
- `BranchEntry` (type, if needed at the export boundary)

`timelineSelector.ts` imports them from `chainWalker.ts`. No behavioural change to `selectTimeline`. The existing 18 `timelineSelector.test.ts` cases must continue to pass without modification — this is the regression seatbelt for the extraction.

The new module is **not** a "selector" — it produces no memoized output. It is a pure-function helper used by selectors. Hard rule #2 forbids cross-selector imports; it does not forbid both selectors importing from a shared pure helper. This is the same shape as `src/renderer/components/nodes/HabitNode/types.ts` exporting `toYMD`/`getMondayOf` to multiple consumers.

### 3. New selector `src/renderer/store/scheduleSelector.ts`

```ts
import type { Board } from '../../shared/types';

export interface ScheduledTaskPlacement {
  taskId: string;
  startISO: string;        // ISO 8601 local datetime
  endISO: string;          // startISO + plannedMin
  anchorTaskId: string;    // the task whose scheduledFor produced this chain's placement
  parallelGroupId: string | null;
  isAnchor: boolean;       // true iff taskId === anchorTaskId
}

export interface ScheduleResult {
  placements: ReadonlyMap<string, ScheduledTaskPlacement>;
  computedAt: number;
}

export function selectSchedule(board: Board | null): ScheduleResult;
export function selectScheduledTasksForRange(
  board: Board | null,
  fromISO: string,   // inclusive
  toISO: string,     // exclusive
): readonly ScheduledTaskPlacement[];
```

**Semantics:**

1. For each todo, find anchored tasks (tasks with `scheduledFor !== undefined`).
2. Per the invariant in §1, each chain has at most one anchor. If a corrupt board violates this (defence-in-depth), use the **earliest** `scheduledFor` and warn once in dev (`console.warn` gated on `import.meta.env.DEV`).
3. Build the chain index and run `walkChain` for that todo (same walk Clock already uses — same ordering, same fork/convergence semantics).
4. Truncate the walk to start from the anchor's `WalkUnit`. Walk units **before** the anchor are excluded from the schedule entirely (predecessors of a mid-chain anchor are unscheduled — see §6 below).
5. Compute `startISO` for each remaining unit using `anchor.scheduledFor + cumulative plannedMin` of preceding units. Parallel-group branches share `startISO`; group cumulative cost is `max(branch.plannedMin)` (already how `walkChain` reports `groupEnd`). Subtasks (`parentTaskId !== null`) are never placed (already excluded by `walkChain`).
6. **Breaks are invisible.** `walkChain` emits break units; `selectSchedule` skips them in cumulative-time computation. Calendar time between consecutive tasks equals the predecessor's `plannedMin` exactly. (See Q4 below.)
7. `endISO = startISO + (clampPlanned(scheduledDurationMin ?? plannedMin)) minutes`. The optional `scheduledDurationMin` from ADR 0001 §3 still wins on the anchor's own block; successors use their own `plannedMin` (no fanout of duration overrides — minimal surface for v1).

**Memoization:** module-level reference-identity cache on `(board.nodes, board.edges)`. Same pattern as `selectTimeline`. Pomo config is **not** a memo key here because breaks don't consume calendar time.

**Range helper:** `selectScheduledTasksForRange` is the consumer-facing convenience used by WeekView/MonthView. Implementation: call `selectSchedule(board)`, filter placements whose `[startISO, endISO)` intersects `[fromISO, toISO)`. Memoization is on the underlying `selectSchedule` only; the range filter is cheap.

### 4. Consumer migration (binding for backend-dev)

Two paint sites change:

- **`src/renderer/components/nodes/CalendarNode/WeekView.tsx:157-182`** — the `scheduledTasks` useShallow selector. Replace the raw `n.state.scheduledFor` read with a call to `selectScheduledTasksForRange(board, weekStartISO, weekEndISO)`. The `ScheduledTask` row shape adds an `isAnchor: boolean` flag (used in §7 below) and otherwise stays identical: `text`, `scheduledFor` (renamed to `startISO` at the boundary — see Q7 file list), `scheduledDurationMin`, `plannedMin`.
- **`src/renderer/components/nodes/CalendarNode/MonthView.tsx`** — same swap. The `ScheduledTask` shape uses `startISO` for the day-bucket key.

ClockNode does **not** change. It is anchor-agnostic — it already shows the chain's relative time from `selectTimeline`.

No other consumer of `scheduledFor` exists in renderer code outside these two views. Backend-dev must grep `scheduledFor` across `src/renderer/components` after the change and confirm no remaining direct reads for rendering purposes. Reads for write-paths (the `task.setSchedule` mirror in `commandDispatch.ts`, the TaskNode UI showing "scheduled at X" badge on the anchor itself) remain — the rule is "no direct reads for **placing tasks on a calendar/timeline**."

### 5. Multi-anchor data shape

Multiple chains independently anchored is the normal case (chain A anchored 14:00 Monday, chain B anchored 09:00 Tuesday). The data shape needs no special handling: `selectSchedule` iterates todos, then iterates anchored chains within each todo. The result `Map` is keyed by `taskId`, so collisions between unrelated chains are impossible by construction. `anchorTaskId` on each placement lets WeekView render the anchor's block with a distinct outline if desired (cosmetic; v1 may show all blocks identically).

### 6. Mid-chain drop (predecessor handling)

If the user drops `task2` (which has predecessors in the chain), the anchor moves to `task2`. **`task1` (and all predecessors) become unscheduled** — they vanish from the calendar. They are not back-computed to `task2.start − task1.plannedMin`.

Rationale: back-computing is dishonest. If the user later edits `task1.plannedMin`, a back-computed start either silently shifts (and conflicts with whatever was at the new slot) or drifts out of date (and shows stale time). The user's mental model "drop where I want it to start" wins: the dropped task is where time starts; everything upstream is a planning artifact that hasn't been placed yet.

Backend-dev does **not** implement a UI affordance to re-anchor at the chain root in v1. A future ADR may add a "schedule chain from root at <time>" action that computes `rootScheduledFor = task2.scheduledFor − cumulative(predecessors)` as an explicit user choice. Out of scope here.

### 7. Files affected (binding)

**New:**
- `src/renderer/store/chainWalker.ts` — extracted from `timelineSelector.ts`. Exports `ChainEntry`, `buildChainIndex`, `WalkUnit`, `walkChain`.
- `src/renderer/store/scheduleSelector.ts` — `selectSchedule`, `selectScheduledTasksForRange`, `ScheduledTaskPlacement`, `ScheduleResult`.
- `tests/unit/renderer/scheduleSelector.test.ts` — minimum cases enumerated below.
- `tests/unit/renderer/chainWalker.test.ts` — sanity tests for the extracted module (a subset of existing `timelineSelector.test.ts` reorientated against the new export surface; the original tests keep covering `selectTimeline`).

**Modified:**
- `src/renderer/store/timelineSelector.ts` — replace inline `buildChainIndex` + `walkChain` + types with `import { ... } from './chainWalker'`. Public API (`selectTimeline`, `selectTimelines`, `COLORS`, `TimelineSegment`, `Timeline`) unchanged. All existing tests pass without edits.
- `src/renderer/components/nodes/CalendarNode/WeekView.tsx` — swap raw `scheduledFor` read for `selectScheduledTasksForRange`. Adapt `ScheduledTask` row builder; render unchanged.
- `src/renderer/components/nodes/CalendarNode/MonthView.tsx` — same swap.
- `src/renderer/components/Canvas/commandDispatch.ts` — extend `task.setSchedule` handler (case for `'todo.task'` at line 216 and the cross-node router at line 920–959) to enforce the **one-anchor-per-chain** invariant: before writing `scheduledFor !== null`, walk the chain via `buildChainIndex`, find all other anchored tasks in the same chain, dispatch a clear (`scheduledFor: null`) to each (including TodoItem mirror per ADR 0001 §6), then write the new anchor. Wrap the clear+write in one `updateNode` batch where possible to avoid intermediate render flashes.
- `src/main/persistence/board.ts` — add `migrateNormalizeChainAnchors` (see §8). Wire it into the load pipeline at line 503 (the existing migration chain), running **after** `migrateNodeStates` so task states are already schema-healed.

**Not modified (deliberate):**
- `src/renderer/components/nodes/TaskNode/types.ts` — no field changes. `scheduledFor` and `scheduledDurationMin` semantics narrow (now means "anchor + optional override") but the field shapes are unchanged. Existing boards load without migration of types.
- `src/renderer/components/nodes/TaskNode/index.tsx` — TaskNode UI shows "scheduled at X" badge on anchors only. Successors' derived times are visible only on calendar views. v1 acceptable; a future polish can show successors' derived time on TaskNode itself via `selectSchedule`.
- `src/renderer/components/nodes/ClockNode/index.tsx` — anchor-agnostic; unchanged.

### 8. Back-compat migration

Existing boards may have multiple `scheduledFor` writes in one chain (the user manually scheduled task1 and task5 in the same chain before this ADR). Migration `migrateNormalizeChainAnchors`:

```ts
function migrateNormalizeChainAnchors(board: Record<string, unknown>): Record<string, unknown> {
  // For each connected component of task.next edges restricted to one todo:
  //   collect tasks with scheduledFor set
  //   if count > 1: keep the earliest scheduledFor; clear the rest (also clear linked TodoItem.scheduledFor)
  //   if count <= 1: no-op
}
```

Idempotent. Runs after `migrateNodeStates`. No `BoardSchema.version` bump — the persisted shape is unchanged; only the runtime invariant is tightened.

### 9. Pattern entry — "Shared pure-function helper extracted from selector"

Add to `docs/03-architecture/design-patterns.md` as a new short pattern (6.10) naming the exception: when two selectors need the same non-trivial pure helper, extract to a `*Walker.ts` / `*Helper.ts` module that **emits no memoized values**. Both selectors import from it. The rule "no cross-import between selector modules" is preserved because the helper is not a selector. First instance: `chainWalker.ts`.

### 10. CLI surface (forward-looking, not implemented here)

A future `krnl task schedule <taskId> <isoDatetime>` command in `src/shared/cli/commandRegistry.ts` will dispatch `task.setSchedule` through the existing shared dispatcher (Decision 23). Cascade propagation is automatic — the CLI does not need to know about chains. Out of scope for this ADR; mentioned to confirm the design supports it without new surface.

## Open questions resolved

| Q | Resolution |
|---|---|
| Q1 | **(B) Pure-derived.** One anchor stored on the dropped task; successors derived at read time. Cites Decision 24 precedent — no new persisted fields. |
| Q2 | Anchor lives on `TaskState.scheduledFor` (the dropped task itself). No per-chain side structure. The "at most one anchor per chain" invariant is enforced in the write path. |
| Q3 | Reuse `walkChain` by **extracting** it to `chainWalker.ts`. Both `timelineSelector` and `scheduleSelector` import from it. Blessed exception to hard rule #2, documented as design pattern 6.10. |
| Q4 | Breaks are **invisible** to calendar — pure `plannedMin` sum. Clock still shows breaks (it always did). This is a documented divergence: ClockNode shows planning-time including breaks; Calendar shows wall-clock placements. Do not "fix" it. |
| Q5 | Multi-anchor handled by construction. `selectSchedule` iterates todos × anchored chains. Placement `Map` is keyed by `taskId` (unique across the board). |
| Q6 | Mid-chain drop re-anchors at the dropped task. Predecessors are cleared (become unscheduled). Back-computing predecessor times is explicitly rejected. |
| Q7 | New: `chainWalker.ts`, `scheduleSelector.ts`. Modified: `timelineSelector.ts`, `WeekView.tsx`, `MonthView.tsx`, `commandDispatch.ts`, `board.ts`. Not modified: `TaskState`/`TodoItem` types, ClockNode. |

## Consequences

**Enables:**
- Single source of truth for task placement on time. Calendar and Clock both derive from `chainWalker` output; ClockNode keeps its existing pomo-config-aware Timeline; Calendar gets cascade scheduling.
- Re-using `walkChain` means parallel-fork semantics are identical across Clock and Calendar — what the user sees on the ring is what they see on the calendar (modulo break visibility, §4).
- The forward-looking CLI command in §10 needs no extra plumbing.

**Forecloses (deferred, out of v1 scope):**
- Cross-midnight cascades (a 14h chain anchored at 22:00 spans into the next day). The math works; the v1 UI is single-day weeks. Backend-dev MUST NOT add wraparound logic.
- Multi-anchor-per-chain (e.g., user wants task1 at 09:00 and task5 at 16:00 in the same chain). The invariant rejects this. A future ADR may introduce "segmented chains" with multiple anchor points.
- Back-computed predecessor times (Q6).
- Successor-block resize propagating durations down the chain — durations are still per-task; resizing a successor block in WeekView would write `scheduledDurationMin` on that task, but the cascade still uses `plannedMin` for the next start. A polish item.
- CLI `task schedule` command (§10).

**Risks accepted:**
- The chainWalker extraction is a refactor of working code. The 18 existing `timelineSelector` tests are the regression seatbelt; if any fail post-extraction, the extraction is wrong, not the tests.
- Mid-chain drops silently unschedule predecessors. Backend-dev MUST add a brief inline comment at the dispatch site so a future reader doesn't think it's a bug. (No user-facing warning toast in v1 — the user just sees the predecessor disappear from the calendar.)
- Anchor invariant is enforced only at the dispatcher. A CLI mutation that bypasses the dispatcher (writing `scheduledFor` directly to `board.json`) could violate it; the load-time migration (§8) heals on next open.

## Alternatives rejected

- **(A) Eager write-fanout** — writing `scheduledFor` on every chained successor at schedule time. Rejected: every reorder (`task.next` edge add/remove), duration edit (`plannedMin` change), and parallel-group merge requires re-fanning the writes. Decision 24's pattern proved derived-at-read is correct here; eager-write would litter `scheduledFor` across the chain and require a "rebalance" pass on every mutation.
- **(C) Hybrid (per-chain anchor structure)** — adding a `Map<rootId, anchor>` to `BoardState`. Rejected: introduces a new persisted shape, requires a `BoardSchema.version` bump, splits ownership of "when is this scheduled" between the task and the chain structure. The single-anchor-on-task approach reuses the field ADR 0001 already locked.
- **Duplicating `walkChain` in `scheduleSelector.ts`** — faithful to hard rule #2 as originally written. Rejected: 200 lines of subtle fork/convergence logic in two places means every future bug fix lands in one but not the other. Pattern 6.10 (the new design-pattern entry) is the smaller deviation.
- **Breaks consume calendar time** — task2 starts at task1.end + breakMin. Rejected for v1: confusing on a 1-hour grid (a 5-min gap between two 25-min tasks doesn't align with cell boundaries), and ClockNode already shows breaks for users who want to see them.

## Slice ordering recommended for backend-dev

1. **Extract slice (single PR, no behaviour change):** create `chainWalker.ts`, move symbols out of `timelineSelector.ts`, fix imports, verify all 18 existing `timelineSelector` tests pass unchanged. Add `chainWalker.test.ts` sanity tests.
2. **Selector slice:** implement `scheduleSelector.ts`. Tests cover: single-anchor straight chain, mid-chain anchor with predecessors (predecessors absent from output), parallel-fork sharing startISO, multi-todo independent anchors, multi-anchor-per-chain (defence-in-depth — earliest wins, dev warn). At least 8 cases.
3. **Invariant slice:** extend `task.setSchedule` dispatcher logic to enforce one-anchor-per-chain. Tests cover: scheduling task1 in a 3-task chain clears no others (none scheduled); scheduling task3 then task1 clears task3; scheduling null on a non-anchor is a no-op. Add the `migrateNormalizeChainAnchors` migration.
4. **Consumer slice:** swap WeekView and MonthView to `selectScheduledTasksForRange`. Visual regression check: a previously-scheduled board renders identically except newly-cascaded successors now appear.
