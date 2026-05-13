# PomoNode — Component Requirements

*Phase 5 · React Flow migration · Derived from PRD v0.6.0, Decision 9, Decision 13, Decision 22, and LifeOS Whiteboard reference*

---

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | The vapor pill drains acid liquid as time passes: `liquid` div height equals `remainingMs / totalMs * 100`% so 40% remaining → 40% fill |
| F2 | Six tick marks (25 / 20 / 15 / 10 / 05 / 00) are rendered on the right edge of the tube at proportional vertical positions |
| F3 | The clock displays elapsed time as MM:SS; the separating colon blinks at 1 Hz in `--rust` color while `status === 'running'` |
| F4 | RESET button dispatches `pomo.cancel`, transitions FSM to `idle`, resets `startedAt` and `elapsedMs` to zero |
| F5 | The primary action button label is context-driven: `START` (idle), `PAUSE` (running), `RESUME` (paused), `SKIP BREAK` (break) |
| F6 | Four session pips below the tube show progress within the `longBreakEvery` cycle; the pip matching `sessionCount % longBreakEvery` is highlighted |
| F7 | When `remainingMs ≤ 0` the component automatically dispatches `pomo.complete` without user interaction |
| F8 | An RF `<Handle type="source" position="right">` is rendered at vertical center for downstream edge chaining |
| F9 | A **gear icon** in the top-left of the header opens an inline settings panel inside the node body. Panel fields: `Session (min)`, `Short break (min)`, `Long break (min)`, `Long break every (sessions)`. SAVE dispatches `pomo.setConfig` with the new `PomoConfig`; CANCEL restores prior values. While the panel is open the vapor tube is hidden. |
| F10 | When `state.activeTaskId !== null` the header label switches from `DEEP WORK · POMO.025` to `TASK · <task.text>` (truncated to 24 chars). The `session N / M` line below the pips shows `M = max(1, ceil(task.plannedMin / config.sessionMin))` — the *derived* session count, not a stored one. |
| F11 | Clicking the gear icon, or pressing ESC inside the settings panel, also clears `state.activeTaskId` if a task was active — returning the node to default mode. |
| F12 | `pomoComplete` selects break length using `longBreakEvery`: when `(sessionsCompleted + 1) % longBreakEvery === 0` the next break uses `config.longBreakMin`, otherwise `config.shortBreakMin`. The chosen value is written into `state.breakMin` at the transition. |
| F13 | When a session for an `activeTaskId` completes or is cancelled, the dispatcher commits `floor((endedAt - startedAt) / 1000)` seconds to the linked task's `secondsAccumulated` and, on completion only, increments `pomoSessionsCompleted` on that task. |
| F14 | Gear button is rendered at the top-right of the header (after the title with `flex: 1` spacer) and is disabled — greyed out, pointer-events none — when `state.status` is not `idle` or `done`. Tooltip reads "Stop session to edit settings". (Supersedes the top-left position in F9 — Decision 22.1) |
| F15 | Primary button mapping: `running → PAUSE`, `paused → RESUME`. Pressing PAUSE writes `pausedAt` and `pausedElapsedMs` without writing a history record. The tick interval is disabled while paused; the clock displays the frozen elapsed value. RESET still dispatches `pomo.cancel` from any status including `paused`. (Supersedes implicit cancel-on-PAUSE from Decision 22 — Decision 22.1) |
| F16 | When `pipCount > 8`, exactly 8 pips render plus a `+N more` text element where N = `pipCount - 8`; the `session N / pipCount` counter label carries the full count. |
| F17 | Session counter shows the active task's `pomoSessionsCompleted` when `activeTaskId !== null`, else the global `state.sessionsCompleted`. |
| F18 | Pressing PAUSE freezes the visible clock at the current elapsed and disables the tick interval. Auto-complete (`pomo.complete`) does not fire while `status === 'paused'`. |

---

## Non-Functional Requirements

