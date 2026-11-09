# Plans: one When, an optional Deadline · repeating events on the Calendar

Decision 40 · Issues #219–#221 · End design on the canvas "KRNL0 launch designs" (row "End design").

## Functional Requirements

- **F1** A plan has one When: a day + time (on the grid) or a day at any time (the ANY TIME strip). It can have neither.
- **F2** A plan may have a Deadline, separate from its When, shown with a flag in the row and on the Calendar.
- **F3** Quick add reads a day alone as When (any time), "by/due/before/deadline <day>" as Deadline, and "every …" as a hint only. Enter always adds; there is no second "how long" step.
- **F4** The Calendar week and day views always show the ANY TIME strip. Dropping a Todo row or a block on a day's strip cell puts the plan on that day at any time; dragging a strip chip into the hours gives it that time.
- **F5** Five kinds look different: timed plan (filled block), any-time plan (solid chip), deadline (dashed flag), timed habit (stadium with a ring), repeating event (hatched band).
- **F6** The When popover sets day, time or any time, length and reminder (reminder only with a time); a Deadline tab sets or clears the deadline. It replaces Edit time, Due date… and Reminder….
  - Reminder timing (audit 2026-11-09): a reminder shows once when its time has come and the plan has not started yet. A plan made or moved inside its lead time still gets it; a plan that already started (the laptop slept through it) is never announced late. A damaged board.json delays reminders until it is readable; none are skipped.
- **F7** Menus show icons, group items, and show the current value at the right. The timer item follows the timer: "Focus on it" (Pomo), "Track it now" (Observe).
- **F8** The habit add card asks nothing in prose: on days / times a week, optional time, optional amount; Enter adds with the defaults.
- **F9** The Habits window lists only habits. Repeating events are made on the Calendar (drag on empty hours → Repeats) and listed under the Calendar's Events menu, ended ones included.
- **F10** Every action has a `krnl` command: `todo when`, `todo deadline` (`todo due` alias), `event add|list|skip|move|end|restart|remind|delete` (`routine` alias).
- **F11** Old boards: a `dueOn` with no Calendar time becomes the plan's any-time day; a `dueOn` with a time stays its deadline.

## Non-Functional Requirements

- **NF1** Works in the Station windows (~350 px wide); text wraps, nothing is cut or hidden behind "+N".
- **NF2** No emojis, no native pickers, functional text ≥ 11 px.

## Use Cases

- **UC-P1** Put a plan on Friday with no time, by typing "fri" or by dragging the row onto Friday's ANY TIME cell.
- **UC-P2** Plan an essay on Tuesday 16:00 with a deadline on Saturday; see both, told apart.
- **UC-P3** Add "Class" every Mon and Wed 11:00–12:30 from the Calendar; skip one, end it, delete it.
- **UC-P4** Add a habit "Gym" on M W F at 18:00 in two keystrokes plus three day toggles.

## Gherkin Scenarios (ATDD)

```gherkin
Feature: One When, an optional Deadline
  Scenario: F1/F3 a day alone is When, any time
    Given an empty Todo
    When I type "Pay rent fri" and press Enter
    Then "Pay rent" is on Friday at any time and has no deadline

  Scenario: F3 "by" sets a deadline
    When I type "Essay tue 16:00 by sat" and press Enter
    Then "Essay" is on Tuesday 16:00 and its deadline is Saturday

  Scenario: F4 drop on the ANY TIME strip
    Given a plan "Groceries" with no When
    When I drag its Todo row onto Wednesday's ANY TIME cell
    Then "Groceries" is on Wednesday at any time

  Scenario: F4 strip to hours
    Given "Groceries" on Wednesday at any time
    When I drag its chip into Wednesday 10:00
    Then it is on Wednesday 10:00 and no longer in the strip

  Scenario: F11 migration
    Given an old board item with dueOn "2026-11-13" and no Calendar time
    When the board loads
    Then its onDay is "2026-11-13" and it has no dueOn

  Scenario: F9 events live on the Calendar
    Given a routine "Class" from an old board
    Then the Habits window does not list it
    And the Calendar's Events list shows "Class"
```
