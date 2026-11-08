# Board cards for habits and repeating events

*Decision 42. Issue #229. Design: canvas board "Board cards for habits and events" — draft A, "Same card"; round two: board "Habit and event cards, round two" — draft A, "Today's square and a date page".*

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | A habit's or event's board card is the task card's size (220 × 120) but has **no wire dots**: nothing runs "after" a habit or an event. Each kind is told apart at a glance: a **task** is plain with a square box; a **habit** is tinted in its colour with its week of squares; a **repeating event** has a little calendar page with the next date. |
| F2 | Habit card: row 1 is its name and its streak ("5 in a row") — on a day it isn't on, "next: Mon"; row 2 is "habit" and its days (and time, or its amount: "2 glasses a day"); row 3 is the week as seven squares with day letters, done days filled. **Today's square is the button**: a faint check in a bright outline, filled with the check once ticked; for an amount "+1" and how far ("1/2"), filling from the bottom. On a day it isn't on, today's square can't be clicked. |
| F3 | A repeating event's board card is never ticked. Its **page** shows the next date it happens (weekday or TODAY / NOW, the day, the month) — for every day, some days or once a week; next to it the time span ("17:00 – 18:20", past midnight "23:30 – 01:00") and its rule with when ("every Wed · in 3 days"). While it happens: NOW, how much is left, and a bar. |
| F4 | Adding a habit or a repeating event (Habits window, Calendar, board `+ Habit`) creates its card next to the other habit cards; the board's `+ Habit` places it where you clicked; never two cards for one habit. |
| F5 | Archiving or deleting removes its card; a card whose habit is gone says so and offers to remove itself. |
| F6 | Right-click on a card opens the habit's own menu (the same as in the Habits window). |
| F7 | `krnl habit pin <ref>` / `krnl habit unpin <ref>` add and remove a card for a habit or an event. |
| F8 | Easy and Advanced show the same cards (no tags on them). |
| F9 | An event card's **Skip this one** skips the date on its page (that day only; "Undo skip" brings it back); **Show** opens that week on the Calendar and rings the event's block. `krnl routine skip <name>` and `krnl show <event name>` do the same from the terminal. |
| F10 | Old wires to a habit card (made before F1) are not drawn; they stay in the board and still fire (`krnl edge list`). |

## Gherkin Scenarios (ATDD)

```gherkin
Feature: Board cards for habits and events
  Scenario: F4 — a new habit gets its card
    When I add the habit "Read"
    Then a card "Read" appears on the board in the task-card style

  Scenario: F2 — tick today from the card
    Given the card "Read"
    When I click today's square
    Then today is ticked for "Read" and its streak grows

  Scenario: F3 — an event card is never ticked
    When I add the repeating event "Class" on Mon and Wed at 10:00
    Then a card "Class" appears with no box and no wire dots
    And its page shows the next Monday or Wednesday, and "10:00 – 12:00"

  Scenario: F9 — skip the next one from the card
    Given the card "Class" shows Wed 11
    When I click "Skip this one"
    Then Class is skipped on Wed 11 only
    And the card offers "Undo skip"

  Scenario: F5 — deleting removes the card
    When I delete the habit "Read"
    Then its card leaves the board
```