| # | Requirement |
|---|---|
| NF1 | Tick animation runs at ≥ 30 fps; liquid height is driven by a `requestAnimationFrame` loop, not a 1 s setInterval |
| NF2 | Vapor bubble animation is pure CSS (`@keyframes vapor-rise`); no JavaScript drives the bubbles |
| NF3 | Node width is 240 px; height is unconstrained and grows with content |
| NF4 | All colors reference CSS custom properties (`--acid`, `--rust`, `--spine`) — no hardcoded hex values in component JSX or inline styles |

---

## Use Cases

**UC-P1 — Run a focus session**
Actor presses START. Timer counts down. Liquid drains. At zero, `pomo.complete` fires automatically, actor hears narration (R7).

**UC-P2 — Pause and resume mid-session**
Actor presses PAUSE mid-session. Timer freezes, liquid level holds. Actor presses RESUME. Timer continues from frozen point.

**UC-P3 — Cancel a session**
Actor presses RESET at any point. Node returns to idle: full liquid level, clock reads 25:00 (or configured duration).

**UC-P4 — Chain to a HabitNode**
Actor drags an edge from the PomoNode RF Handle to a HabitNode handle. On session completion the HabitNode marks today done (R5).

---

## User Stories

- As a user, I want to see the acid liquid draining so I have a visceral sense of how much time remains.
- As a user, I want tick-mark labels on the tube so I can estimate remaining time at a glance without reading the clock.
- As a user, I want the colon to blink so I can confirm the timer is running without watching the number change.
- As a user, I want the RESET button to always be available so I can abandon a session without closing the node.
- As a user, I want session pips so I know how many sessions until my long break.
- As a user, I want the timer to complete itself so I never have to click a "finish" button.

---

## Gherkin Scenarios (ATDD)

```gherkin
Feature: PomoNode vapor timer

  Background:
    Given a PomoNode is mounted with status "idle" and duration 25 minutes

  Scenario: F1 — Liquid fill tracks remaining time
    Given the session has 10 minutes remaining out of 25
    When the component renders
    Then the ".liquid" element height is 40%

  Scenario: F2 — Tick marks are visible on tube edge
    When the component renders
    Then six tick-mark labels are present: "25", "20", "15", "10", "05", "00"
    And each label is positioned on the right edge of ".pomo-vapor"

  Scenario: F3 — Blinking colon while running
    Given the session status is "running"
    When one second elapses
    Then the colon element toggles the "blink" class at each second
    And the colon color is var(--rust)

  Scenario: F3b — Colon is static when not running
    Given the session status is "idle"
    When the component renders
    Then the colon element does not have the "blink" class

  Scenario: F4 — RESET dispatches pomo.cancel
    Given the session status is "running"
    When the user clicks the RESET button
    Then onCommand is called with { type: "pomo.cancel" }
    And the displayed time resets to 25:00

  Scenario: F5 — Button label reflects status
    When status is "idle"
    Then the primary button label is "START"
    When status is "running"
    Then the primary button label is "PAUSE"
    When status is "paused"
    Then the primary button label is "RESUME"
    When status is "break"
    Then the primary button label is "SKIP BREAK"

  Scenario: F6 — Session pips highlight current cycle position
    Given longBreakEvery is 4 and sessionCount is 2
    When the component renders
    Then pip at index 2 has class "active"
    And pips at index 0, 1, 3 do not have class "active"

  Scenario: F7 — Auto-complete when remainingMs reaches zero
    Given the session status is "running" and remainingMs is 1
    When the rAF tick reduces remainingMs to 0
    Then onCommand is called with { type: "pomo.complete" } exactly once

  Scenario: F8 — RF source handle is rendered
    When the component renders
    Then a React Flow Handle with type "source" and position "right" is present
    And its vertical position is at 50% of the node height
```

---

*Last updated: 2026-05-13 — Decision 22.1 (pause status, pip cap, per-task counter)*
