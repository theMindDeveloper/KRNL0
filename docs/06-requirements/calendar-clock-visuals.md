# Calendar & Clock — Plan and Reality Visuals

*Builds on [time-model.md](time-model.md) · fixes the overlap / parallel-task rendering bugs*

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | Calendar and Clock use one lane packer (`store/laneLayout.ts`). Overlapping blocks form a cluster, every block in a cluster reports the same lane count, and a block widens over lanes that stay free for its whole interval. |
| F2 | Calendar time grid: each day column has a thin, unlabelled **reality rail** on its left edge (`min(6px, 10%)` of the column). Minutes appear in the popup. Planned task and habit blocks sit to the right of it. |
| F3 | Reality colours: work = solid, in the colour of the task it is tagged with (acid when untagged). Break = hatched. A pause is a gap. The live span glows. |
| F4 | Clicking a reality span (rail or clock ring) opens its popup with start, end and duration, a **Counts toward** selector (retag), and Delete. |
| F5 | Planned blocks show their real time range even when they cross midnight, and are at least 14 px tall. How much text they show is set by F13. |
| F6 | Block states: done = faded (✓ when there is room). Missed = planned time passed while still open (lighter tint, "missed" in the agenda). Overrun = tracked > planned: a rust strip on the right edge at any size, plus "+Xm over" in the time line when it fits. |
| F7 | Habit blocks are tinted with a coloured edge, like tasks, not a solid bright bar. |
| F8 | Reality spans that cross midnight are split onto both days. |
| F9 | When a dropped task lands later than the drop slot (chain push, Decision 30), a notice says where it went and why. |
| F10 | Clock (maintainer decision): the analog face with tasks as round-capped **arcs ("worms") on lanes around the dial**. Overlapping tasks take the next lane outward (shared lane packer), and lanes get thinner when there are many. **Pomo is colour inside the face**: each recorded span fills its wedge in the tagged task's colour (acid when untagged), breaks are a hatched wedge, and a pause is empty face. Click a wedge to retag or delete it. |
| F11 | The "now" pointer and the active task only appear in the 12-hour half that contains now. Ended tasks are dimmed. |
| F12 | Calendar day view narrower than 360 px switches to an **agenda**: a day strip (plan line + reality line) and one full-width row per task or habit (start/end, title, planned/tracked, +over, missed, "overlaps N"). It has a NOW divider, opens at now, and accepts drops (placed after the row dropped on). "▦ time grid" / "≡ list" toggle the layout. |
| F13 | Calendar time grid: blocks show only what fits their measured size (bar / title / title + time). Lanes are packed by drawn height. At most ⌊width / 80px⌋ lanes are drawn per cluster, and the rest collapse into a "+N" chip that lists them. The default scale is 56 px per hour, and the grid opens scrolled to now. |
| F14 | Clock list: only done tasks are struck through. Past open tasks are dimmed. |

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
