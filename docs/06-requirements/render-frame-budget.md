# Render Frame Budget — Requirements

Issue: [#197](https://github.com/theMindDeveloper/KRNL0/issues/197)

KRNL0 keeps its ambient motion (breathing badges, orb float, edge dashes, clock
sweep, radio visualizer) but must not burn CPU like a game while idle. On a
high-refresh monitor Chromium renders a smooth infinite animation at the panel
rate (~218 fps measured), and every frame costs CPU in the GPU process and the
renderer. Decorative motion is budgeted to ~30 updates per second; Chromium
skips the frames where nothing changes.

## Functional Requirements

- **F1** — Every infinite CSS animation in the renderer gets an effect-level
  `steps(N)` timing with `N = round(duration_ms / 1000 × 30)` (min 2), so it
  updates ~30×/s. Keyframe curves, colours and durations are unchanged.
- **F2** — Animations that start later (mounts, inline-style changes) are
  budgeted too (document-level `animationstart` listener).
- **F3** — Transitions, finite (one-shot) animations and Web Animations created
  from JS are not touched; hover and interaction stay at full refresh.
- **F4** — An element (or ancestor) with `data-frame-budget="off"` opts out.
- **F5** — The ambient radio canvas draws only when its state changes while
  silent, and on a ~30 fps timer while playing. It stops drawing while hidden
  or the window is in the background, and redraws when shown again.

## Non-Functional Requirements

- **NF1** — Idle CPU with the default board and Pro theme drops by at least 4×
  versus the unbudgeted build (measured: ~217% → ~40% of a core).
- **NF2** — No visual change beyond the update rate of decorative motion.

## Use Cases

- **UC-K1** — User leaves KRNL0 open beside other work; the fans stay quiet and
  Task Manager shows low single-digit CPU while all animations keep moving.

## User Stories

- As a user, I want KRNL0 to look alive without draining my CPU while I'm not
  touching it.

## Gherkin Scenarios (ATDD)

```gherkin
Feature: Frame budget for decorative animations

  Scenario: F1 infinite animation is quantised
    Given an element with an infinite 1.6s CSS animation
    When the frame budget is installed
    Then its effect easing is "steps(48)"

  Scenario: F2 late-starting animation is quantised
    Given the frame budget is installed
    When an infinite CSS animation starts later
    Then its effect easing is set to steps on animationstart

  Scenario: F3 one-shot animation is left alone
    Given a CSS animation with 1 iteration
    When the frame budget is installed
    Then its easing is unchanged

  Scenario: F4 opt-out
    Given an infinite animation inside data-frame-budget="off"
    When the frame budget is installed
    Then its easing is unchanged

  Scenario: F5 silent radio does not redraw every frame
    Given the radio widget is visible and not playing
    Then the canvas is drawn once per state change, not on every refresh
```
