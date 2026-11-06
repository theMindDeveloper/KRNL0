# Pocket timer — the Pomo node floating over other apps

Decision 37. Design: Claude Design canvas "KRNL0 launch designs", board *Mini timer B · Pocket
Pomo node · Pomodoro and Observe*. Code: `src/main/pocket/`, `src/shared/pocket.ts`,
`src/renderer/pocket/`, `src/renderer/components/nodes/PomoNode/derive.ts`,
`src/sys/commands/mini.ts`.

When KRNL0 is minimised while the Pomo node is timing something, a small always-on-top window
shows the same node, shrunk to fit, over whatever the user works in. It speaks both of the
node's modes: **Pomodoro** (counts down to a session, pips, "Are you done?") and **Observe**
(counts up, today's spans on a day strip, Work today / Breaks / Spans). It is a view of the
node, never a second timer.

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | **Shows on minimise.** When the main window is minimised and the Pomo node is `running`, `paused` or on `break`, and the floating timer is on, the pocket window appears (without taking focus). It hides when the main window is restored or focused, and when the node goes idle (Stop). |
| F2 | **Pomodoro mode.** Header `● DEEP WORK · POMO.025` (or `ON · <task>`), the user's chosen timer face counting down, the session meter, `SESSION n / N` pips, and the node's own controls: running → Stop · Break · Pause; paused → Stop · Resume; break → the break counts up and the primary button ends it (`pomo.stop`). |
| F3 | **"Are you done?" in Pomodoro.** Once the session length is reached the pocket shows the node's prompt with the same three choices: Extend · Break · Stop. The timer keeps counting; nothing happens by itself. |
| F4 | **Observe mode.** Header `● TIME LOG` (`· BREAK` on a break), a count-up of the current span, today's spans on the day strip (work as rounded segments in its tag colour, breaks as a thin line), Work today / Breaks / Spans, and the node's controls: working → Break · Stop; on break → Back to work · Stop. No Pause in Observe. |
| F5 | **Same commands as the node.** Every pocket button runs the node's own command on the Pomo mother (`pomo.start`, `pomo.pause`, `pomo.resume`, `pomo.break`, `pomo.stop` / `pomo.discard` per "Count stopped sessions", `pomo.extend`). Main only forwards commands from that fixed list. |
| F6 | **Collapse.** Box: a 304 × 48 strip (dot, time, `2 / 4` or `↑ time log`, expand). Dial: a 44 × 92 tab with the minutes; clicking it brings the dial back. The capsule is always small. The choice is remembered. |
| F7 | **Move it anywhere.** The header drags the window. Its position is remembered and clamped to a visible screen, so it never reappears off-screen after a monitor is unplugged. |
| F8 | **Open KRNL0.** An Open button restores and focuses the main window (and so hides the pocket). |
| F9 | **On / off.** Settings → Floating timer switch (on by default). Off: the pocket never shows. |
| F10 | **CLI** (AGENTS.md rule 8): `krnl mini status [--json]`, `krnl mini show`, `krnl mini hide`, `krnl mini on`, `krnl mini off`, `krnl mini look [dial\|capsule\|box]`. `show` shows it now, whatever the main window's state, while a session runs. |
| F12 | **Three looks** (Settings → Floating timer, `krnl mini look`). **Dial** (default): a 184 px round timer with the Clock's ticks; in Pomodoro the ring is the time left, in Observe it is the day 06–22 with today's spans as arcs and breaks as dots; hovering shows the controls under it. **Capsule**: a pill — a small ring that empties (Pomodoro) or a recording dot and a count-up (Observe); `done?` turns it acid; hovering opens a card with the time, meter or day strip, totals and controls. **Box**: the node itself (F2–F4). The window is transparent and sized to the look; main watches the pointer for hover, since drag regions hide it from the page. |
| F11 | **Away time.** When the node is asking whether time spent asleep/away should count, the pocket shows "Away time — open KRNL0 to decide" instead of controls, so the two never disagree. |

## Non-Functional Requirements

| # | Requirement |
|---|---|
| NF1 | **One source of truth.** The pocket never loads or saves the board. The main window's renderer sends it a snapshot of the Pomo node; time is computed in the pocket from the snapshot's timestamps, so it is exact even while the main window is throttled. |
| NF2 | **One set of rules.** The node and the pocket derive times, the done prompt and the control set from one pure module (`PomoNode/derive.ts`), unit-tested. |
| NF3 | **Small and quiet.** 304 × ~250 px expanded, 48 px tall collapsed; no taskbar entry; never steals focus when it appears. |
| NF4 | **Per-worktree.** Its preferences live in `userData/pocket.json`, which is per worktree in dev (rule 10). Nothing goes into `board.json`. |
| NF5 | **The main window stays the main window.** CLI dispatch, second-instance focus, app activation and updates always target the main window, never the pocket. Closing the main window closes the pocket. |

## Out of scope (follow-ups)

- The Observe "what was this?" tagger inside the pocket — the node asks when KRNL0 is opened.
- Docking the dial's tab to the screen edge (it is a small tab wherever the dial was).

## Use Cases

- **UC-P1 — Writing with a Pomodoro running.** The user starts a 25 min session, minimises KRNL0 and opens their editor. The pocket floats top-right showing 15:42. At 25:00 it asks "Are you done?"; the user clicks Break; the break counts up in the pocket.
- **UC-P2 — Observing a study block.** In Observe mode the user starts tracking "Outline chapter 3" and minimises. The pocket shows 41:36 counting up, the day strip and 3h 15m today. They click Break, later Back to work, then Stop; the pocket hides.
- **UC-P3 — Out of the way.** The user collapses the pocket to one line and drags it to the bottom-left corner. Next time it opens there, collapsed.
- **UC-P4 — Assistant.** "Hide the floating timer for today" → `krnl mini off`.

## Gherkin Scenarios (ATDD)

```gherkin
Feature: Pocket timer

  Scenario: F1 shows on minimise while timing
    Given the Pomo node is running and the floating timer is on
    When the main window is minimised
    Then the pocket window is shown without focus
    When the main window is restored
    Then the pocket window is hidden

  Scenario: F1 stays hidden when idle
    Given the Pomo node is idle
    When the main window is minimised
    Then the pocket window stays hidden

  Scenario: F2 Pomodoro controls by status
    Given Pomodoro mode
    Then running offers stop, break, pause
    And paused offers stop, resume
    And break offers end break

  Scenario: F3 done prompt
    Given Pomodoro mode with 25 min sessions and 25 min of work
    Then the pocket shows "Are you done?" with extend, break, stop

  Scenario: F4 Observe controls by status
    Given Observe mode
    Then working offers break, stop
    And on break offers back to work, stop
    And there is no pause

  Scenario: F5 only pomo commands are forwarded
    When the pocket sends "board.reset"
    Then main refuses it and nothing runs

  Scenario: F7 off-screen position is clamped
    Given a saved position outside every display
    When the pocket is shown
    Then it is placed inside the nearest display's work area

  Scenario: F9 off means never
    Given the floating timer is off
    When the main window is minimised while running
    Then the pocket stays hidden

  Scenario: F10 CLI
    When I run "krnl mini status --json"
    Then I get enabled, visible and collapsed as JSON
    When I run "krnl mini off"
    Then the floating timer is off and hidden
```
