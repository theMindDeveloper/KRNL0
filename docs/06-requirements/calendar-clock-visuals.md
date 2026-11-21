# Calendar & Clock — Plan and Reality Visuals

*Builds on [time-model.md](time-model.md) · fixes the overlap / parallel-task rendering bugs*

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | Calendar and Clock use one lane packer (`store/laneLayout.ts`). Overlapping blocks form a cluster, every block in a cluster reports the same lane count, and a block widens over lanes that stay free for its whole interval. |
| F2 | *(Superseded by F16.)* Calendar reality used to be a thin rail on the left edge of each day column. Planned task and habit blocks still keep a small left gutter, where the highlight's edge shows. |
| F3 | Reality colours: focus = a faint wash in the colour of the task it is tagged with (acid when untagged) with a solid edge. Break = a faint neutral hatch with a dashed edge. A pause is a gap. The live span is a little stronger. |
| F4 | Right-clicking a reality span (Calendar highlight or Clock wedge) opens its menu (F17). **Left-clicking** a Clock wedge or a Calendar highlight (#203 — the day column hit-tests, since the bands take no pointer events; several overlapping spans open the picker, whose rows then open their details), or **Details…** in the menu, opens the popup with start, end and duration, a **Counts toward** selector (retag), and Delete. A left click on a task block still opens the task popup. |
| F5 | Planned blocks show their real time range even when they cross midnight, and are at least 14 px tall. How much text they show is set by F13. |
| F6 | Block states: done = faded (✓ when there is room). Missed = planned time passed while still open (lighter tint, "missed" in the agenda). Overrun = tracked > planned: a rust strip on the right edge at any size, plus "+Xm over" in the time line when it fits. |
| F7 | Habit blocks are tinted with a coloured edge, like tasks, not a solid bright bar. |
| F8 | Reality spans that cross midnight are split onto both days. |
| F9 | When a dropped task lands later than the drop slot (chain push, Decision 30), a notice says where it went and why. |
| F10 | Clock (maintainer decision): the analog face with tasks as round-capped **arcs ("worms") on lanes around the dial**. Overlapping tasks take the next lane outward (shared lane packer), and lanes get thinner when there are many. **Pomo is colour inside the face**: each recorded span fills its wedge in the tagged task's colour (acid when untagged), breaks are a hatched wedge, and a pause is empty face. Click a wedge to retag or delete it. |
| F11 | The "now" pointer and the active task only appear in the 12-hour half that contains now. Ended tasks are dimmed. |
| F12 | Calendar day view narrower than 360 px switches to an **agenda**: a day strip (plan line + reality line) and one full-width row per task or habit (start/end, title, planned/tracked, +over, missed, "overlaps N"). It has a NOW divider, opens at now, and accepts drops (placed after the row dropped on). "▦ time grid" / "≡ list" toggle the layout. |
| F13 | Calendar time grid: blocks show only what fits their measured size (bar / title / title + time). Lanes are packed by drawn height. Lane capping follows F15. The default scale is 56 px per hour, and the grid opens scrolled to now. |
| F14 | Clock list: only done tasks are struck through. Past open tasks are dimmed. |
| F15 | **Readable parallel tasks.** A day column draws parallel tasks side by side with their names only while each lane stays readable: at least 96 px (`READABLE_LANE_PX`), capped at **2 lanes in the week** and **4 in the day** (`CalendarNode/dayBlockLayout.ts`, `LANE_CAP`). A clash narrower than that becomes **letter bars** (F28); nothing collapses into a "+N" count. **Text is never rotated.** Blocks that touch in time keep a 3 px gap. The grid opens (and pages) on whole hours and never on a block cut in half; the hour pager is two chevrons in the corner above the time gutter (up: earlier hours, down: later), never over a plan; a habit pill cut by the edge of the shown hours waits for its page. A missed task says so once ("Missed · 10:00–11:00", lighter fill); its replan button shows on hover. Done tasks stay readable, with a check. |
| F16 | **Plan, recorded and habits are separate layers.** Only the plan draws blocks. Recorded focus fills a track at each day's left (F29; breaks are its gaps); habits are small pills at their time, clickable to tick (`habit.toggleDay`). The track takes no pointer events. **Recorded** and **Habits** switch on and off in the header; the choice is calendar state (`calendar.setLayers`, `layers: {recorded, habits}`, missing = both on), so `krnl cal layers [recorded\|habits on\|off]` does the same. |
| F17 | **Right-click menus.** Right-clicking a day column hit-tests every layer at that minute. One hit opens its menu; several open the picker, and picking a row opens that row's menu. Segment menu: header (kind · times · minutes), **Tag → <task>** for up to 6 root tasks, **Untag** (when tagged), **Details…**, **Delete segment** (disabled for the live span). Task menu: header (title · times), **Details…**, **Start focus**, **Mark done / Mark not done**, **Show on canvas**, **Unschedule**. Menus stay on screen. |
| F18 | **Clock parity.** The Clock day view offers the same menus from the same builder (`ContextMenu/scheduleMenus.ts`): right-click a task arc or a task-list row for the task menu, and a pomo wedge for the segment menu. The Clock has no task details popup, so its task menu has no **Details…**. |
| F19 | **CLI twins.** Tag / Untag → `pomo retag <seg> <task|none>`. Delete segment → `pomo delete-segment <seg>`. Start focus → `task pomo <ref>`. Mark done → `task toggle <ref>`. Unschedule → `task unschedule <ref>`. `pomo segments [--date] [--json]` lists segment ids. |
| F20 | **No scrolling.** The Calendar hour grid shows a window of whole hours that fits the panel. The wheel, the ‹ HH–HH › pager, or a drag held at the top/bottom edge flips to the next window. The agenda list and the Clock task list page by whole rows (`ui/PagedView`). The Clock dial flexes to the free space, so the whole Clock always fits. |
| F21 | **A tagged span names its task** (#204). The Calendar band shows the task name (faint, top-right), the details popup title is the task name, the right-click menu has a **Tagged: <task>** line, and the layer picker row names it. The name is the task's current text, else the span's own label (the task text at tagging time) when the task node is gone. The **Counts toward** selector lists open tasks, then done tasks (✓, newest first); a span whose task was deleted keeps an extra "<name> (deleted)" option instead of reading blank. CLI: `krnl pomo segments [--json]` prints `→ <task>` / a `taskName` field. |
| F22 | **The Clock follows now** (#201). At app start a past day, or today in the other half, snaps to today and the current 12-hour half; a future day is kept. When the local day changes, a clock showing the day that ended moves to the new day; at noon or midnight a clock showing today's ending half flips to the new half. A clock browsing another day is never moved. Applied through `clock.goNow` / `clock.setViewWindow` (`ClockNode/follow.ts`); CLI `krnl clock now`. `selectedDate` stays persisted (ADR 0004 §3). |
| F23 | **Clock overlay never takes the pointer** (#202). Ticks, numerals, the readout, hands, second hand and hub are one `pointer-events: none` group, so hovering or clicking a wedge under a numeral works. |
| F24 | **Clock names tagged spans too** (#204). The Clock span menu shows **Tagged: <task>** and lists open, then done ✓ tasks (same builder as F21); its **Counts toward** select lists a span's deleted task under the span label. |
| F25 | **One popup for recorded time** (#207, time-log F15): left- and right-click open the same popup on Calendar and Clock; times are edited by double-clicking them; Counts toward uses the compact picker (time-log F16). Right-click on empty time offers **Log time here…** (Calendar) / **Log time at HH:MM…** (Clock). |
| F26 | **Plan vs reality on the block** (#207, storyboard B): a planned block with tagged work on its day reads "started 20m late / 10m early / on time" next to "+X over" / "X tracked". |
| F27 | **App open/close markers** (time-log F14) and **month hours** (Calendar month cells show the day's recorded work, top-left). |
| F28 | **Clashing plans are letter bars.** When a clash does not fit side by side with names (F15), every plan stays its own slim bar at its own time and is named by its first character (`clashLabels.ts`): when two bars of one clash would share a letter they add the first letter of their last word ("Read chapter A/B/C" → RA, RB, RC), then more letters, then a number — never two equal names in one clash. The letter shows when it fits the bar (one line tall, wide enough); a name too wide for a narrow bar stands its letters one above the other (never rotated) when the bar is tall enough, so a bar is never left unnamed. A title with no letter or digit is numbered (#1, #2). It sits centred in a short bar, at the top of a tall one with a tick under it when done; missed bars keep the rust outline. The full name is the bar's tooltip and in its popup. Every bar is clickable and **draggable** like any block. **While any plan from the calendar is dragged, a strip appears at the bottom: "Drop here to unschedule"** — dropping there sends it back to Todo (`unscheduleTask`, CLI `task unschedule`); any other drop or drag end clears the strip. A clash with two or more chains still ahead gets a **Line up** tab just above it (or below), drawn only where it covers no plan or habit pill: the chains go one after another in start order from the first start, never before now; a chain moves as one. CLI: `krnl cal lineup <task> <task> [...]`. |
| F29 | **Tracked time is the Clock rail** ("Clock rail · refined", version A4). Each day has a track at its left, 4 px inside its own day line (3 px in a Station-width day), drawn like the Clock's ring track: one shade lighter than the day (`--paper-3`; halved on light paper), rounded at both ends, 5 px wide (6 px day view, 4 px Station). The track only covers time that has passed: the whole day before today, up to now today, nothing on days still ahead, and nothing on a past day with no recorded time (a week of bare tracks read as scrollbars) — it fills up as the day goes, and the grey left is time you did not record. Each focus span fills the track at its full width with round caps, in its tag or task colour (untagged lime uses a deeper mix on light paper); a span still running has crawling stripes (still under reduced motion); a break is the empty track. Today's "now" is a knob on the track in the now line's red; the now line then draws no dot of its own. Plans start 5 px after the track (3 px Station) and never sit on it. The day header shows the day's tracked total when the column has room (>= 110 px). The other versions stay one constant away (`RAIL_STYLE` in WeekView: A1 full ring track, A2 with hour marks, A3 thin 4 px). In a day too narrow for a one-line name (under 64 px), a block alone in its column wraps its name (F31); plans that clash stay letter bars (F28). |
| F30 | (UX review pick 5A, 2026-11-18) **Chains are named on the calendar.** A planned block that follows another task in its chain shows a small "after <task>" line under its name when the block has room (always in its tooltip), and the plan popup of a chained plan says "after <task>" too. In both modes (Easy keeps chains, easy-mode D14). Drawn connectors between blocks are out of scope. |
| F31 | (Owner pick A, 2026-11-19) **A narrow block alone in its column wraps its name.** In a day column too narrow for a one-line name (under 64 px, `MIN_LANE_PX`: the week in a Station-width Calendar), a block that is not part of a clash shows its name in 10 px mono (`.cal-wrap`), wrapped down the block: words first, a long word breaks where it must, and only whole 11 px lines are drawn, so a short block shows its first line and a tall one the whole name. A done block keeps its tick under the name when there is room. It falls back to the first character only when fewer than three letters fit across. Plans that clash keep their letters (F28): a slim bar holds no word. The full name stays in the tooltip and the plan card. It was the first character alone ("S", "P"), which showed that a day had plans but not which. |
| F32 | (Owner, 2026-11-21 — Decision 55) **Readable events.** A repeating event is a calm tinted card (its colour at about 15 % over the paper, a thin border in its colour, rounded) — no hatching. Its whole name wraps over as many lines as the block has, in the reading font at 12 px; then its time ("16:00–17:30"), then its place when it has one ("WH C 442": the part after a long dash with a digit in it, or the first short line of its note). The name gets the first lines (up to two), then the time, then the rest of the name, then the place; nothing is cut in half (`eventText.ts`). A lane too thin for words writes the name sideways. Plans name themselves in the same reading font and use every line a tall block has. |
| F33 | (Decision 55) **A calm grid.** The gutter labels the hours only (no ":30"); a half hour is a faint dashed line. Hour and day lines are drawn at ink 11 % (frame styles may set `--k-cal-grid`; Pro dark is #2c2c2c). |
| F34 | (Decision 55) **Today is clear.** The day header shows the weekday small and the date large; today's date sits in an accent circle, days gone by step back to grey, weekend names are quieter. Today's column is a neutral lift (no olive wash; none in the day view). The now line is solid and 2 px across today only, a faint trace across the other days, with no glow; the time now ("04:53") sits in the gutter on the line and the hour label under it gives way. |
| F35 | (Decision 55) **The Orb stays off the windows.** In a Station layout the Orb rests in the top bar, at half size, after the Settings button (`[data-orb-dock]`): a click opens it as before, it does not drag there, and its full-size box never takes clicks from the windows under the bar. In Free it keeps its own place. |

| F36 | (Owner, 2026-11-21 — Decision 58) **Smooth hours.** The hour grid scrolls smoothly with the wheel, a trackpad or a finger; the arrows glide by most of a screen; dragging near the top or bottom edge keeps it moving. (Replaces whole-hour windows.) |
| F37 | (Decision 58) **Zoom by gesture.** Pinch on a trackpad, Ctrl/⌘ + wheel, two fingers on a touch screen, or dragging the hour gutter up and down zooms the hours; the hour under the pointer stays under it; the zoom is saved once the gesture rests (`calendar.setZoom`, `krnl cal zoom`). No zoom buttons. |
| F38 | (Decision 58) **Depth.** Every other hour is a shade deeper; plans float with a soft shadow and a tick box before the name; repeating events lie flat (tint and border, no box). The hour labels sit on their lines in a 48 px gutter with room above 00:00. |
| F39 | ~~(Decision 58) No recorded rail.~~ Replaced by F43 (Decision 59): the line is back, restyled. |
| F40 | (Decision 58) **Habits are tick boxes.** A habit set for a time is a small box centred on its time line at the right of the day, in its colour, filled with a check when done; its name beside it when there is room; a click ticks it. |
| F41 | (Decision 58) **Add by typing at the bottom.** The Calendar's "add a plan" opens a field in the footer, as in Todo. "Gym fri 18:00 1h" adds the plan at once (the parsed day and time show beside the field); a name without a time opens the plan card with the name filled in. Escape closes the field. |
| F42 | (Decision 58) **A bigger Clock.** The dial takes the room the list does not need; the day's list sits at the bottom, about four rows tall, and scrolls beyond that (the row going on now stays in view). The big clock is a quiet icon at the end of the header. |
| F43 | (Decision 59) **The recorded line, calm.** Recorded time is a thin line at each day's left (4 px, 5 in a day view, 3 px from the day line; plans start 3 px after it); spans that follow each other touch; a running span is a solid fill (no stripes); the now line's dot sits centred on it; only the line itself (3 px either side) takes a click, never a plan beside it. "Recorded time" is back in the Calendar's menu. |
| F44 | (Decision 59) **Drag a repeating event.** Drag an event to another time (a weekly one also to another weekday), or pull its top or bottom edge: the event changes for every week (`habit.setSchedule`). While dragging, a ghost shows the new time; the menu has no "Move this one…". |
| F45 | (Decision 59) **Click to see, Details to change.** A left click on a plan or an event opens its info card (time, length, recorded; Start, Done, Details); Details there, or Details in the right-click menu, opens the card that changes it. |
| F46 | (Decision 59) **Lines meet.** The day-name row and the ANY TIME row leave the same room at their right as the hours' scrollbar, so every day line runs straight down. |
| F47 | (Decision 59) **Zoom you can find.** The Calendar's menu has "Bigger hours" and "Smaller hours" (it stays open between presses), with the gestures named beside them. |
| F48 | (Decision 59) **A task's mark.** A task shows a small list mark at its top right (a done one the check, a repeating event ⟳); there is no tick box before its name. Day chips say "Tmrw". |
| F49 | (Decision 59) **Habits you can tell apart.** A narrow day's habit box carries the habit's icon (or its first letter) in its colour; a habit on a day still ahead is faded with a dashed box and says "not yet"; a double-click on a habit never opens the new-plan card. |
| F50 | (Decision 59) **Edges where they are drawn.** A task's top and bottom edges are found in screen pixels on the block, so a resize starts at its drawn edge at any canvas zoom; a press on an edge that does not move changes nothing. |
| F51 | (Decision 59) **The same Clock in Free.** The dial grows with the window in Free as in the Station. A habit on the dial is a small tick box on its lane at its time, filled with a check when done; a click ticks it (not on a day still ahead). |
| F52 | (Decision 59) **One rule for adding.** While you type in the Calendar's field the plan card shows above it, filled from the words (day, time, length, deadline), as in Todo and Habits; Enter adds what it shows; "every…" opens the repeating-event card. |
| F53 | (Decision 60) **No habits on the Clock.** Habits are not drawn on the Clock's dial or in its list; repeating events are. The outer ring (the day's planned blocks ticked) shows its fill only once something is done. |
| F54 | (Decision 60) **Steady blocks.** Pointing at a block tints it; nothing else on the Calendar moves or re-renders its text. |
| F55 | (Decision 60) **One block style.** A block's mark sits at its top right whenever the block is at least ~22 px tall; names are 13 px in a full block, 12.5 px in a narrow one; events 13 px. |
| F56 | (Decision 60) **Overlaps stay as placed.** No "Fix overlap" tab over overlapping plans. |
| F57 | (Decision 60) **One look at every size.** A block 40 px or taller shows its name (up to three lines), then its time small (mono 10 px) — for an event with how often ("every week") — wrapping when narrow, then the rest of the name and the place. |
| F58 | (Decision 60) **Cards behave alike.** The Calendar's add card hides on a click away; a plan's Details card renames it on a double-click of its name; only one card or menu shows at a time; the info card shows name, when, category, planned, recorded and its buttons, nothing more. |
| F59 | (Decision 60) **Steady edits.** A resized plan or a dragged event never flashes back to its old place before it lands; letting go is not a click; the plan being resized keeps its tint; events light up under the pointer. |
| F60 | (Decision 60) **A resizable Calendar on the Free canvas.** Its right edge, bottom edge and corner resize it (420 × 360 to 1800 × 1400); the windows beside it move along and notes under it move down, so nothing overlaps, also after a swap; `krnl window size calendar <width> <height>`. |
## Gherkin Scenarios (ATDD)

```gherkin
Feature: Plan and reality stay readable when tasks overlap

  Scenario: F1 — parallel fork
    Given a task forks into three parallel tasks starting at 10:00
    Then the calendar shows three equal-width lanes for them
    And the clock shows them on three concentric lanes

  Scenario: F2/F3 — reality next to the plan
    Given 45 minutes of work tagged "Study math", a pause, and a break
    Then the rail shows a solid block in Study math's colour, a gap, and a hatched block

  Scenario: F9 — chain push notice
    Given "Task b" follows "Task a" (09:00–10:00) in a chain
    When "Task b" is dropped at 09:00
    Then a notice says it was placed at 10:00
```

Tests: `tests/unit/renderer/laneLayout.test.ts`, `src/renderer/components/nodes/CalendarNode/__tests__/WeekView.pushNotice.test.tsx`, the ClockNode arc tests. Visual check: `npx vite --config vite.preview.config.ts`, then open `/?solo=calendar` or `/?solo=clock` (dev fixture board).

```gherkin
Feature: Readable parallel tasks and pomo highlights

  Scenario: F28 — clashing plans in a narrow week column
    Given Read chapter A, Read chapter B, Read chapter C and Call with Sam overlap in a 136 px week column
    Then each is its own bar at its own time
    And the bars read RA, RB, RC and C
    And there is no "+N" chip and no plan is hidden

  Scenario: F31 — a plan alone in a narrow week column
    Given the Calendar is 360 px wide in the Station layout and "Study math" is the only plan at 09:00 on Thursday
    Then its block reads "Study" and "math" on two lines
    And a block one line tall shows the first line of its name
    And plans that clash in that column are still letter bars

  Scenario: F28 — drag a bar to unschedule it
    Given the bar "C" for "Call with Sam"
    When I start dragging it
    Then "Drop here to unschedule" appears at the bottom of the calendar
    When I drop it there
    Then "Call with Sam" has no time and is back in Todo
    And the drop zone is gone

  Scenario: F28 — line up plans that clash
    Given Email, Pay rent and Plan week all start tomorrow at 14:00 (20, 20 and 30 minutes)
    When I click the "Line up" tab above them
    Then Email is at 14:00, Pay rent at 14:20 and Plan week at 14:40
    And `krnl cal lineup Email "Pay rent" "Plan week"` does the same

  Scenario: F29 — tracked time fills a track
    Given 2h35 of focus recorded on Saturday
    Then Saturday's track at its left is filled where I worked, next to Saturday's plans
    And the header reads "SAT 7 2h35"

  Scenario: F15 — no block narrower than a readable lane
    Given any column width
    Then every block with a name is at least 96 px wide, or it is a letter bar (F28)

  Scenario: F16 — pomo spans sit behind the plan
    Given a 25 minute focus span and a 5 minute break
    Then both are drawn as bands behind the task blocks
    And the focus band is a tinted wash and the break band is a hatch
    And dropping a task onto that time still schedules it

  Scenario: F4 — left-click a recorded span on the calendar (#203)
    Given a 25 minute focus span at 09:00
    When I left-click it on the calendar
    Then its details popup opens with 09:00, 09:25 and "Counts toward"
    When two recorded spans overlap where I left-click
    Then the picker lists both, and picking one opens its details

  Scenario: F21 — a tagged span names its task (#204)
    Given a focus span tagged "build cluster" and "build cluster" is done
    Then the calendar band is labelled "build cluster"
    And its right-click menu shows "Tagged: build cluster"
    And its details popup is titled "build cluster"
    When "build cluster" is deleted
    Then "Counts toward" reads "build cluster (deleted)"

  Scenario: F17 — retag a focus span from the calendar
    Given a focus span tagged "Math"
    When I right-click it on the calendar and choose "Tag → Physics"
    Then the span counts toward Physics

  Scenario: F18 — same menu on the clock
    Given the same task and focus span
    When I right-click the task arc and the wedge on the clock
    Then I see the same actions as on the calendar (the task menu has no "Details…")

  Scenario: F19 — delete a segment from the CLI
    When I run "pomo segments --date 2026-11-01"
    And I run "pomo delete-segment <id>"
    Then that span is gone from the calendar, clock and analytics
```

```gherkin
Feature: No scrolling in Calendar and Clock

  Scenario: F20 — hour windows
    Given a Calendar panel that fits 6 hours
    When I scroll down once over the grid
    Then the grid shows the next 6 whole hours and the pager reads the new range
```

```gherkin
Feature: Readable events (F32)
  Given a class "B112 Front-End Development (PÜ) – WH C 442" on Thursday 14:00–15:30
  When I look at the week at the default zoom
  Then its block reads "B112 Front-End Development (PÜ)", "14:00–15:30" and "WH C 442"
  And the block is a flat tint with no hatching

Feature: Calm grid and clear today (F33, F34)
  Then the gutter shows "13", "14" and no ":30"
  And today's date is in the accent circle
  And the time now is in the gutter on the now line

Feature: The recorded line (F43)
  Given I recorded 09:00–09:25 and 09:25–09:50 today
  Then today's column shows one unbroken line from 09:00 to 09:50 at its left
  And the now dot sits on that line
  When I click a plan right beside the line
  Then the plan's card opens, not the recorded span's

Feature: Drag a repeating event (F44)
  Given "Lab" repeats on Tuesdays 14:00–16:00
  When I drag it down an hour and over to Wednesday
  Then "Lab" repeats on Wednesdays 15:00–17:00, every week
  When I pull its bottom edge down 30 minutes
  Then it lasts 2h 30m every week

Feature: Click to see (F45)
  When I click a plan
  Then its info card shows its time and length with Start, Done and Details
  When I press Details
  Then the card that changes it opens

Feature: Habits (F49)
  Given tomorrow has "Gym" at 11:00
  Then its box is faded and dashed and says "not yet"
  When I double-click today's "Gym" box
  Then it is ticked and unticked, and no new-plan card opens

Feature: One rule for adding (F52)
  When I type "Gym fri 18:00" in the Calendar's field
  Then the plan card shows Fri 18:00 above the field before I press Enter
  When I press Enter
  Then "Gym" is on Friday at 18:00
```
