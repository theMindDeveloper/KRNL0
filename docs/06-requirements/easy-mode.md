# Easy mode / Advanced mode

*Status: **built** (all proposals approved). Q1: no Pomodoro in Easy. Q2: chains kept. Q3: task → habit links hidden. Q4: existing boards stay Advanced. Q5: Easy / Advanced.*

## Why

Each feature works on its own: the canvas, Todo, Clock, Calendar, Habits and the Pomo observer. The complexity sits in the **links between them**:

- spans linked to tasks
- categories, and the classifier that guesses them
- "name this span" after each stop
- the "doing" picker with Continue / New
- Focus buttons that tag the Pomo
- colours that only match when things are linked

Someone who only wants to plan the day and see where the time went has to understand all of that first.

**Easy mode** hides every link. You plan to-dos on the Clock and Calendar, and the observer records Start / Break / Stop. You compare plan and reality **by time**: the planned block and the recorded time sit at the same hour. **Advanced mode** is the app as it is today.

## Principles

1. **One global setting**, `ui.mode: 'easy' | 'advanced'`, in Settings (⚙ in the top bar). There is no per-window switch.
2. **UI only.** The board data and the logic are identical in both modes. Easy hides controls and display. It never deletes or rewrites data, so switching back and forth is lossless.
3. **New boards default to Easy.** An existing board keeps Advanced, so nothing disappears for current users.
4. **The CLI is unaffected.** `krnl` always has every command, and the mode is a display preference. `krnl settings mode easy|advanced` sets it (hard rule 8).

## The decision table

Each row is one link. **Proposed** is my recommendation. Change any cell you disagree with.

| # | Where | Easy (proposed) | Advanced |
|---|---|---|---|
| D1 | **Pomo: which timer** | Observe only: a count-up, Start · Break · Back to work · Stop. The POMO/OBSERVE switch is hidden. | Both modes, with the switch |
| D2 | **Pomo: after a span ends** | Nothing is asked | "Name this span" (name, category or task) |
| D3 | **Pomo: what am I doing** | Hidden: no doing picker, no TASK row | Doing picker, Continue / New |
| D4 | **Pomo: span log ☰** | Shown: times, durations, delete. No rename. | Rename, category, task |
| D5 | **Recorded time colour** (Clock, Calendar, strip) | Work is one colour (acid) and breaks are hatched grey | Task colour, else category colour |
| D6 | **Recorded-span popup** (Clock/Calendar click) | Times, duration, Delete | + "Counts toward" retag |
| D7 | **Recorded-span right-click menu** | Delete only | + Retag / Untag |
| D8 | **To-do tags** (chip, "Set tag…", auto-tagging) | Hidden. Tags are still auto-computed silently, so Advanced shows them later. | Shown and editable |
| D9 | **To-do "Start pomo" / Focus** (Todo menu, task popup, task right-click) | Hidden | Shown |
| D10 | **Task popup** (left-click on the Clock/Calendar) | Name, time, Done / Reopen, Show, Unplan | + category, tracked time, Focus |
| D11 | **Calendar "tracked" and overrun badges on planned blocks** | Hidden: planned blocks show the plan only | Shown |
| D12 | **Analytics** | Overview with planned time, worked time, breaks per day, tasks done and habits. The Time-by-tag and Estimates pages are hidden. | All pages |
| D13 | **Untagged Pomo start suggests the planned task** (time-model F5) | Off: an Easy span is never linked automatically | On |
| D14 | **Task chains, sequence and parallel** (the cascade on the Calendar) | Kept: it's scheduling, not tracking | Kept |
| D15 | **Task → Habit links** (finishing a task ticks a habit card) | Creating them is refused with a notice; existing ones keep working | Allowed |
| D16 | **Categories in Settings / "+ new category"** | Hidden | Shown |
| D17 | **Canvases** | Unchanged in both modes: canvases are not a link | Unchanged |
| D18 | **Habits** | Unchanged: tick, streak, schedule on the Clock/Calendar | Unchanged |

**Open questions ❓**

- **Q1 (D1):** Do Easy users ever need the classic 25-minute Pomodoro? Proposed: no. Easy is a stopwatch with breaks, and Advanced has Pomodoro.
- **Q2 (D14):** Keep task chains in Easy? Proposed: yes. Dragging a task pushes the ones after it, which feels natural even without links.
- **Q3 (D15):** Hide creating task → habit links in Easy? **Decided: yes.**
- **Q4 (principle 3):** Should *your* current board start in Easy or in Advanced?
- **Q5:** Name: "Easy / Advanced", or "Simple / Connected"?

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | A global setting `ui.mode` (`easy` / `advanced`) is stored with the app settings. A new board defaults to `easy`; an existing board without the setting is `advanced`. |
| F2 | Settings (⚙) shows the choice as two cards: **Easy**, "plan your day and see where the time went", and **Advanced**, "connect tasks, categories and focus". No native controls. |
| F3 | Every row D1–D18 behaves as its Easy / Advanced column says. |
| F4 | Switching modes never changes board data. Spans named or linked in Advanced keep their name and link and show them again when switched back. Easy only hides them. |
| F5 | One hook, `useUiMode()`, is the single gate in the renderer. Components never read the setting directly. |
| F6 | CLI: `krnl settings mode [easy\|advanced]` shows or sets the mode. All other commands work in both modes. |

## Non-Functional Requirements

| # | Requirement |
|---|---|
| NF1 | No duplicated logic: the difference between modes is limited to render branches behind `useUiMode()`. |
| NF2 | Every D-row that hides something has a render test in each mode. |
| NF3 | Switching modes applies instantly, without a reload. |

## Use Cases

- **UC-E1:** A new user plans "Gym 18:00" in Todo. At 18:05 they press Start, at 18:40 Break, and at 18:50 Stop. The Clock shows the planned Gym arc and the recorded time under it. They are never asked anything.
- **UC-E2:** That user opens Analytics and sees 35 min worked, 10 min break and 1 of 2 tasks done today. There are no category pages.
- **UC-E3:** Later they switch to Advanced and see the categories, the "name this span" panel and the Focus buttons. Their past spans show as unnamed, and nothing is lost.
- **UC-E4:** A power user in Advanced switches to Easy for a demo. Named spans render in plain acid. Switching back restores their colours and names.

## User Stories

- As someone who just wants to plan my day, I want to start and stop a timer without being asked what I did.
- As that person, I want my to-dos on the Clock and Calendar without tags or focus buttons.
- As a power user, I want everything connected, and I want to keep it.

## Gherkin Scenarios (ATDD)

```gherkin
Feature: Easy mode hides the links, keeps the data

  Scenario: F1 — new board defaults to Easy
    Given a fresh board with no ui.mode setting created by this version
    Then the app is in Easy mode

  Scenario: D2 — Easy never asks to name a span
    Given Easy mode and the Pomo is running
    When I press Stop
    Then no "Name this span" panel appears
    And the span is recorded unnamed

  Scenario: D5 — recorded time is one colour in Easy
    Given a span linked to task "Thesis"
    When I am in Easy mode
    Then the span renders in the work colour, not Thesis's colour
    When I switch to Advanced
    Then it renders in Thesis's colour

  Scenario: F4 — switching modes is lossless
    Given a span named "emails" with category Admin
    When I switch to Easy and back to Advanced
    Then the span is still named "emails" with category Admin

  Scenario: D12 — Analytics in Easy
    Given Easy mode
    Then the Analytics window shows planned, worked and break time
    And the Time-by-tag page is not offered

  Scenario: F6 — CLI sets the mode
    When I run "krnl settings mode easy"
    Then the app switches to Easy mode
```
