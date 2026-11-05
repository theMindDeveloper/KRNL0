# Time Model — Plan vs Reality

*Follow-up to #180 · supersedes the per-task Pomodoro accounting of Decision 22 (F10, F13, F17 in pomo-node.md)*

The app answers three different questions about time. Each lives in exactly one place, and each layer may read the one above it but never control it.

| Layer | Question | Where | Stored as |
|---|---|---|---|
| Estimate | What do I want to do, and roughly how long? | Todo / task card | `TaskState.plannedMin` (`durationMin` and `eta` mirror it) |
| Plan | When do I intend to do it? | Calendar / Clock planned blocks | `scheduledFor` + `scheduledDurationMin` (block length) |
| Reality | What did I actually do? | Pomo spans, drawn on Calendar / Clock | `PomoState.history` (work / break records; a pause is a gap) |

The Pomodoro is an **observer**. A task can only **tag** what it records: `PomoSessionRecord.taskId` and, for the in-flight span, `PomoState.activeTaskId`. Tracked time per task is **derived** from tagged work spans and never written onto the task.

---

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | Tracked time for a task = the sum of the durations of all `kind: 'work'` spans tagged with its id. This includes the live running span and a paused span that hasn't been recorded yet. Breaks and untagged work count toward no task. (`store/trackedTime.ts`) |
| F2 | No pomo action writes `secondsAccumulated`, `pomoSessionsCompleted` or `currentSessionElapsedSec` onto a task. |
| F3 | "Start pomo" on a task, from the todo row menu, `task.startPomo` or `krnl task pomo`, tags the pomo with that task. It starts the pomo at the pomo's own `sessionMin` if idle. It never cancels or resets a running session. |
| F4 | Changing the tag of a running or paused session keeps the timer running. The in-flight span is attributed to the new tag when it closes. |
| F5 | **Suggest, never tag silently** (revised #207, maintainer 2026-11-05). When the Pomo is on no task and an open task's planned block contains "now", the Pomo shows **Planned now: <task>** with one button: **Start on it** (idle) or **Track it** (running untagged); × hides it for that task. START itself never tags. CLI: `pomo start` prints the planned task and the `pomo tag` command to accept it. |
| F6 | The Pomo node shows a tag selector ("● ON <task>") listing open root tasks plus "untagged". Choosing an option dispatches `pomo.tag`. |
| F7 | A recorded span can be retagged (`pomo.retagSegment`, `krnl pomo retag <segmentId> <taskRef|none>`). Its minutes move to the new task. |
| F8 | A single click on a todo row does not touch the pomo. |
| F9 | The task card shows "PLAN <estimate> · TRACKED <tracked>" with a bar filled by tracked ÷ planned once anything has been tracked. The bar turns rust and shows "+X OVER" when tracked > planned. |
| F10 | "Overrun" means tracked > planned. A planned block whose time has passed while the task is still open is "missed", not overrun. |
| F11 | Every write of a task's estimate keeps `plannedMin`, `durationMin` and `eta` equal. On load, older boards are re-synced to `plannedMin`. |
| F12 | Pomo pips count the pomo's own completed sessions within `longBreakEvery`. A task's estimate never creates a session quota. |
| F13 | Task completion is only ever the user's explicit check. Tracked time and the plan never mark a task done. |
| F14 | CLI parity: `pomo tag <taskRef|none>`, `pomo retag <segmentId> <taskRef|none>`, and `task pomo <ref>` (tag + start if idle). |

## Non-Functional Requirements

| # | Requirement |
|---|---|
| NF1 | Task cards subscribe only to the pomo node for tracked time, not to the whole board. |
| NF2 | Tagging is a label change: no history slot is spent on the timer itself, and a tag change can't lose recorded time. |

## Use Cases

- **UC-T1 Plan and observe.** The user writes "Study math, about 4h" and drags it to 09:00. At 09:10 the Pomo shows "Planned now: Study math"; they click **Start on it** and the session is tagged (F5). They pause for a call (gap), take a break (break span), and stop at 12:30. The card shows "PLAN 4h · TRACKED 2h50".
- **UC-T2 Fix attribution later.** A 30-minute span was really spent on Physics. The user retags it from the calendar or with `krnl pomo retag`, and the minutes move (F7).
- **UC-T3 Switch mid-session.** While running on Math, the user picks "Physics" in the tag selector. The timer keeps running, and the current span counts toward Physics (F4).

## Gherkin Scenarios (ATDD)

```gherkin
Feature: The pomodoro observes; tasks only tag it

  Scenario: F3 — Start pomo from a todo row on an event task
    Given the pomo is running untagged
    When the user chooses "Start pomo" on the "Physics" row
    Then the pomo is still running from the same start time
    And it is tagged "Physics"
    And no history record was written

  Scenario: F5 — the Pomo suggests the planned task, the user accepts
    Given "Study math" is planned from 09:00 to 13:00 and it is 09:10
    When the user presses START on an untagged pomo
    Then the session is untagged
    And the Pomo shows "Planned now: Study math" with "Track it"
    When the user clicks "Track it"
    Then the session is tagged "Study math"

  Scenario: F1/F7 — tracked time follows the tag
    Given a 30-minute work span tagged "Math"
    When the span is retagged "Physics"
    Then Math has 0 tracked minutes and Physics has 30

  Scenario: F9/F10 — overrun
    Given a task planned for 60 minutes
    When 61 minutes of work are tagged with it
    Then its card shows "+1m OVER"
```

Tests: `tests/unit/renderer/planVsReality.test.ts`, `tests/unit/sys/pomo.tag.test.ts`, `tests/unit/sys/task.commands.test.ts` (task pomo).
