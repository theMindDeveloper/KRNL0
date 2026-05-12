# HabitNode — Component Requirements

*Phase 5 + v2 (Decision 14) · Derived from PRD v0.6.0, Decisions 11 + 14, and LifeOS Whiteboard reference*

---

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | The header displays a view-specific title: `"HABITS — WEEK {N} · HBT.WEEK"`, `"HABITS — {MMM} · HBT.MONTH"`, or `"HABITS — {YYYY} · HBT.YEAR"` |
| F2 | Day-of-week labels M T W T F S S render as a single header row above the week-view grid |
| F3 | Each habit row shows: a glyph (colored by the habit's color), the habit name, a streak indicator `"▲ N day streak"`, and a date-cell grid |
| F4 | Clicking a cell dispatches `habit.toggleDay` with `{ id, date: 'YYYY-MM-DD' }`; the cell renders as done after the round-trip |
| F5 | The cell corresponding to today renders with an acid-colored outline ring (1px gap); only one cell is "today" per habit row |
| F6 | Streak count is computed by walking backwards from today through consecutive done dates; it updates immediately after each toggle |
| F7 | An RF `<Handle type="target" position="left">` receives an edge signal from PomoNode; on signal receipt the node dispatches `habit.markDone` for today on the first habit |
| F8 | Future-dated cells are non-interactive at the UI level **and** rejected at the FSM level: `habit.toggleDay` with a future date is a no-op (Decision 14) |
| F9 | The node header has a settings gear button (right-aligned); clicking toggles a popover that overlays the node body and clips to the card |
| F10 | The popover contains a segmented view toggle (Week / Month / Year) that dispatches `habit.setView`; selection persists in `node.config.view` |
| F11 | The popover lists all non-archived habits; each row has a color swatch, name, and delete (×) button |
| F12 | Clicking a swatch reveals an inline 6-dot color picker; selecting a dot dispatches `habit.setColor`; done cells for that habit subsequently fill with the chosen color |
| F13 | Clicking × in the popover dispatches `habit.remove` (hard delete, not archive) |
| F14 | Any past or today cell is interactive (clickable to toggle), including dates before the habit's `createdAt` — the user back-fill rule |
| F15 | Month view renders a single full-width row of cells covering the current calendar month; year view renders a 53-column × 7-row grid (GitHub-style) anchored so today is the rightmost-column cell |
| F16 | View selection persists across reloads via `node.config.view`; per-habit color persists via `habit.color`; both written through `commandDispatch` → `boardSave` (no fake state) |
| F17 | `sys habit add\|done\|streak\|color\|remove\|view\|list` operate on the mother habit node; CLI mutations route through the same pure handlers used by the renderer, and broadcast `board:reload` when a renderer is open |

---

## Non-Functional Requirements

| # | Requirement |
|---|---|
| NF1 | Streak computation is O(n) where n is the number of logged dates — no full-log scan on every render |
| NF2 | All views fit within the mother card content width (346px); no horizontal scroll |
| NF3 | The sparse log stores only YYYY-MM-DD strings for done dates; no falsy values are stored |
| NF4 | Color is never the sole indicator of cell state — today retains its outline ring; the selected swatch in the picker is identified by a 2px paper-colored inset border in addition to color |
| NF5 | Popover content fits within 280px height; longer habit lists scroll within the popover, not outside the node card |
| NF6 | The 6-color palette is fixed (`acid`, `rust`, `cyan`, `plum`, `spine`, `ink`) — no free-form color picker |

---

## Use Cases

**UC-H1 — Mark today as done**
Actor clicks the today cell of a habit row. Cell shows done. Streak increments.

**UC-H2 — Unmark a done day**
Actor clicks a done cell. Cell reverts to undone. Streak recomputes.

**UC-H3 — Receive edge signal**
A PomoNode completes a session. Edge signal arrives at the HabitNode target handle. The first habit's today cell is automatically marked done.

**UC-H4 — Read weekly progress**
Actor views the week grid to assess which days this week habits were completed.

**UC-H5 — Switch view**
Actor opens the gear popover and clicks Month or Year. The body re-renders in the chosen view. The choice persists across app restarts.

**UC-H6 — Backfill a past day**
Actor switches to Month or Year view, finds a past day they actually did the habit but forgot to log, and clicks the cell. The day becomes done. Streaks recompute.

**UC-H7 — Change a habit's color**
Actor opens the gear popover, clicks the color swatch for "Run", picks rust. Done cells across all views switch to rust for that habit.

**UC-H8 — Delete a habit**
Actor opens the gear popover, clicks × next to "Old Habit". The habit is removed permanently. No archived state — it is gone.

**UC-H9 — Drive habits from the terminal**
Actor opens the terminal node and runs `sys habit add "Read 20 pages"`, then `sys habit color "Read 20 pages" cyan`, then `sys habit done "Read 20 pages"`. The habit appears in the GUI without restart (renderer receives `board:reload`).

---

## User Stories

- As a user, I want to see the ISO week number, current month, or current year in the header so I know which range the grid represents.
- As a user, I want a streak counter so I feel motivated to maintain consecutive days.
- As a user, I want today's cell highlighted so I never click the wrong day.
- As a user, I want future cells to be non-interactive so I cannot pre-mark days.
- As a user, I want to back-fill a past day I forgot to mark, regardless of whether the habit had been created yet.
- As a user, I want to choose a color per habit from a small palette so I can tell habits apart at a glance.
- As a user, I want a settings gear in the header so configuration does not clutter the main view.
- As a user, I want to delete habits I no longer track, not just archive them.
- As a user, I want my view choice (week/month/year) to stick across app restarts.
- As a user, I want to control habits from the terminal so I can script them.

---

## Gherkin Scenarios (ATDD)

```gherkin
Feature: HabitNode v2 grid + settings

  Background:
    Given today is a Wednesday in ISO week 20
    And a HabitNode is mounted with one habit "meditate" colored acid

  Scenario: F1 — Week-view header
    Given config.view = 'week'
    When the component renders
    Then the header contains "HABITS — WEEK 20"

  Scenario: F1 — Month-view header
    Given config.view = 'month'
    When the component renders
    Then the header contains "HBT.MONTH" and the current month name

  Scenario: F1 — Year-view header
    Given config.view = 'year'
    When the component renders
    Then the header contains the current year and "HBT.YEAR"

  Scenario: F4 — Toggle dispatches habit.toggleDay
    When the user clicks the Wednesday cell of "meditate"
    Then onCommand is called with "habit.toggleDay" and { id: "meditate", date: "<today>" }

  Scenario: F8 — Future cells are no-ops at the FSM level
    When habit.toggleDay is dispatched with a future date
    Then the habit's log does not contain that future date

  Scenario: F9 — Gear toggles the popover
    When the user clicks the gear button
    Then a popover is rendered overlaying the body
    And clicking outside the popover closes it

  Scenario: F10 — View toggle persists
    When the user clicks the "Month" segment in the popover
    Then onCommand is called with "habit.setView" and { view: "month" }
    And after persist + reload, the body renders the month grid

  Scenario: F12 — Color picker
    When the user clicks the swatch on "meditate" and selects rust
    Then onCommand is called with "habit.setColor" and { id: "meditate", color: "rust" }
    And done cells for "meditate" fill with the rust token across all views

  Scenario: F13 — Delete from popover
    When the user clicks × next to "meditate"
    Then onCommand is called with "habit.remove" and { id: "meditate" }
    And the habit disappears from the grid and the popover

  Scenario: F14 — Past-day backfill, even before createdAt
    Given a habit with createdAt = today
    When habit.toggleDay is dispatched with a date 30 days earlier
    Then the habit's log contains that date

  Scenario: F15 — Month view layout
    Given config.view = 'month'
    When the component renders
    Then each habit's grid renders exactly N cells where N is the day count of the current month

  Scenario: F15 — Year view layout
    Given config.view = 'year'
    When the component renders
    Then each habit's grid renders 53 columns × 7 rows
    And today appears in the rightmost column

  Scenario: F17 — sys habit color updates the live GUI
    Given the renderer is open
    When the user runs `sys habit color "meditate" cyan` in a terminal node
    Then board.json is updated
    And the open renderer receives a `board:reload` notification
```

---

*Last updated: 2026-05-12 (Decision 14 — v2 ships)*
