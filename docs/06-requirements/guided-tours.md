# Guided tours and first-start layout

Follow-up to #207. Code: `src/renderer/components/Tour/` (`tours.ts`, `TourHost.tsx`).

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | **First-start layout.** A new board opens with Pomo, Todo, Calendar, Clock in the Station's top row and Habits, Analytics beside the canvas in the bottom row; the Terminal starts hidden. Canvas mode orders the window row the same way (Terminal last). Existing boards keep their layout. |
| F2 | **One short tour per part of the app:** Welcome, Pomo, Todo, Calendar, Clock, Habits, Analytics, Easy and Advanced, Terminal & AI. Each is a few plain-language steps. The Easy and Advanced tour opens Settings and says what Advanced adds (easy-mode.md D1–D16). |
| F3 | **Each step points at what it talks about:** the screen dims and the element is ringed (spotlight); the app stays usable underneath. A step can first bring a window into view (canvas: camera moves to it; Station: its panel is shown if hidden). |
| F4 | **Steps wait for the user.** Either Next (button, Enter or →; Back with ←) or the real action — a click on a given control, or a board change (a task added, the Pomo started / stopped, a habit added, a task scheduled) — then the tour moves on by itself. Waiting steps show what they wait for and offer Skip. Esc or "End tour" stops. |
| F5 | **Where to start them:** the Orb chat's "Tutorials" list, and `krnl tour list` / `krnl tour start <id>`. |
| F6 | **The spotlight never slides.** The ring is drawn only once its target has stopped moving and is on screen, and it does not animate its position. The tour sits above modals (it can point into Settings). |
| F7 | **Tours show, not just tell.** The ring carries a short label (PRESS, TICK TODAY, NEW IN ADVANCED). Steps ask for the real action where one exists (start / break / stop the Pomo, add and tick a task, add and tick a habit, open a page). Steps for controls that exist only in one mode are skipped in the other. The Easy and Advanced tour switches the app's mode live and rings what appears; the user's own mode comes back on End unless they pick one on the last step. The card stays put while the next target settles. |
| F8 | **A guide you can follow.** The card (420 px, 15.5 px text) carries a small glowing orb — the guide — and glides from step to step; the new words fade in once it has arrived, so text never changes before the card moves. Key words are highlighted (`**word**` in the step text), a progress bar shows how far along you are. A step can open what it talks about (`press`: the guide opens Settings to show **Settings → Mode**) and closes it on the next step. `{mode}` names the user's own mode, so an Easy user is told they are in Easy and shown where to switch. |

## Gherkin

```gherkin
Feature: Guided tours

  Scenario: F4 — a step waits for the real action
    Given the Clock tour is on "Press WEEK to see your last 7 days"
    When the user clicks the WEEK button
    Then the tour shows the next step by itself

  Scenario: F1 — first start
    Given a new board
    Then the Station top row is Pomo, Todo, Calendar, Clock
    And the bottom row is the canvas, Habits, Analytics
    And the Terminal is hidden
```
