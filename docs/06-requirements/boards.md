# Boards (each one complete on its own)

*ADR: [Decision 49](../03-architecture/decisions.md). Replaces the shared-data canvases of [canvases.md](canvases.md) in the app's UI.*

A board is a separate space: its own todos, habits, calendar, timer history, analytics (the time log), notes, images and drawings. Nothing is shared between boards. It is the ordinary "workspace" model, so the menu needs no explanation.

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | The top bar has a board menu. It lists the boards, each with one fact ("18 plans · 5 habits", "nothing yet"), the open one marked. The menu shows in Easy and Advanced alike, also with a single board, and follows changes by itself: a board made on the website or another device appears without a reload (owner, 2026-11-21: in Easy a board that came by sync was out of reach). |
| F2 | **New board** asks for a name and one choice: **Start empty**, or **Copy my habits** (the open board's habits, their history at zero; plans and history are never copied). The new board opens. Names are unique. |
| F3 | Opening a board swaps the whole app to it: the window reloads onto that board. Easy / Advanced and the layout come along to a new board; settings, style and light / dark are one for the app. |
| F4 | **One timer at a time.** A timer left running (or paused, or on a break) keeps running in its board. In any other board a chip in the top bar says "Recording in *board* 12:40"; pressing it opens that board. Starting the Timer while another board is recording is refused, and the chip says "Stop the timer in *board* first". |
| F5 | A board can be renamed in the menu. |
| F6 | A board can be deleted from the menu after an in-menu confirm. The open board and the last board cannot be deleted. A deleted board's files are kept in `boards/.deleted/`. |
| F7 | CLI: `board list [--json]`, `board new <name> [--copy-habits]`, `board switch <id\|name>`, `board rename <id\|name> <new name>`, `board delete <id\|name>`. `board show / summary / stats` still describe the open board. Every other `krnl` command works on the open board. |
| F8 | **Migration, once.** A board file with several canvases becomes several boards. The first canvas keeps every plan, habit, the calendar, the recorded time and its own notes. Each other canvas becomes a board with its own notes, images, drawings and the links among them, and fresh, empty lists. The file as it was is copied to `board.json.before-boards-<date>` first. The app says so once ("Your canvases are now boards"). A board with one canvas simply becomes one board, silently. |
| F9 | **A switch is not a start.** Opening another board never shows the start-up screen, What's new or Welcome back, and the AI does not say hello: the board simply appears. |
| F10 | **Reminders from every board.** A plan with a reminder in a board that is not open still reminds, and the notification names the board. |
| F11 | **One timer, every way to start.** F4 holds for every way a timer can start: the Timer's button, a task, the calendar, a shortcut and `krnl pomo start` (which answers with the board the timer runs in). |
| F12 | **A tutorial.** `krnl tour start boards` (and the Orb's Tutorials list, Advanced): the name in the top bar, opening the menu, what a line shows, rename and delete, **New board** with its two ways to start, one timer at a time and reminders from every board. It is voiced like every tour. |

## Non-Functional Requirements

| # | Requirement |
|---|---|
| NF1 | Nothing else in the app changes how it reads a board: the open board is always `board.json` and `timelog/` in the board folder. Other boards are parked in `boards/<id>/` and swapped in on switch. |
| NF2 | A switch never leaves the folder without a `board.json`: if bringing the target in fails, the board being left is put back. |
| NF3 | Between swapping the files and the window's reload, the window cannot save its old board over the new one. |
| NF4 | Each worktree's `KRNL0_BOARD_DIR` holds its own boards. |

## Use Cases

- **UC-B1:** A student makes a "Uni" board with "Copy my habits", plans lectures there, and switches back to "Main" for everything else. Neither board shows the other's plans or analytics.
- **UC-B2:** The Timer is running in "Main". The student opens "Uni": the chip shows "Recording in Main 12:40". They press it to go back and stop it.
- **UC-B3:** The AI runs `board list`, then `board new Side project`, then `board switch Side project` from the terminal.
- **UC-B4:** Someone with three canvases updates the app: they read the one-time notice, find all plans in the first board, and the other two boards holding their notes.

## User Stories

- As a user, I want a separate board per part of my life, so that work plans and private plans never mix.
- As a user, I want my habits to come along to a new board, so that I do not retype them.
- As a user, I want to see that a timer is still running elsewhere, so that I never record the same hour twice.

## Gherkin Scenarios (ATDD)

```gherkin
Feature: Separate boards

  Scenario: F2 — a new board with my habits
    Given the open board has the habits "Run" and "Read" with ticks
    When I make a board "Uni" with "Copy my habits"
    Then "Uni" has "Run" and "Read" with no ticks
    And "Uni" has no plans

  Scenario: F3 — switching and coming back
    Given the boards "Main" and "Uni"
    When I open "Uni", add a plan, and open "Main" again
    Then "Main" is exactly as I left it, with its time log
    And "Uni" shows 1 plan in the menu

  Scenario: F4 — one timer at a time
    Given the Timer is running in "Main"
    When I open "Uni"
    Then the top bar says "Recording in Main"
    And pressing Start in "Uni" does not start a second timer

  Scenario: F6 — what cannot be deleted
    Then the open board cannot be deleted
    And the last board cannot be deleted

  Scenario: F8 — canvases become boards
    Given a board file with the canvases "Main", "Research" and "Ideas"
    When the app opens it for the first time
    Then "Main" keeps every plan and habit
    And "Research" and "Ideas" keep their own notes and have empty lists
    And a copy of the file as it was exists beside it
    And the notice is shown once
```

Tests: `tests/unit/main/boards.test.ts` (storage, migration, the timer note), `tests/unit/renderer/windowFrame.test.ts` (the menu is in the top bar; the Timer checks the other boards).

## Known limits

- Reminders fire only for plans in the open board.
- `krnl pomo start` from the terminal does not check the other boards (the Timer window does).
- The chip opens the board that is recording; it does not stop that timer from afar.
- `krnl canvas …` still works inside the open board, but the app no longer offers canvases in its UI.
- Boards in `boards/.deleted/` are not cleaned up automatically.
