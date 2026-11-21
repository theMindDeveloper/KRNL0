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

| F10 | (Owner, 2026-11-21 — Decision 57) **Readable Analytics.** The window follows the theme in every frame style (Classic too). Card titles are words in the reading font ("Focus per day"), not tracked uppercase labels. One hue (the accent) per chart; no gradients, radar, pies or left accent bars. |
| F11 | (Decision 57) **Summary page:** the headline sentence large; four figures in one divided band (label over value) with the change in their own unit against the period before ("+7 on the 30 days before"; "new this period" when there was nothing before) — never a percentage off a near-empty period; **Focus per day** as a chart with round-hour gridlines, dates under it, the average as a dashed line and in words, today marked; then the sentences, whose trends also use units ("2h 30m more than the 30 days before"). |
| F12 | (Decision 57) **Plain charts:** this period and the one before as a list (figure, then "was …"); where your activity came from, your best days, how long you focus at a time, focus on days you finished something, and each habit's check-ins as labelled bar lists; focus by weekday as seven bars with the best day named; counts per day as bars. |
| F13 | (Owner, 2026-11-21 — Decision 58) **Scrolls whole, reads as one.** The pages scroll smoothly and settle on whole pages (no card stops at an edge; the page icons glide to their page); the header stays on one line (the page name gives way first, then the icons scroll); every card is a surface one tone up from the window; every chart uses the accent for its data and the theme's ink for its labels; names in the reading font, figures in tabular digits; hours and weekdays are bars with the best one named; lists and the comparison show whole rows only, compact enough to fit. |
| F14 | (Decision 59) **Whole pages that snap.** A scroll moves one whole page (PagedView, as before Decision 58); every page icon reveals its page. |
| F15 | (Decision 59) **The standard header.** Dot, name, the range switch (7d · 30d · 90d · 365d) at the right, settings last, as every window; the page icons, the page's name and the range's Done / Focus sit in the row below. The range never shortens to letters. |
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
