# Analytics — Plan vs Actual

*Builds on [time-model.md](time-model.md) · new AnalyticsNode view `estimates` ("Plan vs actual")*

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | `analytics/estimates.ts` computes, for a date range: per-task estimate (`plannedMin`, or the completion ledger's copy for deleted tasks) vs actual (all-time minutes of pomo work tagged with the task). It covers every task with tagged work or a completion in the range. |
| F2 | KPIs: median tracked ÷ planned over finished tasks (falls back to all tracked tasks), the count of tasks over and within plan, planned and tracked totals, and the share of pomo work that was tagged. |
| F3 | Per day: minutes of planned calendar blocks (schedule selector) vs minutes of pomo work. Blocks and spans that cross midnight are split by day. |
| F4 | Focus mix in the range: work on a task, untagged work, breaks. |
| F5 | The AnalyticsNode has a "Plan vs actual" tab with four cards: headline tiles, estimate vs actual per task (paired bars on one minutes axis), planned vs worked per day, and where the time went. Cards can be hidden and pinned like every other card. |
| F6 | Accuracy is also given in words: "tasks take ×1.5 your estimate", "your estimates are on target", or "tasks take 60% of your estimate". |
| F7 | CLI parity: `krnl analytics show --view estimates [--range N] [--json]`. |
| NF1 | Series palette (planned #1ba3bb, tracked #c8553d, break #83a332) is validated on the dark analytics surface. Break also carries a hatch texture and a label, because of the CVD warning against tracked. |

## Gherkin Scenarios (ATDD)

```gherkin
Feature: See how long things took versus how long I planned

  Scenario: F1/F2 — estimate accuracy
    Given "Math" was planned for 60 minutes and 90 minutes of pomo work were tagged with it
    When I open Analytics → Plan vs actual
    Then Math shows planned 1h and tracked 1h30
    And the accuracy tile reads ×1.50 — "tasks take ×1.5 your estimate"

  Scenario: F1 — deleted tasks still count
    Given a finished task was deleted after 90 minutes of tagged work
    Then it still appears, marked deleted, with its ledger estimate
```

Tests: `tests/unit/renderer/analytics.estimates.test.ts`, `tests/unit/sys/analytics.estimates.test.ts`.
