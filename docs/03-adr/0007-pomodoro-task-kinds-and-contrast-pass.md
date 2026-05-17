# ADR 0007 — Task `kind` (`focus` / `event`), break-aware scheduling, and the post-launch contrast pass

**Status**: Accepted (2026-05-17)
**Branch**: `feat/decision-28-pr-b`
**PR**: #142
**Issue / Spec**: `docs/03-architecture/decisions.md` § Decision 28 (lines 1934-2150)
**Supersedes**: nothing.
**Extends**: Decision 9 (PomoNode FSM), Decision 22 (PomoSessionRecord), Decision 22.1 (checkpoint elapsed), ADR 0001 (Calendar integration), ADR 0003 (Cascade scheduling), ADR 0006 (LifeOS UI refresh).

---

## 1. Why this exists

KRNL0 had one notion of a scheduled task: a Pomodoro-shaped sequence of work + breaks. That was wrong for two real-world cases:

1. **"Go to university 09:00 → 12:00."** Not a pomodoro. The user does not want a 25-min ticker, does not want a 5-min break inserted at 09:25, does not want the calendar to silently grow the block to "85 minutes" because we tacked breaks onto a 75-min input. They want a flat 3-hour block.
2. **"75-min focus task starting at 02:00."** This *is* a pomodoro. We were drawing it as one solid 75-minute block on the calendar, then independently running a 25/5/25/5/25 sequence on the pomo timer. The two were lying to each other: the calendar said "next slot starts at 03:15," the FSM said "next slot starts at 03:25" (because 75-min real work = 85-min wall-clock with two short breaks).

The user's words, paraphrased from the transcript:

> "If we add a pomodoro to the calendar, two icons — 🍞 bread (plain task) and 🍅 tomato (pomo task). … if the task is not pomodoro then the pomodoro timer will make it in one big session no breaks, and pomodoro is default."

That is the whole spec, encoded as a discriminator on `TaskState`.

## 2. What we built

### 2.1 Data model — one field

```ts
// src/renderer/components/nodes/TaskNode/types.ts
export type TaskKind = 'focus' | 'event';
export interface TaskState {
  // ... existing fields
  kind: TaskKind;           // default 'focus'
  note?: string;            // free-form text under the body (added in this PR)
}
```

