# Board cards for habits and repeating events

*Decision 42. Issue #229. Design: canvas board "Board cards for habits and events" — draft A, "Same card".*

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | A habit's board card uses the task card's frame (220 × 120, same rows, same ports), but each kind is told apart at a glance: a **task** is plain with a square box; a **habit** is tinted in its colour, has a round tick (or round counter); a **repeating event** has a time tile on its left (start time, length, repeat mark) like its Calendar block. |
| F2 | Habit card: the box ticks today (an amount: + adds one); row 2 shows "habit" and its days and time; the meter shows the week (seven bars, today ringed) and the streak; an amount shows today's count filling to its goal. |
| F3 | A repeating event's board card is never ticked: no box — the time tile; row 2 shows its days; the meter shows the week's days and when it is next ("Today · in 2 h"); while it happens, how much is left, with the running border. |
| F4 | Adding a habit or a repeating event (Habits window, Calendar, board `+ Habit`) creates its card next to the other habit cards; the board's `+ Habit` places it where you clicked; never two cards for one habit. |
| F5 | Archiving or deleting removes its card; a card whose habit is gone says so and offers to remove itself. |
| F6 | Right-click on a card opens the habit's own menu (the same as in the Habits window). |
| F7 | `krnl habit pin <ref>` / `krnl habit unpin <ref>` add and remove a card for a habit or an event. |
| F8 | Easy and Advanced show the same cards (no tags on them). |

## Gherkin Scenarios (ATDD)

```gherkin
Feature: Board cards for habits and events
  Scenario: F4 — a new habit gets its card
    When I add the habit "Read"
    Then a card "Read" appears on the board in the task-card style

  Scenario: F2 — tick today from the card
    Given the card "Read"
    When I click its box
    Then today is ticked for "Read" and its streak grows

  Scenario: F3 — an event card is never ticked
    When I add the repeating event "Class" on Mon and Wed at 10:00
    Then a card "Class" appears with a repeat mark and no box
    And it says when it is next

  Scenario: F5 — deleting removes the card
    When I delete the habit "Read"
    Then its card leaves the board
```
