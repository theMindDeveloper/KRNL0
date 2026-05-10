# HabitNode — Component Requirements

*Phase 5 · React Flow migration · Derived from PRD v0.6.0, Decision 11, Decision 13, and LifeOS Whiteboard reference*

---

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | The header displays `"Habits — week {N}"` where N is the ISO week number of today |
| F2 | Day-of-week labels M T W T F S S render as a single header row above all habit grids |
| F3 | Each habit row shows: a glyph, the habit name, a streak indicator `"▲ N day streak"`, and a 7-cell grid |
| F4 | Clicking a cell dispatches `habit.toggle` with `{ habitId, date: 'YYYY-MM-DD' }`; done cells gain class `"done"` |
| F5 | The cell corresponding to today has class `"today"` with a rust-colored border; today is always column index 6 (Sunday) or the current day of the ISO week |
| F6 | Streak count is computed by walking backwards from today through consecutive done dates; it updates immediately after each toggle |
| F7 | An RF `<Handle type="target" position="left">` receives an edge signal from PomoNode; on signal receipt the node dispatches `habit.toggle` for today on the first habit |
| F8 | Cells for future dates within the 7-day window are rendered but are non-interactive (no click, cursor default) |

---

## Non-Functional Requirements

| # | Requirement |
|---|---|
| NF1 | Streak computation is O(n) where n is the number of logged dates — no full-log scan on every render |
| NF2 | Node width is 320 px; the 7-cell grid fits within the node without horizontal scroll |
| NF3 | The sparse log stores only YYYY-MM-DD strings for done dates; no falsy values are stored |
| NF4 | Color is never the sole indicator of cell state — done cells additionally show a filled glyph or checkmark shape |

---

## Use Cases

**UC-H1 — Mark today as done**
Actor clicks the today cell of a habit row. Cell gains `done` class. Streak increments by 1.

**UC-H2 — Unmark a done day**
Actor clicks a done cell. Cell reverts to undone. Streak recomputes.

**UC-H3 — Receive edge signal**
A PomoNode completes a session. Edge signal arrives at the HabitNode target handle. The first habit's today cell is automatically marked done.

**UC-H4 — Read weekly progress**
Actor views the grid to assess which days this week habits were completed, without needing to open any detail pane.

---

## User Stories

- As a user, I want to see the ISO week number in the header so I can mentally anchor the grid to the calendar.
- As a user, I want the streak counter so I feel motivated to maintain consecutive days.
- As a user, I want today's cell highlighted with a border so I never click the wrong day by mistake.
- As a user, I want future cells to be non-interactive so I cannot accidentally pre-mark days.
- As a user, I want the habit to auto-mark when a Pomodoro completes so the edge wiring saves me a manual step.

---

## Gherkin Scenarios (ATDD)

```gherkin
Feature: HabitNode weekly grid

  Background:
    Given today is a Wednesday (ISO week day 3)
    And a HabitNode is mounted with one habit "meditate" having done dates for Monday and Tuesday this week

  Scenario: F1 — Header shows ISO week number
    When the component renders
    Then the header reads "Habits — week {current ISO week number}"

  Scenario: F2 — Day-of-week labels
    When the component renders
    Then the label row contains exactly: "M", "T", "W", "T", "F", "S", "S" in order

  Scenario: F3 — Habit row anatomy
    When the component renders
    Then the "meditate" row has a glyph element
    And the row has a name element reading "meditate"
    And the row has a streak element reading "▲ 2 day streak"
    And the row has exactly 7 cell elements

  Scenario: F4 — Toggle done dispatches habit.toggle
    When the user clicks the Wednesday cell of "meditate"
    Then onCommand is called with { type: "habit.toggle", habitId: "meditate", date: "{today YYYY-MM-DD}" }
    And the Wednesday cell gains class "done"

  Scenario: F5 — Today cell has "today" class
    When the component renders
    Then the Wednesday cell (index 2 in 0-based M–S) has class "today"
    And no other cell has class "today"

  Scenario: F6 — Streak updates after toggle
    Given "meditate" has a 2-day streak (Mon, Tue done)
    When the user clicks the Wednesday cell to mark it done
    Then the streak element updates to "▲ 3 day streak"

  Scenario: F7 — Edge signal auto-marks today
    When a React Flow edge signal arrives at the target handle
    Then onCommand is called with { type: "habit.toggle", habitId: {first habit id}, date: "{today YYYY-MM-DD}" }

  Scenario: F8 — Future cells are non-interactive
    Given today is Wednesday
    When the component renders
    Then the Thursday, Friday, Saturday, Sunday cells do not respond to click events
    And those cells have cursor style "default"
```

---

*Last updated: 2026-05-10*
