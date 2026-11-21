# One-time events: tasks and events, split by one question

Decision 62 (proposed) · design: canvas "KRNL0 one-time events" (drafts, waiting for the owner's pick).

The owner asked what is right: "having scheduled to-do tasks and also events, or what makes more sense?" Both, split by one question: **do I have to do it, or does it just happen?**

- A **task** is something you do. It lives in Todo, you tick it, and it can be missed. Dragging it onto the Calendar (or giving it a time) places it in the hours.
- An **event** is something that happens at a time: a class, an appointment, an exam, a dinner. It lives on the Calendar (and the Clock), is never ticked and is never "missed". It happens **once or repeats**.

Today only repeating events exist (Decision 39/40); a one-time thing has to be made as a task, so it shows up in Todo, gets a tick box and turns "Missed". This closes that gap.

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | **One-time events.** An event can happen once: a name, a day, a time, a length and an optional place. It is drawn like a repeating event (calm tinted card behind plans, shared lanes with plans, Decision 61) without the repeat mark; its meta line reads the time only ("15:00–16:00"), never "every week". |
| F2 | **Never a task.** A one-time event is not in Todo, has no tick box, never reads "Missed", is not counted in plan-vs-actual or streaks, and is not a Pomo target. |
| F3 | **The Calendar adds events.** The Calendar's add field (and double-clicking empty hours) makes an event; **Once** is the default and **Repeats** is one click away (or the words "every …"). How a task is made from the Calendar instead follows the picked draft. |
| F4 | **Todo adds tasks.** Todo's field is unchanged; a task gets a time by dragging it onto the Calendar or through its When. |
| F5 | **Same handling as every event.** A one-time event is dragged, resized, opened (left click: its info card; right click: Edit, Delete) and laid out exactly like a repeating one; on the Clock it is the same outlined arc. |
| F6 | **Turn one into the other.** An event's menu offers *Make it a task* (it moves to Todo with its time); a task's menu offers *Make it an event* (it leaves Todo; its time stays). *Make it repeat* turns a one-time event into a repeating one (its weekday preselected). |
| F7 | **CLI** (rule 8): `krnl event add "<name>" --on <YYYY-MM-DD or day> --at HH:MM [--for 1h] [--place "<room>"]`; `krnl event list` shows one-time and repeating events; `krnl event move <ref> --on <date> --at HH:MM`; `krnl event repeat <ref> --days mon,wed`; `krnl event task <ref>` / `krnl task event <ref>` (F6). |
| F8 | **Tutorial:** the Calendar tour gains a step: add a one-time event from the Calendar, and see that Todo is unchanged. |

## Non-Functional Requirements

| # | Requirement |
|---|---|
| NF1 | **Additive data, safe for older versions.** A one-time event is the same record as a repeating event (`Habit`, `kind: 'routine'`) with `schedule.kind: 'weekly'` on its weekday, `endsOn` = its date and a new `startsOn` = its date. An older KRNL0 that does not know `startsOn` still reads it without failing (a new schedule kind would crash its `isDayScheduled`). |
| NF2 | No board schema bump; no migration (existing plans stay tasks). |
| NF3 | Every piece follows the one standard of Decision 61: shared lanes, the one drag ghost, per-device window places. |

## Use Cases

- **UC-E1 Add an appointment.** The user types "Dentist fri 15:00 1h" in the Calendar's field and presses Enter; a one-time event appears on Friday 15:00–16:00; Todo is unchanged.
- **UC-E2 Add a class.** The user types "Linear algebra every mon 10:00 90m"; a repeating event appears every Monday.
- **UC-E3 Plan a task.** The user drags "Write report" from Todo onto Thursday 14:00; it is a task block there (tick box, in Todo).
- **UC-E4 Change kind.** An event that turned out to need doing is made a task from its menu; it appears in Todo with its time.

## User Stories

- As a user, I want to put a one-off appointment on my Calendar without it appearing in my to-do list or turning "Missed".
- As a user, I want the Calendar's field to make events and Todo's field to make tasks, so I always know what I am adding.

## Gherkin Scenarios (ATDD)

```gherkin
Feature: One-time events (F1, F2, F3)
  Scenario: An appointment is an event, not a task
    Given the week of 16 Nov 2026 is shown
    When I type "Dentist fri 15:00 1h" in the Calendar's field and press Enter
    Then Friday 20 Nov shows "Dentist" from 15:00 to 16:00 as an event
    And it has no tick box and no repeat mark
    And Todo has no "Dentist" row

  Scenario: It is never missed
    Given the event "Dentist" was on Friday 20 Nov at 15:00
    When it is Saturday
    Then "Dentist" does not read "Missed"

Feature: Kinds can change (F6)
  Scenario: Make an event a task
    Given the one-time event "Return library books" on Thursday 10:00
    When I choose "Make it a task" in its menu
    Then Todo has "Return library books" planned Thursday 10:00
    And the Calendar shows it as a task block

Feature: CLI (F7)
  Scenario: Add a one-time event from the terminal
    When I run krnl event add "Exam" --on 2026-12-03 --at 09:00 --for 2h
    Then the Calendar shows "Exam" on 3 Dec from 09:00 to 11:00 as an event
```
