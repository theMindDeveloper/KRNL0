# ADR 0005 — Multi-anchor cascade scheduling

**Status**: Accepted (2026-05-15)
**Supersedes**: ADR 0003 §1 (one-anchor-per-chain invariant), ADR 0003 §3.7 (mid-chain drop unschedules predecessors), ADR 0003 §8 (`migrateNormalizeChainAnchors`).

## Context

ADR 0003 introduced cascade scheduling with a hard invariant: **at most one anchor per chain**. Dropping a successor onto the calendar cleared every other anchor in the chain. The selector then walked forward from the surviving anchor only.

In practice users hit this:

> Created task1 → task2 → task3. Dropped task1 on calendar — all 3 cascaded back-to-back. Then dropped task3 elsewhere — task1 and task2 disappeared, only task3 remained.

The model conflated **logical dependency** (`task.next` says "comes after") with **time placement** (`scheduledFor` says "happens at"). The chain link is a sequencing constraint; the calendar drop is a wall-clock pin. ADR 0003's one-anchor invariant forced them to be a single concept.

## Decision

A chain can carry **any number of anchors**. Each anchor is a fixpoint. The selector walks the chain forward and uses each anchor it encounters as the new cursor; gaps between anchors auto-derive from the previous unit's planned duration.

### Selector rules (`selectSchedule`)

For each connected component (chain) of `task.next` edges within a todo that contains ≥1 anchored task:

1. Walk units in `walkChain` order.
2. Maintain `cursor: ISO | null` (initialised to `null`).
3. For each task unit in the chain's component:
   - If task has its own `scheduledFor` → `cursor = scheduledFor`; emit at cursor; advance cursor by `unit.plannedMin`. Mark `isAnchor: true`.
   - Else if `cursor !== null` → emit at cursor; advance by `unit.plannedMin`. Mark `isAnchor: false`.
   - Else (predecessor of the first anchor) → skip.
4. For each parallel-group unit:
   - **Group start** = earliest `scheduledFor` among anchored branches in this component, else `cursor`. (If still `null`, skip.)
   - For each branch:
     - If branch has its own `scheduledFor` → emit branch at `branch.scheduledFor`. Mark `isAnchor: true`.
     - Else → emit branch at group start. Mark `isAnchor: false`.
   - Advance cursor by `max(branch.plannedMin)` from group start.

`anchorTaskId` on each placement = the most-recent anchor that pushed the cursor to this point (self for explicit anchors).

### Dispatcher rules (`task.setSchedule` / `calendar.schedule`)

- Setting an anchor **does not** clear other anchors in the chain. Just writes `scheduledFor` (and mirrors to the linked TodoItem).
- Clearing an anchor (`scheduledFor: null`) is unchanged.

### Persistence rules

- `migrateNormalizeChainAnchors` is **deleted**. Multiple anchors per chain are no longer a corruption to heal.

### Overlap handling

Two anchored tasks whose derived intervals overlap render as the user wrote them. The calendar's column layout (PR #122 `computeColumnLayout`) already lays overlapping blocks side-by-side. The clock renders concentric rings already. No new collision logic is added.

### Backwards-in-time anchors

If `task1` is anchored at 14:00 and `task3` is anchored at 08:00, the chain renders task1 at 14:00 and task3 at 08:00. The dependency link is preserved as data (still `task.next`); the visual order on the wall clock is whatever the user pinned. We trust the user — calendars don't enforce dependency-time alignment, and we shouldn't either.

## Consequences

### Migration impact

- Boards healed by ADR 0003's `migrateNormalizeChainAnchors` (which silently dropped extra anchors) are unaffected — the heal already ran. New boards may now have multiple anchors per chain by design.
- The migration is removed from `loadBoard`. Existing pipelines stay otherwise unchanged.

### Test impact

- `tests/unit/renderer/commandDispatch.cascadeAnchor.test.ts` — flipped from "verify clear-others on second anchor" to "verify second anchor coexists with first."
- `tests/unit/main/board.adr0003-migration.test.ts` — deleted (the migration is gone).
- `tests/unit/renderer/scheduleSelector.test.ts` — adds multi-anchor scenarios; existing single-anchor cases still pass (semantics are a strict superset).

### Cosmetic / logical anchor distinction

`isAnchor` continues to mean "this task has its own `scheduledFor`." The calendar honours `scheduledDurationMin` only on anchors (anchor blocks can be resized; derived blocks always use `plannedMin`). This rule is unchanged from ADR 0003 §3.7 — it just now applies per-anchor instead of per-chain.

## Alternatives considered

- **B (cascade only on first drop)** — rejected. "First" is hidden state with no UI affordance; subsequent drops would silently switch to independent mode.
- **D (marquee groups)** — rejected. Adds a parallel scheduling concept (groups) when the existing one (chains) just needed relaxing. Users would need to learn two ways to express "these go together."
- **A (drop cascade entirely)** — rejected. The "drop one, fill my afternoon" workflow is the cascade's primary value.
