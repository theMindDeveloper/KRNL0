# Analytics Window (fixed mother)

*ADR: [Decision 32](../03-architecture/decisions.md) · supersedes the free-floating analytics child of #134*

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | Analytics is the seventh fixed mother: `mother-analytics`, kind `analytics`, station slot `bottom-right-pre`. It is never spawned or deleted from the UI. |
| F2 | **Canvas mode:** it sits in the mother row right of the terminal (x 1960), is not draggable, and carries the mother frame (badge, corners, drag-to-swap target). |
| F3 | **Station mode:** its own mother panel in the bottom row, beside the terminal: Canvas · Term · Analytics · Clock. Shown by default; swaps with other mothers like any panel. |
| F4 | The station panel toggles have an **Analytics** toggle, independent of the **Canvas** toggle. |
| F5 | The Dock chart button and the `A` key toggle the panel in Station mode and centre the window in Canvas mode. |
| F6 | Board migration: older boards get `mother-analytics`. The first free-floating analytics node's view state (tab, range, metric, hidden/pinned cards) is adopted, then every child analytics node and its edges are removed. Idempotent. |
| F7 | CLI: `analytics open`, `analytics close`, `analytics toggle`, `analytics summary` (read-only `analytics show` is unchanged). |
| F8 | **Overview summary:** a plain-language summary on top of the Overview tab: headline, four figures with change vs the previous period, a focus-per-day sparkline, and short sentences (best day/hour, streaks, open tasks). |
| F9 | **No scrolling:** cards, the settings list and tables are split into pages of whole items (`ui/PagedView`), flipped with the wheel or the ‹ ● › pager. |

## Use Cases

- **UC-A1** — In Station mode the user sees Analytics in its panel beside the terminal, and hides or shows it with the **Analytics** toggle.
- **UC-A2** — The AI runs `analytics open` from the terminal to show the user their week.

## Gherkin Scenarios (ATDD)

```gherkin
Feature: Analytics is a fixed window

  Scenario: F3/F4 — its own panel beside the terminal
    Given Station mode
    Then the analytics dashboard has its own panel in the bottom row, beside the terminal
    When I click the Analytics toggle
    Then the panel is hidden and the canvas is unchanged

  Scenario: F8 — summary on top of Overview
    Given 12 tasks done and 5h of focus in the last 30 days
    Then the Overview starts with "In the last 30 days you finished 12 tasks and focused 5h."

  Scenario: F9 — pages instead of scrolling
    Given more cards than fit the panel
    Then a pager shows the number of pages and the wheel flips to the next page

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
