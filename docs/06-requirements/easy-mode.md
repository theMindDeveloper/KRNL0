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

## Review, 8 Nov 2026: what Easy should hide now (proposal)

*Status: **proposed, waiting for the user's OK** (D19–D26). The first-run part below is built.*

Since D1–D18 were decided, the app grew: one When plus an optional **Deadline** (Decision 40), habit **amounts** and **times a week**, **repeating events**, **reminders**, **task chains**, the Calendar's line-up and zoom tools, the **terminal / Claude Code**, several **canvases**, frames and wires. A first-day user met most of these during testing and found several confusing (when vs deadline, the habit amount, the add card). The test for each row: *does someone planning their first week need it to plan, do and look back?* If not, it goes to Advanced. Data is never touched (principle 2).

### What a beginner keeps (Easy)

- **Todo:** add a plan, its **When** (a day, any time or a time), how long, a reminder, tick, Won't do, Show.
- **Calendar:** Day / Week / Month, drag plans on, the ANY TIME strip, click empty hours to add, **repeating events** (classes and shifts are real life from day one).
- **Clock:** today's plan and what you recorded.
- **Record:** the stopwatch with Break and Stop (D1), the session list, + log past time.
- **Habits:** name, **days**, a time, tick, streak, Rest today.
- **Analytics:** the overview (D12).
- **Orb:** the tours and the assistant chat.

### New rows

| # | Where | Easy (proposed) | Advanced | Why |
|---|---|---|---|---|
| D19 | **Todo: Deadline** (menu item, the Deadline tab in the plan card, "by fri" in quick add) | Hidden. One date per plan: its When. Existing deadlines still show their flag. | Shown | "Scheduled vs due" was the first confusion in testing; two dates per plan is a planning concept, not a first-week need. |
| D20 | **Habits: Times a week and Amount** (the card's switch and Goal row) | Hidden. The card is name, days, time. Existing goals keep working and still show "1 of 8". | Shown | The amount ("why at least 2?") and weekly targets were hard to read for a new user; plain ticks teach the habit loop first. |
| D21 | **Task chains** (task card: Add next / Add parallel; the cascade) | Creating them is hidden; existing chains keep working. | Shown | Reverses Q2. Chains are a power-planning tool and add a second way a task can move on the Calendar. |
| D22 | **Calendar tools** (line-up, lens, rail, zoom 2.0×) | Hidden; Today, arrows, + and Events stay. | Shown | Four icon buttons a beginner can't name. |
| D23 | **Terminal window, krnl, Claude Code** | The Terminal window is hidden (Station and the top bar); the Orb's chat stays. | Shown | The terminal is for people who want the CLI; it is the most "developer" thing in the app. |
| D24 | **Canvas: wires, frames, several canvases** | Hidden (the canvas switcher, frame tool, drag-to-wire). Notes, images and the pen stay. | Shown | Wires and frames link things (Easy hides links); one canvas is enough to start. |
| D25 | **Settings** | General (mode, theme), Floating timer, Sounds, Reminders, Updates. Categories (D16) and terminal settings hidden. | All | Fewer pages to read on day one. |
| D26 | **Layout** | Starts in **Station** (fixed windows); Free canvas stays one click away. | Either | Station never loses a window; the free canvas is easier once you know the windows. |

### Open questions

- **Q6 (D19):** hide Deadline in Easy, or keep it as a quiet item at the bottom of the menu?
- **Q7 (D20):** hide Amount in Easy, or keep Amount and hide only Times a week?
- **Q8 (D21):** OK to reverse Q2 (chains to Advanced)?
- **Q9 (D23):** hide the Terminal window in Easy, or keep it but closed?

## First run (built 8 Nov 2026)

1. **A brand-new board starts "Your first day" by itself, once,** a moment after the window settles, and never on top of What's new or Welcome back. Its first step says it takes about 4 minutes and that anything made is **practice** (removed or kept at the end). **End tour** says no; the Orb menu always offers it again.
2. New boards are **Easy** (principle 3), so the tour is the Easy loop: plan one thing, put it on today, record, tick, a habit, the day recap.
3. **Its last step but one shows where the mode lives** (Settings → Mode, opened for you) and says, in one line, what Advanced adds: tags and time by tag, focus sessions, naming what you recorded, planned vs spent, deadlines and weekly goals, the terminal and AI. It suggests trying it **after a few days**, once Easy feels easy. **See Advanced** hands over to the live "Easy and Advanced" tour, which puts the user's own mode back at the end unless they pick one.
4. *(Proposed, not built)* After a week in Easy with at least 5 active days, the Orb suggests Advanced once ("Comfortable? Try Advanced"), opening the same tour.

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
