# Analytics Window (fixed mother)

*ADR: [Decision 32](../03-architecture/decisions.md) · supersedes the free-floating analytics child of #134*

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | Analytics is the seventh fixed mother: `mother-analytics`, kind `analytics`, station slot `main`. It is never spawned or deleted from the UI. |
| F2 | **Canvas mode:** it sits in the mother row right of the terminal (x 1960), is not draggable, and carries the mother frame (badge, corners, drag-to-swap target). |
| F3 | **Station mode:** when shown, it takes the canvas panel in place of the canvas (same panel and size). It is hidden by default, so the canvas keeps its panel. |
| F4 | The station toolbar (and the top bar, for styles that put toggles there) has an **Analytics** toggle. The **Canvas** toggle reads "on" only when the canvas is actually visible. Turning it on while Analytics covers the panel hides Analytics. |
| F5 | The Dock chart button and the `A` key toggle the window in Station mode and centre it in Canvas mode. While Analytics covers the canvas (and the Dock with it), `A` still closes it. |
| F6 | Board migration: older boards get `mother-analytics`. The first free-floating analytics node's view state (tab, range, metric, hidden/pinned cards) is adopted, then every child analytics node and its edges are removed. Idempotent. |
| F7 | CLI: `analytics open`, `analytics close`, `analytics toggle` (read-only `analytics show` is unchanged). |

## Use Cases

- **UC-A1** — In Station mode the user clicks **Analytics** in the toolbar. The dashboard replaces the canvas. They click **Canvas** and the canvas returns.
- **UC-A2** — The AI runs `analytics open` from the terminal to show the user their week.

## Gherkin Scenarios (ATDD)

```gherkin
Feature: Analytics is a fixed window

  Scenario: F3/F4 — show it in place of the canvas
    Given Station mode with the canvas visible
    When I click the Analytics toggle
    Then the analytics dashboard fills the canvas panel
    And the Canvas toggle reads off
    When I click the Canvas toggle
    Then the canvas is back and Analytics is hidden

  Scenario: F2 — canvas mode
    Given Canvas mode
    Then the analytics window sits in the mother row right of the terminal and cannot be dragged

  Scenario: F6 — migrating an old board
    Given a board with a free-floating analytics node on the "estimates" tab
    When the board loads
    Then there is exactly one analytics node, mother-analytics, on the "estimates" tab

  Scenario: F7 — CLI
    When I run "analytics open"
    Then the analytics window is shown in Station mode
```
