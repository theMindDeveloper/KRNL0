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
| F29 | **Tracked time is the Clock rail** ("Clock rail · refined", version A4). Each day has a track at its left, 4 px inside its own day line (3 px in a Station-width day), drawn like the Clock's ring track: one shade lighter than the day (`--paper-3`; halved on light paper), rounded at both ends, 5 px wide (6 px day view, 4 px Station). The track only covers time that has passed: the whole day before today, up to now today, nothing on days still ahead — it fills up as the day goes, and the grey left is time you did not record. Each focus span fills the track at its full width with round caps, in its tag or task colour (untagged lime uses a deeper mix on light paper); a span still running has crawling stripes (still under reduced motion); a break is the empty track. Today's "now" is a knob on the track in the now line's red; the now line then draws no dot of its own. Plans start 5 px after the track (3 px Station) and never sit on it. The day header shows the day's tracked total when the column has room (>= 110 px). The other versions stay one constant away (`RAIL_STYLE` in WeekView: A1 full ring track, A2 with hour marks, A3 thin 4 px). In a day too narrow for names (under 64 px), every block shows its first character instead of a cut name (F28). |

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
