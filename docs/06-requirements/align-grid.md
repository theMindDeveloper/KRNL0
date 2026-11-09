# Align to grid

*An invisible grid for the canvas, like "Align icons to grid" on a desktop. Asked for by the user on 2026-11-09 ("not visual, just an invisible grid that puts everything into a good position"); made stricter the same day ("fewer options so gridding becomes easier").*

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | With **Align to grid** on, anything you drop on the canvas (notes, sticky notes, shapes, images, task, habit and event cards) settles with its top-left corner on the nearest grid point. The grid is **80 px** and invisible: a task card takes three columns and two rows, so cards side by side keep an even 20 px gap and rows 40 px. The last few pixels glide (260 ms; none with reduced motion). |
| F2 | If that spot would put it on top of something, it goes to the **nearest free** grid spot instead (8 px clear on every side). Things moving in the same drag don't count; a frame is never "in the way" (dropping into a frame still works). |
| F3 | Turning it on tidies the canvas **once**: windows, frames and what is in frames stay; every other card, note and image settles on its nearest free spot, in reading order (top band first, then left to right). One undo step. Loading a board never moves anything. |
| F4 | Settings → General → Canvas → **Align to grid** (a switch, **off by default**); `krnl settings grid [off\|cards\|all]` shows or sets it (`on` = `cards`). |
| F6 | What aligns: **Cards only** (plan, habit and event cards — the default when switched on) or **Everything** (also notes, sticky notes, shapes, images and frames). Whatever doesn't align still counts as "in the way", so a card never lands on a note. Widening from cards to everything tidies once more. |
| F5 | A frame snaps to the grid; its children move with it by the same amount. Windows (mothers) never move. |

## Use Cases

- **UC-G1** A user with a messy board turns Align to grid on: everything lines up, nothing overlaps; Ctrl+Z puts it back.
- **UC-G2** A user drags a note onto another card: it settles next to that card instead of on it.

## Gherkin Scenarios (ATDD)

```gherkin
Feature: Align to grid
  Scenario: F1 — a drop settles on the grid
    Given Align to grid is on
    When I drop a note at (47, 15)
    Then it sits at (80, 0)

  Scenario: F2 — never on top of something
    Given Align to grid is on and a card at (0, 0)
    When I drop a note on top of it
    Then the note lands on the nearest free grid spot next to the card

  Scenario: F3 — turning it on tidies once
    Given three notes piled on each other
    When I turn Align to grid on
    Then all three sit on grid points, apart, and one undo puts them back

  Scenario: F4 — from the terminal
    When I run "krnl settings grid on"
    Then Align to grid is on in Settings, for cards only

  Scenario: F6 — cards only
    Given Align to grid is on for cards only
    When I drop an image at (47, 15)
    Then it stays at (47, 15)
    But a task card dropped there settles on the grid
```

Tests: `tests/unit/renderer/alignGrid.test.ts`, `tests/unit/sys/settings.layout.test.ts`.
