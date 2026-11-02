# Canvases (free content per canvas, shared mother data)

*ADR: [Decision 33](../03-architecture/decisions.md)*

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | The board holds a list of canvases (`canvases`, `activeCanvasId`) in the single `board.json`. |
| F2 | Mothers (Pomo, Todo, Habit, Calendar, Clock, Terminal, Analytics) and their data nodes (`todo.task`, `habit.lane`, `habit.day`, `pomo.session`) are shared. They have no `canvasId` and appear on every canvas. |
| F3 | Free nodes (text, image, media, frame, …) and pen strokes belong to exactly one canvas. Only the active canvas's free content is rendered or erasable, and an edge shows only when both of its ends are visible. |
| F4 | Migration: a board with no canvases gets "Main" (`canvas-main`), and all existing free content lands on it. Free nodes without a valid `canvasId` land on the active canvas. Idempotent. |
| F5 | The top-bar switcher lists canvases, with the active one marked by a check and bold text. Click a canvas to switch to it. **+ New canvas** adds one and switches to it. ✎ or a double-click renames inline. ✕ deletes after an in-popover confirm. There are no native pickers. |
| F6 | Deleting a canvas removes its free nodes, its strokes, and the edges touching them. Tasks, habits, the completion ledger, pomo history and analytics are unchanged. The last canvas cannot be deleted. |
| F7 | New free nodes and strokes land on the active canvas. Pen **Clear all** and `draw clear` clear the active canvas only. |
| F8 | CLI: `canvas list [--json]`, `canvas add <name>`, `canvas switch <id\|name>`, `canvas rename <id\|name> <new name>`, `canvas delete <id\|name>`. |

## Use Cases

- **UC-C1:** The user creates a "Research" canvas, drops images there, and switches back to "Main". The images are hidden there, while Todo and Pomo look the same.
- **UC-C2:** The AI runs `canvas list` and then `canvas switch Research` from the terminal.
- **UC-C3:** The user deletes a scratch canvas. Their tasks and analytics are unchanged.

## Gherkin Scenarios (ATDD)

```gherkin
Feature: Multiple canvases

  Scenario: F4 — legacy board migrates onto Main
    Given a board.json without canvases, with a text node and a task
    When it is loaded
    Then the board has the canvas "Main"
    And the text node has canvasId "canvas-main" and the task has none

  Scenario: F3 — free content is per canvas
    Given a text node on "Main" and an image on "Research"
    When "Main" is active
    Then the text and every mother are visible and the image is not

  Scenario: F6 — delete keeps mother data
    Given canvas "Scratch" with a text node linked to a task
    When I delete "Scratch"
    Then the text node and its edge are gone
    And the task, the completion ledger and the pomo history are unchanged

  Scenario: F8 — CLI round trip
    When I run "canvas add Ideas", then "canvas rename Ideas Notes", then "canvas switch Main", then "canvas delete Notes"
    Then "canvas list" shows only "Main"
```
