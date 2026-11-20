# Station layouts (Classic and Grid)

*ADR: [Decision 52](../03-architecture/decisions.md). Design: the owner picked the Grid arrangement on the "KRNL0 server drafts" board (Desktop browser · Station).*

The Station can arrange its windows two ways, and the owner picks one:

- **Classic** — Timer, Todos, Habits and Calendar across the top; canvas, terminal, analytics and clock along the bottom (as before).
- **Grid** — Timer, Todos and Habits across the top; Calendar (two thirds) and Clock along the bottom. The canvas is one click away on the top bar (CANVAS).

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | The Station toolbar has a **Classic / Grid** switch (a small two-way toggle with a drawing of each arrangement). The choice applies at once. |
| F2 | In Grid, the toolbar shows toggles for the five Grid windows only (Timer, Todos, Habits, Calendar, Clock); hiding one lets its neighbours fill the space. |
| F3 | Each preset keeps its own panel sizes: resizing in Grid never changes Classic, and switching back restores Classic exactly as it was. |
| F4 | CLI: `krnl settings station-layout [classic\|grid]` shows or sets it (the same field as the switch). |
| F5 | The choice belongs to the device (part of `layoutGeometry`): with sync, each computer keeps its own Station arrangement. |

## Non-Functional Requirements

| # | Requirement |
|---|---|
| NF1 | Every write of the Station geometry keeps the fields it does not change (`preset`, `grid`, `bottomFractions`). |
| NF2 | Old boards without `preset` open in Classic; no migration. |

## Use Cases

- **UC-L1:** The owner switches to Grid in the Station toolbar and sees Timer, Todos, Habits over Calendar and Clock.
- **UC-L2:** They widen the Calendar in Grid, switch to Classic (unchanged), and back to Grid (the wider Calendar is still there).
- **UC-L3:** The AI runs `krnl settings station-layout grid` in the terminal; the window switches.

## User Stories

- As a user, I want to pick how the Station arranges my windows, so that the day I plan fits how I work.

## Gherkin Scenarios (ATDD)

```gherkin
Feature: Station preset (F1, F3)
  Given the Station is Classic with a saved bottom row
  When I pick Grid in the Station toolbar
  Then the Station shows Timer, Todos, Habits over Calendar and Clock
  And the saved Classic sizes are unchanged

Feature: Grid toggles (F2)
  Given the Station is Grid
  Then the toolbar offers Timer, Todos, Habits, Calendar and Clock, and no Canvas, Terminal or Analytics toggle

Feature: CLI (F4)
  When I run "krnl settings station-layout grid"
  Then the Station is Grid
  And "krnl settings station-layout masonry" is refused and changes nothing
```
