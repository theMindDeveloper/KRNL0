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
| F15 | **Readable parallel tasks.** Two parallel tasks always sit side by side. Beyond that a day column shows what fits at 64 px a lane, capped at **2 lanes in the week** (an overview) and **4 in the day** (`CalendarNode/dayBlockLayout.ts`, `LANE_CAP`). Tasks beyond the cap collapse into a "+N" chip in the last lane, with the hidden tasks' colour dots; clicking it lists them and each row can be dragged back onto the grid. A block widens over lanes to its right that stay free for its whole time. **Text is never rotated**: a lane too narrow for a title is a plain bar with its name in the tooltip. Blocks that touch in time keep a 3 px gap. The grid opens (and pages) on whole hours and never on a block cut in half. A missed task says so once ("Missed · 10:00–11:00", lighter fill); its replan button shows on hover. Done tasks stay readable, with a check. Breaks on the recorded rail are gaps, not boxes. |
| F16 | **Pomo spans are background highlights.** Recorded and live focus/break spans are bands across the whole plan area, drawn behind habits and tasks (z 0). They take no pointer events, so drops still reach the hour cells. Focus and break look different (F3). |
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

  Scenario: F15 — five parallel tasks in a narrow week column
    Given five tasks overlap between 10:00 and 11:30 in a 90 px week column
    Then the first task is drawn at full width with its title
    And a "+4" chip sits on its top-right corner
    When I click the chip
    Then the four hidden tasks are listed and each can be dragged onto the grid

  Scenario: F15 — no block narrower than a readable lane
    Given any column width
    Then every drawn task block is at least 64 px wide (or the full column, if narrower)

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