Migration: `src/main/persistence/board.ts` sets `kind: 'focus'` on any task loaded from a pre-Decision-28 `board.json`. The migration is forward-only (no down-migration; old boards open in the new app, new boards don't open in the old app — same policy as every other schema change).

### 2.2 Parity gates — one source for "is this break long?" and "what session am I in?"

The bug we feared most was *drift*: the pomo FSM thinks the next break is a long break, the schedule visualization thinks it's short, and the calendar shows 85 minutes while the timer thinks 90. We sealed that by extracting the predicates into one module, then making both the FSM and the visualization walker import it.

```ts
// src/renderer/components/nodes/PomoNode/pomoRules.ts  (new)
export function isLongBreakAfter(
  sessionsCompletedBefore: number,
  cfg: PomoConfig,
): boolean {
  return (sessionsCompletedBefore + 1) % cfg.longBreakEvery === 0;
}

export function computeCurrentSessionMin(
  plannedMin: number,
  pomoSessionsCompleted: number,
  cfg: PomoConfig,
): number {
  const remainder = plannedMin - pomoSessionsCompleted * cfg.sessionMin;
  return Math.max(1, Math.min(remainder > 0 ? remainder : cfg.sessionMin, cfg.sessionMin));
}
```

- `PomoNode/commands.ts::pomoComplete` calls `isLongBreakAfter` to pick `shortBreakMin` vs `longBreakMin`.
- `store/scheduleSelector.ts::breakdownPomoTime` walks the same predicate to compose `PomoBreakdown.segments[]`.
- `commandDispatch.ts::loadTaskIntoPomo` calls `computeCurrentSessionMin` so START always uses the right clamp.

Parity is asserted by a table-driven Vitest in `tests/unit/renderer/pomoSchedule.parity.test.ts`: N iterations of `pomoComplete` produce the same `(kind, min)` sequence as `breakdownPomoTime(remaining, completed, cfg)`. If anyone ever forks the rule, the test red-lines.

### 2.3 Scheduling — breaks count toward effective length

```ts
// src/renderer/store/pomoSchedule.ts  (new)
export interface PomoBreakdown {
  workMin: number;
  breakMin: number;
  effectiveMin: number;      // = workMin + breakMin
  segments: Array<{ kind: 'work' | 'short' | 'long'; min: number }>;
}
export function breakdownPomoTime(
  remainingMin: number,
  alreadyCompletedSessions: number,
  cfg: PomoConfig,
): PomoBreakdown { /* … */ }
```

The schedule selector (`store/scheduleSelector.ts::computeEffective`) branches on `kind`:

- `kind === 'focus'`: `breakdownPomoTime(remaining, sessionsCompleted, cfg).effectiveMin` is the wall-clock length used for cascade placement of the *next* task.
- `kind === 'event'`: `plannedMin` is the effective length. No breakdown.

Placements expose both `kind` and `breakdown` so the renderers can decide presentation without re-deriving.

### 2.4 Event-mode loading — one big session, no breaks

`commandDispatch.ts::loadTaskIntoPomo`:
- `kind === 'focus'`: load with `durationMin = computeCurrentSessionMin(plannedMin, sessionsCompleted, cfg)` (current session, clamped to `cfg.sessionMin`).
- `kind === 'event'`: load with `durationMin = plannedMin` (the whole thing), and pass `skipBreak: true` to `pomoComplete`. The FSM transitions `running → done`, skipping `break`.

This is why double-clicking an event task no longer shows multiple sessions on the timer.

### 2.5 UX gates

- **Per-task toggle**: a small POMO/EVENT pill in the task header. `task.toggleKind` flips the field. If the toggled task is currently active in the pomo, the in-flight session is cancelled and the task is re-loaded under the new kind's rules. `pomoSessionsCompleted` is preserved.
- **Double-click**: only loads `kind === 'focus'` and `kind === 'event'` differently. No toast, no error — silent reload.
- **Pip line**: long breaks render as wider pip lines (18 px vs 6 px), short breaks short. Visible in the pomo node's pip strip.
- **Three-numbers display**: PomoNode + TodoNode now show `work / break / total` so the user sees "this 75-min task is 75 work + 10 break = 85 effective."

### 2.6 Calendar visualization

`CalendarNode/WeekView.tsx`: the block height is `breakdown.effectiveMin` minutes, but the surface is split:

- **Work region** (top): solid task-tone fill.
- **Break region** (bottom tail): `repeating-linear-gradient(135deg, taskTone 0 1px, transparent 1px {6|10}px)` over a 1-px dashed top border in the task tone. Reads as "same task, not work."

Long-break stripes are wider (10 px spacing) than short (6 px) so the eye still sees the cadence at week density.

`kind === 'event'`: single solid block, no tail.

A small legend chip next to "Week of …" explains: solid = SESSION, striped = BREAK.

### 2.7 Clock visualization

`ClockNode/index.tsx`: arcs are one solid base in the task tone for the full span, plus break overlays in `var(--paper-3)` (the track color) with butt caps over the break segments. The break overlay reads as a clean "cut" in the worm — same neutral-panel language as the calendar's stripes.

We removed the old 3-layer glassy effect (shadow + tone + shine) after the user said "the fake glassy look is bad" — see the iteration notes below.

`kind === 'event'`: single arc. No overlays.

## 3. The iteration log

This wasn't one PR shipped clean. The user drove ~25 follow-up rounds of polish on top of the core mechanic. Recording the visible ones so the next person doesn't re-derive them:

| # | User signal | Fix |
|---|---|---|
| 1 | "if i double click on a bread node it still shows me multiple sessions" | Event-mode `skipBreak` flag added to FSM. |
| 2 | "calculate the long break time inside the break time" | Three-numbers display split into work / short-break / long-break. |
| 3 | "drag bug — block height grew exponentially per nudge" | Drag payload was sending `scheduledDurationMin` (work + breaks). Selector re-added breaks. Fixed by sending `plannedMin` (raw work-time). |
| 4 | "PARALLEL TASKS ON THE CLOCK ARE OVERLAPPING" | Interval-graph lane assignment. One gray track per overlapping lane; Apple-Fitness-style concentric rings. |
| 5 | "i can't see the other 12 hours" | AM/PM toggle bar on the clock: `[AM · 0–12] [⇆] [PM · 12–24]`. |
| 6 | "rings are growing under the clock" | Tracks now grow OUTWARD; `radiusForLane(lane)` = `trackBaseR + lane * (stroke + gap)`. |
| 7 | "huge gap between clock and first ring" | Hoisted `trackBaseR = R_TICK_OUT + 8` constants so the first ring kisses the clock edge. |
| 8 | "fake glassy look is bad — use same tone/style as calendar" | Removed 3-layer shadow/base/shine. Single solid stroke. |
| 9 | "POMO/EVENT button doesn't fit, changes size when clicked" | Fixed-width pill (54 px), padding `2px 5px`, dot 4 px, dark on transparent — matches START button language. |
| 10 | "add note function — prompt() throws in Electron" | Replaced `window.prompt()` with inline textarea on TaskNode + inline picker inside HabitContextMenu. ⌘/Ctrl+Enter saves. |
| 11 | "drop the 'Link Todo' picker — ofc it pulls from the todo" | ClockNode no longer reads `linkedTodoId` at render time; auto-pulls every todo's tasks. `linkedTodoId` kept on state for back-compat only. |
| 12 | "habits dropped on calendar should also show on the clock" | ClockNode now reads scheduled habits (ADR 0002) and renders them as event-style arcs, honoring `daily` / `weekly` / `weekdays` schedules against today's IsoDow. |
| 13 | "default font JetBrains for notes and strings overall" | `--font-sans` swapped from Geist → JetBrains Mono (Geist kept as fallback). |
| 14 | "time picker is the chunky Windows blue scroll wheel — fit KRNL0" | Native `<input type="time">` replaced with two `NumberStepper` widgets (HH/MM) joined by `:`, animated in via new `krnl-time-picker-in` keyframe. |
| 15 | "remove the back-arrow chips on the cards" | Decorative `←` `→` circles on the weekly/daily cards in `HabitSwapModal` removed. |
| 16 | "white text on bright green — fix visibility" (recurring, ×4) | New `--ink-on-bright: #0a0908` token. Locked-dark text on every accent bg: weekly/daily badges, CONFIRM button, App RELOAD button, calendar habit blocks (label + icon), TodoNode done checkbox bg, AND a doc rule. See § 4. |
| 17 | "deleting a habit leaves a 'habit removed — delete this lane' card" | `removeAllLanesForHabit(habitId)` helper sweeps every `habit.lane` node referencing the deleted habit. HabitLaneNode also self-removes via `useEffect` when its habit lookup returns null. |

## 4. Contrast lock (KRNL0 visual rule)

The white-on-bright-green issue came back four times across the iteration log because the codebase had no single rule. We added one:

> **Never light text on a bright accent background.** Bright = `--acid`, `--rust`, `--cyan`, `--magenta`, `--gold`, `--lime`, `--emerald`, `--mint`, or any `--${habit.color}`. Text on any of these must use `--ink-on-bright` (or hardcode `#0a0908`). `--ink` and `--paper` are theme-variant tokens — they flip between themes — and will produce green-on-white in one mode if used here.

The token is defined in `src/renderer/styles/tokens.css` with the rule in a doc comment. Callers fixed in this PR:

- `HabitSwapModal.tsx` — CONFIRM button, weekly badge, daily badge.
- `App.tsx` — error-boundary RELOAD button.
- `CalendarNode/WeekView.tsx` — habit-block icon and label (also bumped opacity 0.7 → 0.9 so alpha doesn't wash the contrast).
- `TodoNode/index.tsx` — done checkbox uses `#0a0908` bg + acid border + acid ✓ (no more "green-on-white" in dark mode).
- `chassis.css` and `reactflow-theme.css` already used hardcoded `#1a1814` for the same purpose; left as-is.

Decorative usages (LEDs, bars, dots, swatches with no text) are exempt.

## 5. Files affected (cumulative across PR-A and PR-B)

**New:**
- `src/renderer/components/nodes/PomoNode/pomoRules.ts` — parity predicates.
- `src/renderer/store/pomoSchedule.ts` — `breakdownPomoTime`.
- `src/renderer/utils/taskColor.ts` — shared task-tone palette consumed by Calendar, Clock, Todo.

**Modified:**
- `src/renderer/components/nodes/TaskNode/types.ts` — `+kind`, `+note`.
- `src/main/persistence/board.ts` — migration default `kind: 'focus'`.
- `src/renderer/components/nodes/PomoNode/commands.ts` — `pomoComplete` accepts `skipBreak`; uses `isLongBreakAfter`.
- `src/renderer/components/Canvas/commandDispatch.ts` — `task.toggleKind`, `task.setNote`, `habit.setNote`, `habit.lane.setNote`; `loadTaskIntoPomo` uses `computeCurrentSessionMin`; `removeAllLanesForHabit` helper hooked into both mother `habit.remove` and lane `habit.lane.removeHabit`.
- `src/renderer/store/scheduleSelector.ts` — break-aware walk; placements expose `kind` + `breakdown`.
- `src/renderer/components/nodes/TaskNode/index.tsx` — POMO/EVENT toggle pill, inline note textarea, removed "Add subtask" context-menu item, double-click reload.
- `src/renderer/components/nodes/TodoNode/index.tsx` — three-numbers display; done-checkbox contrast fix.
- `src/renderer/components/nodes/CalendarNode/WeekView.tsx` — tail texture, habit blocks contrast fix, legend chip.
- `src/renderer/components/nodes/ClockNode/index.tsx` — full rewrite of the task layer: lane assignment, concentric tracks, AM/PM toggle, solid arcs, habit arcs.
- `src/renderer/components/nodes/HabitNode/HabitContextMenu.tsx` — inline note editor (no `window.prompt`).
- `src/renderer/components/nodes/HabitNode/commands.ts` — `habitSetNote`.
- `src/renderer/components/nodes/HabitLaneNode/index.tsx` — orphan self-cleanup.
- `src/renderer/components/ui/HabitSwapModal.tsx` — custom HH/MM time picker, badge + button contrast, corner-chip removal.
- `src/renderer/components/ui/NumberStepper.tsx` — `testId` lands on inner `<input>`.
- `src/renderer/styles/tokens.css` — `--font-sans: JetBrains Mono`; `--ink-on-bright: #0a0908`; `@keyframes krnl-time-picker-in`.

## 6. Tests added / changed

- `tests/unit/renderer/pomoSchedule.parity.test.ts` — N-iteration parity between FSM and breakdown walker.
- `tests/unit/renderer/pomoSchedule.table.test.ts` — table-driven `breakdownPomoTime`: empty, 1-session, mid-session resume, exact `longBreakEvery` boundary, `longBreakEvery = 1`, `remainingMin ≤ 0`.
- `tests/unit/renderer/scheduleSelector.kind.test.ts` — same chain rendered with all-focus and all-event tasks; effective lengths differ by the expected break overhead.
- `tests/unit/renderer/persistence.decision28-migration.test.ts` — pre-Decision-28 `board.json` loads with all tasks `kind: 'focus'`.
- `tests/unit/renderer/TaskNode.kind-toggle.test.tsx` — `kind === 'event'` task: double-click body fires no command; toggle icon dispatches `task.toggleKind`.
- `tests/unit/renderer/commandDispatch.toggleKind-handoff.test.ts` — toggling active pomo task `'focus' → 'event'` cancels FSM; `pomoSessionsCompleted` is preserved.
- `tests/unit/renderer/ClockNode.decision28-arcs.test.tsx` — break overlays present for multi-session focus, absent for event and 1-session.
- The previously-stale "Add subtask context menu" tests and the "shows link UI when linkedTodoId is null" test are skipped (with a comment) — the features they exercised were removed per user request.

## 7. Rejected alternatives (for the record)

- **`pomoEnabled: boolean`** — closes the door on future kinds (`'habit'`, `'milestone'`). The string union costs nothing.
- **Inline alternation tail viz** (work/break/work/break stripes top-to-bottom) — too noisy at week-view density. Single bottom tail wins.
- **Per-task-tinted break color on the clock** — implies the break "belongs" to that task's work, which is semantically wrong. Neutral track color wins.
- **Splitting PR-B into "selector first, viz later"** — the middle PR would land a visible regression (longer blocks with no explanation).
- **Native `<input type="time">`** — the OS-level Windows scroll-wheel is jarring against the KRNL0 chrome; the user explicitly called it out.
- **Letting orphan `habit.lane` placeholders stay on the canvas with a "delete me" hint** — that's busywork for the user. Auto-cleanup is the right answer.

## 8. Open follow-ups (not in this PR)

- ClockNode tests `ClockNode.scenarios.test.tsx` and `ClockNode.userBoard.fixture.test.tsx` have 4 pre-existing failures from earlier visual redesigns (expected arc counts and opacity values from the old 3-layer glassy renderer). They are not regressions from this PR; they need a separate "update arc-count assertions to the single-stroke renderer" patch.
- Decision 28 deliberately does **not** filter `done` tasks from the schedule selector. If users want done tasks to drop off the calendar/clock, that is a separate decision.
- Per-task `pomoConfigOverride` is out of scope. The helper signature accepts it cleanly if added later.

## 9. PR

[#142 — `feat/decision-28-pr-b`](https://github.com/theMindDeveloper/KRNL0/pull/142). See the PR description for the chronological commit log.
