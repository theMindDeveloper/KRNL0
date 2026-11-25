# The website on a phone (Today, touch)

*ADR: [Decision 56](../03-architecture/decisions.md). Builds on Decision 51 (the web app the owner's KRNL0 server serves). Code: `src/renderer/components/Mobile/`, `src/web/touch.ts`, `src/web/web.css`.*

The owner asked (2026-11-21) for big changes to the phone website: a better layout and structure, touch that works everywhere (the canvas above all), and a fix for a long-press that opened the menu **and** selected text (the clock's numbers, for one).

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | **Today answers "what now?"** The date as the title, one line under it (plans done today, the day's events), then **Your day**: every plan with a Calendar time, repeating event and habit set for a time today, in time order, with a red line where now is. The item going on now (or the next one) opens out as a card: its name large, its time and place, "Now · 25 min left" with a progress bar, or "Next · in 2 h". Every item is shown; nothing hides behind a count. A row opens the Calendar on today. |
| F2 | The open-out card of a plan offers **Focus on it** (Pomo) or **Track it now** (Observe), the same action as the Calendar's; not in Easy mode. |
| F3 | **Today on a phone fits one screen, no scrolling** (owner, 2026-11-22; design "KRNL0 phone Today", direction A): the date, one line (the day so far and what is on now or next), the **Clock** with the day's plans as arcs (your day on the clock), the day's timed items as small chips in one row (the row scrolls sideways, nothing hidden; a chip opens the Calendar on today), and **one compact Timer card**: what it reads, what it is for, and one button (Start, Pause or Resume). The card's reading or "What are you doing?" opens Focus (the full Timer). There is no second Start. An iPad keeps its two-column Today. |
| F4 | The Calendar tab gives the Calendar the whole screen (a phone shows a day by default, its choice kept on this phone). An iPad shows the Calendar beside the Clock. |
| F5 | The canvas tab runs edge to edge. One finger pans, two pinch to zoom, a card drags with one finger, and the map of the board is hidden on a phone. |
| F6 | **A long-press is the right-click menu and nothing else**: one menu at the finger (the phone's own long-press menu is dropped), no text selected (UI text is not selectable on touch screens: dial numbers, headers, buttons, chips, rows), and the lift is not a tap (it never picks the menu row that opened under the finger). Fields, text being edited and anything marked `data-selectable` keep the system's long-press. A move or a second finger cancels it. |
| F7 | Menus opened by touch have rows at least 44 px tall. |
| F8 | The tab bar marks the open view with a filled pill behind its icon; every control answers on press. Notices (the morning line) sit above the tab bar. |
| F9 | **Phone tabs: Today, Todos, Calendar, Habits, More.** Todos is the Plans window on its own page. More holds Insights and Canvas (a row each); while one of them is open, the More tab stays marked. The iPad's rail keeps Today, Week, Habits, Insights and Canvas. |
| F10 | **A phone on its side is a dock** (Decision 67; owner, 2026-11-25: "when you move the phone sideways the whole UI bugs out"; design "KRNL0 phone sideways · Dock", direction D). A touch screen wider than tall and at most 500 px tall gets its own layout instead of the iPad's: no header and no tab bar, a slim rail at the side (Today, Todos, Week, Habits, More), and two windows side by side, by default **Todo on the left and the Clock on the right**. Every other view (Todos, Week, Habits, Insights, Canvas) takes the whole space beside the rail. |
| F11 | **Choose what sits where** (owner pick "D, also on iPad"). Where a window's place can be chosen, its name in the header has a small chevron; a tap opens a short list (Todo, Timer, Clock, Calendar, Habits, Insights) and the pick goes there. A window already shown in another place swaps with it, so no window is ever shown twice. The choice stays on this device (not synced). |
| F12 | **The Timer pill** (owner: "D doesn't have the timer, so you can't see it"). On the sideways phone, while neither window is the Timer, a pill sits in the bottom corner: idle, **Start**; running, the task and the time with **Stop**; a tap on its reading opens Focus (the Timer alone). It is gone while a window shows the Timer. |
| F13 | **More is a small popup**, never a page (owner, 2026-11-25): on the phone it opens above its tab, on the sideways phone beside it in the rail, with Insights and Canvas (and Settings on the sideways phone, which has no header). One tap opens the pick; a tap outside or Esc closes it. While Insights or Canvas is open, More stays marked. |
| F14 | **The iPad's Today has the same choice**: its four windows (by default Timer and Plans, Calendar and Habits) each change from their name, as in F11. |
| F15 | **The Calendar stays readable sideways**: where the day cannot fit readably (the sideways phone), an hour keeps at least 20 px and the hours scroll, opening around now. Elsewhere the day still fits its window (Decision 60). A time row's label (the Clock's date) is never cut. |
| F16 | **One touch rule for every window** (Decision 68; owner, 2026-11-25: "we don't actually have touch support"; #305, #306, #307). A finger that moves at once scrolls (the hours, a list, the page) or pans the canvas, as before. A finger **held still for about half a second** on something you can move picks it up; from then on the gesture is KRNL0's: the page does not scroll, the canvas does not pan or zoom and the page does not zoom, until the finger lifts. On a desktop touch screen too. |
| F17 | **Hold, then drag** moves plans, events and habits on the Calendar (Week, Day, Month; in Free and My layout and the web app), carries a Todo row, a habit or a card to the Calendar, and draws a new box on empty time (F93/F94). The box shows as soon as the hold fires. A mouse and a pen pick up at once, as before. |
| F18 | **Edges a finger can grab**: a block's top and bottom edges are 16 px for a finger (7 for a mouse); on a block shorter than 48 px its lower half stretches it, so even a small plan can be made longer. Events the same. |
| F19 | **The long-press menu and the hold agree**: a hold lifted in place opens the item's menu (mark, when, rename…); a hold that moves carries it, with no menu. On something that does not carry, the menu opens on the hold and closes if the finger then moves on. |
| F20 | **Two fingers on the Calendar zoom its hours only**, never the canvas behind it or the page (#306). |
| F21 | **Carry a task onto the Calendar tab**: on the phone and the sideways phone, holding a carried task over the Calendar tab (or the rail's Week) for about half a second opens the Calendar, and the task drops on the time under the finger. |
| F22 | **Above the keyboard**: while the on-screen keyboard is up, the app ends above it (a field at the bottom of a window stays in sight), and a card being typed in (the drag card, an event card) moves up until its field is above the keyboard; both go back when it closes. |
| F23 | **The first layout is the one Reset makes** (owner, 2026-11-25): a new board, and a device that gets a board with no layout of its own (the layout is per device), open on My layout as Reset arranges it (Timer, Clock and Todos over a full-width Calendar; Habits, Analytics and the terminal hidden). A device that has its own layout, and a board from before the Station, keep theirs. |

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

- **UC-P5:** The owner props the phone on its side next to the laptop: Todo on the left, the Clock on the right, the Timer pill in the corner. They tap Start on the pill, and later Stop.
- **UC-P6:** They tap the Clock's name, pick Calendar, and the Calendar takes that side; picking Todo for the right side swaps the two.
- **UC-P7:** On the iPad they put the Clock where Habits was.
- **UC-P8:** On the iPad they hold a plan on the Calendar, drag it an hour later and let go; they hold a short plan's lower half and pull it longer; they pinch the hours bigger, and the canvas behind does not move.
- **UC-P9:** On the phone they hold a to-do in Todos, carry it over the Calendar tab, wait a moment, and drop it on 15:00.

## User Stories

- As a user on my phone, I want to see what is on now and next as soon as I open KRNL0, so that I know what to do.
- As a user on my phone, I want touch to work like any app (pan, pinch, drag, long-press for options), so that I can plan with one hand.
- As a user, I want my phone on its side to work as a small dock beside me, showing the two windows I choose and the running timer.

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

Feature: The phone on its side (F10-F12)
  Given the phone is held sideways
  Then a rail sits at the side and Todo and the Clock sit side by side
  And the Timer pill says Start in the corner
  When I tap the Clock's name and pick Timer
  Then the Timer takes that side and the pill is gone
  When I tap Todo's name and pick Timer
  Then Todo and the Timer swap sides

Feature: More is a popup (F13)
  When I tap More
  Then a small list opens at it with Insights and Canvas
  When I tap Insights
  Then Insights opens, the list closes, and More stays marked

Feature: The iPad chooses too (F14)
  Given the iPad shows Today
  When I tap Habits' name and pick Clock
  Then the Clock sits where Habits was

Feature: One touch rule (F16-F20)
  Given the Calendar on an iPad
  When a finger moves at once on a plan
  Then the hours scroll and the plan stays
  When a finger holds a plan still for half a second and drags it down an hour
  Then the plan moves an hour later and nothing behind it moved
  When a finger holds a plan and lifts in place
  Then the plan's menu opens
  When two fingers pinch the hours
  Then only the hours zoom

Feature: Carry to the Calendar tab (F21)
  Given the phone shows Todos
  When I hold a to-do and carry it over the Calendar tab for half a second
  Then the Calendar opens and the to-do drops on the time I let go at

Feature: First layout (F23)
  Given my board has never been opened on this iPad
  When I open KRNL0 on it
  Then it shows My layout as Reset makes it
```
