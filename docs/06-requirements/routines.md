# Routines and any-time habits

Decision 39 · issue #217 · design: "Habits & routines · three nodes", direction **B · Two shelves** (Claude Design canvas, picked 2026-11-08).

A **routine** repeats on set days at a set time and just happens — a class every Monday, a work shift, a weekly call. It is never ticked. A **habit** is something you tick; it may now repeat with **no time** ("No sugar"). Tasks stay one-off in Todo.

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | **One record, one switch.** A routine is a habit entry with `kind: 'routine'`. The Repeat editor (add row and edit) starts with a two-way switch *Routine · it just happens* / *Habit · I tick it*. Routine: days, start time and length are required. Habit: days required, time optional (**Any time**, the default for a new habit). |
| F2 | **Two shelves.** The Habits & Routines node shows HABITS (week/month/year grid, unchanged) above ROUTINES. A shelf label shows only when its shelf has entries. Both scroll together; nothing is hidden behind "+N". |
| F3 | **Routine row:** one line — icon, name (ellipsis, full name on hover), the seven day letters (scheduled days bright), and on the right: `now · until HH:MM` while it runs, `today HH:MM` later today, `next <Day> HH:MM` otherwise, `skipped <Day>` when this week's occurrence is skipped, `ended` after its end. Rows are ordered by next occurrence. |
| F4 | **Routines are never ticked or counted:** no tick cells, no streak, no repair prompt, no "missed", no Welcome back entry, no milestone card, not in habit analytics, not a Pomo-edge or lane target. Toggling a routine's day does nothing. |
| F5 | **Any-time habits:** a habit with no `timeOfDay` is ticked in the grid as today; it is not drawn on the Calendar or the Clock dial. |
| F6 | **Calendar band:** each routine occurrence in the shown hours is a soft band across its day column behind plans (routine colour at ~12 %, top/bottom hairlines), with its name and a repeat icon at the top; narrow columns show its first letters (F28 rules). Plans draw on top; a plan overlapping a band says so in its tooltip ("overlaps Class"). |
| F7 | **Routines layer:** a third layer switch, *Routines*, beside Recorded and Habits (on by default, remembered like the others). |
| F8 | **One occurrence:** clicking a band opens a popover: *Skip this one* (the band becomes a dashed outline reading "Skipped"; *Undo skip* brings it back), *Move this one* (app time field; only that date moves), *Edit routine…*, *End routine…*. |
| F9 | **End, don't delete:** *End routine* sets `endsOn` (after today, or a chosen date); occurrences after it are not drawn. Ended routines leave the shelf and are listed under *Ended* in the node's settings with *Restart*. Delete stays available in the settings. |
| F10 | **Turn into:** a habit's context menu offers *Turn into routine* (needs a time; asks for one if missing) and a routine's offers *Turn into habit*. The tick log is kept. |
| F11 | **Clock:** a routine is an outlined arc in its colour (no fill, no tick). Untimed habits are not on the dial. |
| F12 | **CLI** (rule 8): `routine add "<name>" --days mon,wed --at 10:00 --for 120`, `routine list`, `routine skip <ref> [--on YYYY-MM-DD]` (default: next occurrence), `routine unskip <ref> --on <date>`, `routine move <ref> --on <date> --at HH:MM`, `routine end <ref> [--on <date>]`, `routine restart <ref>`, `habit kind <ref> routine\|habit`; `habit schedule <ref> --daily` without `--at` makes it any time. |
| F13 | **Tutorial:** a "Habits & Routines" tour (guided-tours.md) — two shelves; add a routine; see it on the week; skip one week; a habit with no time; end, don't delete. Reachable from Help. |

## Non-Functional Requirements

| # | Requirement |
|---|---|
| NF1 | Additive data only: every new field optional; old boards load unchanged and every existing entry is a habit. |
| NF2 | One guard, `isRoutine(h)`, used by every consumer that ticks, counts or flags habits; each consumer has a test. |
| NF3 | All text ≥ 11 px; no emoji; line icons; no left accent bars; no native pickers. |
| NF4 | A routine row is ≤ 28 px tall; the node fits 360 × 320 (Station) and scrolls inside. |

## Use Cases

- **UC-R1** A student adds "Class", Routine, Mon + Wed 10:00 for 2 h → it appears on the ROUTINES shelf and as a band every Monday and Wednesday.
- **UC-R2** No class next Monday → click the band → Skip this one → dashed "Skipped"; the shelf row says "skipped Mon".
- **UC-R3** Semester over → End routine → after the date nothing is drawn; history stays; Restart later.
- **UC-R4** "No sugar" as a habit, every day, Any time → ticked in the grid, not on the Calendar.
- **UC-R5** A class entered earlier as a habit → right-click → Turn into routine → the tick cells and streak go; the band appears.

## User Stories

- As a student, I want my classes on my week so I plan around them, without ticking them.
- As someone building habits, I want "No sugar" tracked every day without pretending it happens at 09:00.

## Gherkin Scenarios (ATDD)

```gherkin
Feature: Routines are never ticked
  Scenario: F4 — a routine has no streak and toggling does nothing
    Given a routine "Class" on Mondays at 10:00 for 120 minutes
    When I toggle "Class" for today
    Then its log is unchanged and no streak is shown

Feature: Any-time habits
  Scenario: F5 — a daily habit without a time
    Given a habit "No sugar" every day with no time
    Then it is not drawn on the Calendar
    And ticking today adds today to its log

Feature: Skip one occurrence
  Scenario: F8 — skip next Monday
    Given the routine "Class" on Mondays at 10:00
    When I skip it on next Monday
    Then that Monday shows a dashed "Skipped" outline
    And the Monday after shows the band as usual

Feature: End, don't delete
  Scenario: F9 — end after today
    Given the routine "Class"
    When I end it after today
    Then no band is drawn after today
    And "Class" is listed under Ended with Restart

Feature: Welcome back ignores routines
  Scenario: F4 — away for four days
    Given a routine "Class" on Mondays and I was away over a Monday
    When Welcome back opens
    Then "Class" is not listed as slipped
```
