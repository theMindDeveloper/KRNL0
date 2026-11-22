# The website on a phone (Today, touch)

*ADR: [Decision 56](../03-architecture/decisions.md). Builds on Decision 51 (the web app the owner's KRNL0 server serves). Code: `src/renderer/components/Mobile/`, `src/web/touch.ts`, `src/web/web.css`.*

The owner asked (2026-11-21) for big changes to the phone website: a better layout and structure, touch that works everywhere (the canvas above all), and a fix for a long-press that opened the menu **and** selected text (the clock's numbers, for one).

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | **Today answers "what now?"** The date as the title, one line under it (plans done today, the day's events), then **Your day**: every plan with a Calendar time, repeating event and habit set for a time today, in time order, with a red line where now is. The item going on now (or the next one) opens out as a card: its name large, its time and place, "Now · 25 min left" with a progress bar, or "Next · in 2 h". Every item is shown; nothing hides behind a count. A row opens the Calendar on today. |
| F2 | The open-out card of a plan offers **Focus on it** (Pomo) or **Track it now** (Observe), the same action as the Calendar's; not in Easy mode. |
| F3 | Under Your day: the Timer, Plans, Habits and the Clock. While the timer is idle the headline offers **Start timer**; while it runs, the live reading that opens Focus. |
| F4 | The Calendar tab gives the Calendar the whole screen (a phone shows a day by default, its choice kept on this phone). An iPad shows the Calendar beside the Clock. |
| F5 | The canvas tab runs edge to edge. One finger pans, two pinch to zoom, a card drags with one finger, and the map of the board is hidden on a phone. |
| F6 | **A long-press is the right-click menu and nothing else**: one menu at the finger (the phone's own long-press menu is dropped), no text selected (UI text is not selectable on touch screens: dial numbers, headers, buttons, chips, rows), and the lift is not a tap (it never picks the menu row that opened under the finger). Fields, text being edited and anything marked `data-selectable` keep the system's long-press. A move or a second finger cancels it. |
| F7 | Menus opened by touch have rows at least 44 px tall. |
| F8 | The tab bar marks the open view with a filled pill behind its icon; every control answers on press. Notices (the morning line) sit above the tab bar. |

## Non-Functional Requirements

| # | Requirement |
|---|---|
| NF1 | Touch targets at least 44 px; text at least 12 px; words in the reading font, times and numbers in the mono with tabular figures. |
| NF2 | A view arrives with a 200 ms fade and rise; with reduced motion, none. Translucent bars become solid with reduced transparency. |
| NF3 | Nothing scrolls sideways; safe areas are respected. |
| NF4 | Your day is computed from the board alone (`dayAgenda.ts`, pure) and refreshes every 30 s. |

## Use Cases

- **UC-P1:** The owner opens the site on the phone in the morning: "Saturday 21 November", "0 of 2 plans done · 1 event", then the lab session at 13:00 opened out as Next, with its room.
- **UC-P2:** They tap **Focus on it** on the next plan; the Timer starts on it.
- **UC-P3:** On the canvas they pan with one finger, pinch in, drag a card to a new place, and long-press another card: its menu opens, nothing is selected, the menu stays open after the lift.
- **UC-P4:** They long-press a number on the Clock: the Clock's menu opens; the number is not selected.

## User Stories

- As a user on my phone, I want to see what is on now and next as soon as I open KRNL0, so that I know what to do.
- As a user on my phone, I want touch to work like any app (pan, pinch, drag, long-press for options), so that I can plan with one hand.

## Gherkin Scenarios (ATDD)

```gherkin
Feature: Your day (F1)
  Given today has a plan at 11:00, a class at 13:00 and a habit at 07:30, and it is 10:30
  When I open Today on the phone
  Then Your day lists the habit, the plan and the class in time order
  And the plan is opened out as "Next · in 30 min"
  And a red line marks now before it

Feature: Long-press is the menu only (F6)
  Given the phone shows the Clock
  When I hold a finger on a dial number for half a second and lift it
  Then the Clock's menu is open
  And no text is selected
  And no menu row was picked

Feature: Canvas touch (F5)
  When I drag one finger on empty canvas
  Then the canvas pans with the finger
  When I spread two fingers
  Then the canvas zooms in
  When I drag a card with one finger
  Then the card moves
```
