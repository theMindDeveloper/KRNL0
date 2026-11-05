# Time Log — what you did, when, on what (month view)

Issue: [#207](https://github.com/theMindDeveloper/KRNL0/issues/207) · Decision 35 · builds on [time-model.md](time-model.md) (Decision 31)

## The rule (unchanged from Decision 31, confirmed by the maintainer 2026-11-05)

**The plan is what you intended; recorded time is what happened.** Only recorded
work spans count as time spent. Scheduling is optional. Both workflows write the
same data:

- **Observe-first:** start Observe, type or pick the task, switch tasks as you go,
  tick done. No calendar block ever exists; analytics shows actual time only.
- **Plan-first:** drag the task onto the calendar; at START the Pomo picks the task
  whose block contains "now" (time-model F5); the calendar shows the outline
  (plan) beside the filled band (reality), "started 20 min late, +50 min".

What was missing is **memory**: plans are overwritten when moved, a task's plan
disappears with the node, a re-completion overwrites the first completion date,
time-by-tag books a task's time on its completion day, and a forgotten session
cannot be corrected to when the user actually stopped.

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | Main keeps an append-only time log: one JSON-lines file per month at `<boardDir>/timelog/YYYY-MM.jsonl`. Lines are never rewritten; corrections are new lines. |
| F2 | Entries: `span.closed`, `span.edited` (new start/end), `span.retagged`, `span.deleted`, `plan.set` (task, start, length), `plan.cleared`, `task.created`, `task.renamed`, `task.completed`, `task.reopened`. Every entry has `v`, `id`, `at` (when it was logged), and a snapshot of the task text and tag so history reads correctly after the task node is gone. |
| F3 | Every renderer and CLI path that records a span, edits/retags/deletes one, schedules/moves/unschedules a task, creates/renames a task, or completes/reopens it appends the matching entry (renderer via IPC, CLI in-process). Logging failure never blocks the action. |
| F4 | First start with no log: a one-time backfill writes the existing pomo history (`span.closed`), current plans (`plan.set`) and the completion ledger (`task.completed`), then a marker file. Idempotent. |
| F5 | Every completion is kept: re-completing a task adds a new `task.completed` entry instead of replacing the first. |
| F6 | Time per task per day folds the log (spans with their edits, retags and deletes; split at local midnight). Time per tag is booked on the **days worked**, not the completion day, and includes open tasks. |
| F7 | **Where I actually stopped.** A recorded span's start and end can be adjusted from the Clock and Calendar span popover (time fields) and with `krnl pomo segment <id> --start HH:MM --end HH:MM`. A running session can be stopped "at" an earlier time: `Stop at…` on the Pomo and `krnl pomo stop --at HH:MM`. The edited span keeps its id; the log gets `span.edited`. End must be after start and not in the future. |
| F7b | **Add time I forgot to record.** A finished work span can be added after the fact, where the time lives: on the Calendar week/day view, right-click (or drag) on empty grid time → **Log time here…**; on the Clock, right-click an empty part of the dial → **Log time…**; on the Pomo, **+ Add past session**. A small popover prefills start/end from where the user clicked (or dragged), offers the same task list as **Counts toward** (open, then done ✓, or untagged), and saves a normal recorded span (`pomo.addSegment`), logged as `span.closed` with `manual: true`. CLI: `krnl pomo add --start YYYY-MM-DDTHH:MM --end HH:MM [--task <ref>]`. Rejects spans in the future, end ≤ start, and overlaps with existing work spans (offers to trim instead). |
| F8 | A session left running is never auto-stopped (maintainer decision). Overnight spans keep splitting at midnight in every view. |
| F9 | Analytics "Time" view: task × day heatmap for a chosen week or month, row totals, plan vs actual per task, roll-up by tag. Rows survive task deletion (log snapshot text). |
| F10 | Calendar month view shows recorded hours per day; week view labels recorded spans with their task (time-model, #204). |
| F11 | Clock "Week" button: seven small static dials (AM and PM) for the last 7 days drawn once from the log; only today's dial is live. |
| F12 | Todo rows show the task's tracked total ("3h12") when > 0; the task details show a timeline (per-day minutes, planned blocks with their moves, completion dates). |
| F13 | CLI parity: `krnl time log --from YYYY-MM-DD --to YYYY-MM-DD [--json]` (raw entries), `krnl time report --month YYYY-MM [--by task|tag|day] [--json]`, plus F7's commands. |

## Non-Functional Requirements

| # | Requirement |
|---|---|
| NF1 | `board.json` does not grow because of the log; a month file of a heavy user stays under ~1 MB. |
| NF2 | Appends are atomic per line (single `appendFile` of a full line); a torn last line is skipped on read. |
| NF3 | Overviews render from a folded per-day summary computed once per open (memoised), not per frame; static dials never animate (frame budget, #197). |
| NF4 | Each worktree's data folder (`KRNL0_BOARD_DIR`) gets its own `timelog/`. |

## Use Cases

- **UC-L1 Look back.** After a month the user opens Analytics → Time → October: rows per task, columns per day, totals; "build cluster" shows 14h over 6 days though it was deleted last week.
- **UC-L2 Forgot to stop.** Observe ran from 14:00 until the next morning. The user opens the span on the Calendar, sets the end to 18:30; every view and the month report now say 4h30.
- **UC-L4 Forgot to press start.** The user worked on "API" 09:00–10:30 without Observe running. On the Calendar they drag across 09:00–10:30 on today's column, choose **Log time here…**, pick "API" and save; the band appears and the month report counts it.
- **UC-L3 Postponed plan.** "Deploy" was planned Mon 10:00 and moved to Wed; the task timeline shows both, and plan vs actual uses the latest plan.

## Gherkin Scenarios (ATDD)

```gherkin
Feature: Durable time log

  Scenario: F1/F3 recording a span appends to the month file
    Given an empty time log
    When a 25-minute work span tagged "Math" closes on 2026-11-05
    Then timelog/2026-11.jsonl has one "span.closed" line with taskId and text "Math"

  Scenario: F5 re-completion keeps both dates
    Given "Deploy" was completed on Nov 3 and reopened
    When it is completed again on Nov 5
    Then the log has two "task.completed" entries for it

  Scenario: F6 time per tag on the days worked
    Given spans tagged task "API" (tag "backend") on Nov 3 (2h) and Nov 4 (1h)
    And "API" is completed on Nov 5
    Then the tag report shows backend 2h on Nov 3 and 1h on Nov 4

  Scenario: F7 adjust where I actually stopped
    Given a span 14:00–09:00 next day
    When the user sets its end to 18:30
    Then the span lasts 4h30 everywhere and the log has a "span.edited" line

  Scenario: F7 stop a running session at an earlier time
    Given Observe is running since 14:00 and it is 22:00
    When the user chooses Stop at 18:30
    Then a span 14:00–18:30 is recorded and the Pomo is idle

  Scenario: F7b log time I forgot to record
    Given nothing was recorded between 09:00 and 10:30 today
    When the user logs a span 09:00-10:30 for "API" from the Calendar
    Then a recorded work span 09:00-10:30 tagged "API" exists
    And the log has a "span.closed" line marked manual

  Scenario: F4 backfill is idempotent
    Given a board with 3 recorded spans and no time log
    When the app starts twice
    Then the log has exactly 3 "span.closed" lines
```
