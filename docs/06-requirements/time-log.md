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
| F7 | **Where I actually stopped.** A recorded span's start and end can be adjusted from the Clock and Calendar span popup (double-click the time, F15) and with `krnl pomo segment <id> --start HH:MM --end HH:MM`. A running session can be stopped "at" an earlier time: `Stop at…` on the Pomo and `krnl pomo stop --at HH:MM`. The edited span keeps its id; the log gets `span.edited`. End must be after start and not in the future. |
| F7b | **Add time I forgot to record.** A finished work span can be added after the fact, where the time lives: on the Calendar week/day view, right-click (or drag) on empty grid time → **Log time here…**; on the Clock, right-click an empty part of the dial → **Log time…**; on the Pomo, **+ Add past session**. A small popover prefills start/end from where the user clicked (or dragged), offers the same task list as **Counts toward** (open, then done ✓, or untagged), and saves a normal recorded span (`pomo.addSegment`), logged as `span.closed` with `manual: true`. CLI: `krnl pomo add --start YYYY-MM-DDTHH:MM --end HH:MM [--task <ref>]`. Rejects spans in the future, end ≤ start, and overlaps with existing work spans (offers to trim instead). |
| F8 | A session left running is never auto-stopped (maintainer decision). Overnight spans keep splitting at midnight in every view. |
| F9 | Analytics "Time" view: task × day heatmap for a chosen week or month, row totals, plan vs actual per task, roll-up by tag. Rows survive task deletion (log snapshot text). |
| F10 | Calendar month view shows recorded hours per day; week view labels recorded spans with their task (time-model, #204). |
| F11 | **Clock "Week" button** (▦ WEEK / `krnl clock week`): the last 7 days as small copies of the main clock face (same bezel, ticks, numerals, hands and frame-style colours). The face shows 12 h, so the morning's recorded work fills the inner disc and the afternoon's the outer ring; the day's total sits in the readout window. Only today's clock has moving hour / minute / second hands. The grid picks its columns from the panel so the clocks are as big as possible. Clicking a day opens it. |
| F12 | Todo rows show the task's tracked total ("3h12") when > 0; the task details show a timeline (per-day minutes, planned blocks with their moves, completion dates). |
| F13 | CLI parity: `krnl time log --from YYYY-MM-DD --to YYYY-MM-DD [--json]` (raw entries), `krnl time report --month YYYY-MM [--by task|tag|day] [--json]`, plus F7's commands. |
| F14 | **App sessions.** Main logs `app.opened` at start and `app.closed` on quit (not for a second launch that hands over). Only the **first start and last shutdown of each day** are shown — and no shutdown for today (the app is open; a day gets its "closed" line once it is over): a thin dashed line across the Calendar day (no words — the time is in the tooltip) and a small tick on the Clock rim. A crash leaves the open marker only. |
| F15 | **One popup for recorded time.** Left- and right-click on recorded time (Calendar and Clock) open the same popup: task name, start → end (double-click a time to edit it in place — Enter saves, Esc undoes; a running session's "now" becomes "Stop at"), **Counts toward** (compact searchable picker, see F16), duration and **Delete segment**. There is no separate right-click menu for recorded time. |
| F16 | **Task / category picker.** One compact picker for every "what does this time count toward": search field, **Tasks** (open, max 6, "+N more — keep typing"), **Done tasks hidden** behind "Show done (n)" (search finds them); in the Doing picker a done task is reopened first ("↺ reopen & track") — work is never tracked on a task that is still done. Past sessions (Counts toward) may still be put on a done task, **Category** as a 3-column icon-chip grid, "+ Add category "…"" when the typed name is new, ↑ ↓ Enter Esc. Used by the Pomo "name this span", the Doing picker filter, and Counts toward. |
| F17 | **Log time — simple.** "Log time you didn't record": one day control (‹ Today ›, Yesterday, a date; never the future), **From / To** time fields with the length beside them ("· next day" when it ends after midnight), a thin 0–24 h strip that only *shows* the day (recorded grey, the new stretch bright, overlap rust, future hatched), at most two "Fill a gap" chips, **For** (the task picker; done tasks hidden; a category can be chosen), and Cancel / Add <length>. When the times overlap recorded work, the message offers **Trim to HH:MM–HH:MM** (the longest free part). |
| F19 | **Category-tracked time** reads as a category, not "untagged": Counts toward shows "◆ Code · category", the Calendar band names the category, and pickers say "Or track a category". The running session has a small trash icon next to STOP: first click arms it ("DISCARD?"), the second within 3 s throws the session away unrecorded. |
| F20 | **Task colours.** Every task that is not archived has its own colour (18 per theme, `--task-1…18`); new tasks take a free one (a random-looking start, then the next free slot), earlier tasks keep theirs, archived tasks free theirs. The Doing picker lists tasks and categories only (no "Recent" list). |
| F18 | **"Clear focus history"** (Analytics settings / `analytics clear-history --yes`) logs `history.cleared`; every log-based view drops spans and completions logged before it. |

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

## Implementation notes (foundation, 2026-11-05)

- **Code:** `src/shared/timelog/` (entry schemas, `timeLogEntriesFromBoards` diff, `backfillEntries`, `foldTimeLog`), `src/main/persistence/timelog.ts` (month files, append, read, backfill marker), `src/renderer/store/timeLog.ts` (`logTime`, `queryTimeLog`, `installTimeLogWriter`), IPC `timelog:append` / `timelog:query`, `src/sys/commands/time.ts` (F13).
- **One choke point per side (F3).** Writers do not log beside each mutation. Each side diffs the board before and after a change with `timeLogEntriesFromBoards` (pomo `history` by span id; `todo.task` nodes by id: text, done/completedAt, `scheduledFor` + block length):
  - renderer: one `boardStore.subscribe` installed from `App` covers UI, command dispatch, `cli:dispatch` and undo/redo. Loads, reloads after a CLI write (main already logged it), factory reset and "clear focus history" run inside `withoutTimeLog` and are not logged.
  - CLI: `SysFacade.run` snapshots `board.json` around `pomo` / `task` / `todo` verbs (read-only verbs skipped). `analytics clear-history` and `board load` are not logged.
  - A task toggle and its todo mirror therefore log one `task.completed`, and reducers applied outside `dispatch` (Calendar week view) are covered.
- **Entry discriminator is `type`** (`span.closed` has its own `kind: work | break`). `id` and `at` are stamped by the writer (renderer: at the action) or by main when missing.
- **Backfill (F4)** runs at startup in main before the window opens, and lazily before the first CLI append or `krnl time` read. Backfilled spans have `at = endedAt`, completions `at = completedAt` (so they land in their own month and day); current plans are logged at backfill time. It skips spans, plans and completions the log already holds, and writes `timelog/.backfilled` only after the append succeeded.
- **Reads:** `queryTimeLog(from, to)` returns every entry from two months before `from` through the newest file, because corrections, F7b adds and backfills are logged in later months and plans are set ahead. `foldTimeLog` clips to the range.
- **Open for the maintainer:** "clear focus history" no longer clears what log-based views will show (the wipe is not logged). A stale-save merge in main that drops a renderer edit leaves that edit in the log.
