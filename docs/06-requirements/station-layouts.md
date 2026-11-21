# Layouts (Classic, Grid, Planner, Free)

*ADR: [Decision 54](../03-architecture/decisions.md). The owner asked (2026-11-21) for one dropdown that lists the layouts instead of the Station / Free switch, with the arrangement from their screenshot (Timer, Todos and Clock on top, a full-width Calendar below) as one of them.*

The top bar has one **layout menu**. It names the layout in use and lists four, each with a line drawing of its arrangement:

- **Classic** — Timer, Todos, Habits and Calendar across the top; canvas, terminal, analytics and clock along the bottom. Windows can be swapped by dragging (and `krnl window swap`).
- **Grid** — Timer, Todos and Habits across the top; Calendar (two thirds) and Clock below.
- **Planner** — Timer, Todos, Habits and Clock across the top; the Calendar the full width below.
- **Free** — the canvas: put anything anywhere.

Classic, Grid and Planner are the Station (`layoutMode: 'station'`) with a preset (`layoutGeometry.station.preset`); Free is `layoutMode: 'canvas'`. The names live in `src/shared/stationLayouts.ts`, used by the app and the CLI.

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | The top bar shows one **layout menu** in place of the Station / Free switch: a button with the current layout's drawing and name, opening a list of Classic, Grid, Planner and Free (each with its drawing and one line). The choice applies at once; the chosen one is ticked. |
| F2 | (Decision 58) Every window toggle is always there, in every layout. In Grid and Planner a window the preset does not place joins the end of the bottom row when shown; hiding one lets its neighbours fill the row, and a row with nothing left gives its height to the other. |
| F3 | Each preset keeps its own panel sizes (`layoutGeometry.station.grid`, `.planner`); resizing one never changes another, and switching back restores it exactly. |
| F4 | (Decision 58) Grid and Planner start in their own arrangement, whatever was swapped in Classic, and are yours from there: dragging a window onto another swaps them in that layout's own order (`station.<preset>.order`; `krnl window swap` does the same), and each window keeps its width by name. Planner starts with Timer, Clock, Todos and Habits on top. |
| F5 | CLI: `krnl settings layout [classic\|grid\|planner\|free]` shows (with the list) or picks the layout; the older words `station` (the Station with its last preset) and `canvas` (Free) still work. `krnl settings station-layout [classic\|grid\|planner]` sets the preset without leaving Free. |
| F6 | ⌘/Ctrl+Shift+L flips between the Station (its last preset) and Free. |
| F7 | The choice belongs to the device (part of `layoutGeometry`): with sync, each computer keeps its own layout. |

## Non-Functional Requirements

| # | Requirement |
|---|---|
| NF1 | Every write of the Station geometry keeps the fields it does not change (`preset`, `grid`, `planner`, `bottomFractions`). |
| NF2 | Old boards without `preset`, and boards with a preset this version does not know, open in Classic; no migration. |
| NF3 | The menu is the app's own (no native select), with line drawings, rows at least 44 px tall, Escape and a click outside close it. |

## Use Cases

- **UC-L1:** The owner opens the layout menu and picks Planner: Timer, Todos and Clock on top (Habits hidden), the Calendar the full width below.
- **UC-L2:** They widen the Calendar in Planner, pick Classic (unchanged), then Planner again (the wider Calendar is still there).
- **UC-L3:** The AI runs `krnl settings layout grid` in the terminal; the window switches to Grid. `krnl settings layout` lists the four.
- **UC-L4:** In Free the owner presses Ctrl+Shift+L and is back in Planner.

## User Stories

- As a user, I want to pick how my windows are arranged from one menu, so that the day I plan fits how I work.
- As a user, I want my calendar wide under my timer, todos and clock, so that I can read my week while I work.

## Gherkin Scenarios (ATDD)

```gherkin
Feature: Layout menu (F1)
  Given the Station is Classic with saved panel sizes
  When I open the layout menu and pick Planner
  Then the Station shows Timer, Todos, Habits and Clock over a full-width Calendar
  And the menu names Planner and ticks it
  And the saved Classic sizes are unchanged

Feature: Free from the menu (F1, F6)
  Given the layout is Planner
  When I pick Free
  Then the canvas shows
  And pressing Ctrl+Shift+L brings Planner back

Feature: Every toggle in every layout (F2)
  Given the layout is Grid or Planner
  Then the toolbar offers every window, the canvas too
  When I show Analytics
  Then it joins the bottom row

Feature: Rearrange a preset (F4)
  Given the layout is Planner
  When I drag the Clock onto the Calendar
  Then they trade places in Planner
  And Classic's places are unchanged

Feature: CLI (F5)
  When I run "krnl settings layout planner"
  Then the layout is Planner
  And "krnl settings layout canvas" goes to Free
  And "krnl settings layout masonry" is refused and changes nothing
```
