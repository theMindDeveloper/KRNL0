# Line layout: the day as one line

Status: **evaluation build** (2026-11-19). A third layout next to Station and Free, built so the owner can try it and decide whether to make it the default. Code: `src/renderer/components/Line/`, `src/renderer/store/lineLayout.ts`. Design: rows 8 and 9 of the UX review canvas.

## Why

Measured on the demo board (14 plans, Advanced, 1920 × 1080): 163 clickable controls and 306 pieces of text on one screen, and every plan drawn four times (Todo row, board card, Calendar block, Clock entry), each with its own menu. Every window answers the same two questions: what did I mean to do, and what did I do. The Line layout draws that once.

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | **A layout, not a new board.** The top bar's layout switch has a third choice, **LINE**. It is a preference of this install (`localStorage`, key `krnl0-line-layout`): on/off, the page, line or clock. Nothing is added to `board.json`, so older versions open the board unchanged. Both layouts read the same board and write through the same node commands. **Windows** in the Line bar (or Station / Free, or Ctrl+Shift+L) goes back. |
| F2 | **REAL lane.** What was recorded on the day: every work span and break from the timer's history, cut at midnight, plus the running span up to now. A span is named by its label, else its task, else "Recorded". One colour per name, the same on every page. |
| F3 | **PLAN lane.** The day's timed plans (the schedule selector's placements) and repeating events. A plan is **done** (ticked), **covered** (it has started and at least half of it was recorded), **missed** (its time passed) or **open**. A Won't-do plan is not on the line. Repeating events are hatched and never ticked. Parallel plans get a row each at full size. |
| F4 | **Empty time.** A stretch of 30 minutes or more with nothing recorded, between two recorded spans or after the last one until now, is hatched. Clicking it asks what it was (the names used recently, or type one) and saves it as recorded time. Shorter gaps, the time before the first span, and the time after the last span of a past day are never marked. |
| F5 | **One field adds anything.** A name starts recording it (already recording: that span is saved first). Words with a day, a time or a length make a plan (quick add). Repeating words make a habit: "walk daily", "gym mon wed fri", "run 3x a week", "water 8 glasses", "read every day 21:30". One day without "every" is a plan on that day. A line above the field says what Enter will do; for a plain name, Shift+Enter adds it as a plan with no time instead. A plan with a time shows as a ghost on the line before Enter. |
| F6 | **Habits by name.** Today: one chip per habit with a box to tick, its status ("12 days", "2 of 3 this week", "5 of 8 today") and this week's dots. Week: one named column per habit. Habits page: the month per habit, with amounts, rest days, days that are not its days, and the streak; repeating events are listed below. |
| F7 | **Today in words.** Under the line: the day's plans in time order with a checkbox, and "No time yet" beside it. A missed plan has **Did it** (counted on its day), **Later** and **Skip** (Won't do) in its row. A covered plan has **Did it**. Nothing is ticked or moved by the app itself. |
| F8 | **One card for a plan.** Clicking a plan (on the line, the clock or in the list) opens the same card: when, what was recorded during it, a start-time field, Did it / Later (later today, tomorrow at the same time) / Skip, or Not done; Delete. |
| F9 | **Pages.** Today, Week (seven lines; each ends in its own totals), Habits, Board (the canvas with only your own things; the day stays docked above it). The date arrows move a day, a week or a month. The frame is the same on every page: tabs and the date, what you are doing, the middle, the field. |
| F10 | **Line or clock.** Today and Week can be drawn as a 24-hour dial instead: outer ring = PLAN, inner ring = REAL, a hand for now, noon at the top. The day is drawn once on screen either way. |
| F11 | **What you are doing.** The band under the tabs shows what is being recorded and for how long, with Start / Break / Back to work / Stop, and the next plan. The assistant orb sits in a fixed seat left of the field. |
| F12 | **CLI.** `krnl line [status]`, `krnl line on`, `krnl line off`, `krnl line view <today\|week\|habits\|board>`, `krnl line shape <line\|clock>`. |

## Not in this build

Month page; dragging a plan on the line; a habit's right-click menu (rest day, rename, change days) and editing a repeating event from the Habits page; reminders, deadlines and tags in the plan card; the guided tour (written once the owner decides to keep the layout). Guided tours for the windows point at windows that are not on screen in this layout.

## Use Cases

- **UC-L1** The owner opens the app, types "study" and presses Enter. Recording starts; the REAL lane grows.
- **UC-L2** They type "gym 18:00 1h". A ghost block shows at 18:00; Enter adds the plan.
- **UC-L3** A plan's time passed. Its row offers Did it, Later, Skip. They press Skip; it leaves the line and is not counted as missed.
- **UC-L4** They recorded through a plan. Its block is filled and its row offers Did it; one press ticks it.
- **UC-L5** An hour sits empty between two spans. They click the hatched stretch and pick "Gaming".
- **UC-L6** They switch to Clock, then to Week, then tick a habit on the Habits page.
- **UC-L7** They press Windows and are back in Station with nothing changed.

## Gherkin Scenarios (ATDD)

```gherkin
Feature: Line layout

  Scenario: F1 — a layout, not a new board
    Given the Line layout is on
    When I press "Windows"
    Then the windows are shown again
    And board.json has no new fields

  Scenario: F3 — plan states
    Given a plan 08:00–10:00 and time recorded 08:10–10:25
    And a plan 10:30–11:00 with nothing recorded, and it is 14:20
    Then the first plan is drawn covered
    And the second is drawn missed

  Scenario: F4 — empty time
    Given time recorded until 10:25 and again from 11:00
    Then 10:25–11:00 is hatched
    When I click it and choose "Gaming"
    Then 10:25–11:00 is recorded as Gaming

  Scenario: F5 — the one field
    When I type "study"
    Then the field says Enter will start recording "study"
    When I type "gym 18:00 1h"
    Then the field says Enter will add the plan "gym"
    And a ghost block shows at 18:00 on the line
    When I type "walk daily"
    Then the field says Enter will add the habit "Walk": every day

  Scenario: F7 — a missed plan is answered in its row
    Given a missed plan "Doctor"
    When I press "Skip" in its row
    Then "Doctor" is marked Won't do and leaves the line

  Scenario: F10 — the same day as a clock
    When I press "Clock"
    Then the day is a dial with the plan on the outer ring and what I recorded on the inner ring
```
