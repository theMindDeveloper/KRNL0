# Canvas Smoothness — Requirements

The owner (2026-11-23): moving around the Free canvas stuttered, and some
windows (the Calendar, text) flickered while it moved, "like a VA monitor".
Panning and zooming must feel smooth and steady at the monitor's refresh rate,
in Free and in the Station layouts that embed the canvas. Decision 65.

## Functional Requirements

- **F1** — The canvas viewport is one GPU layer for as long as the canvas is
  shown. A pan only moves that layer: nothing inside the canvas is drawn again
  and nothing switches on or off when a pan starts, pauses or ends.
- **F2** — Zooming stays sharp the whole way: the layer's hint is opacity, not
  transform (a `will-change: transform` layer keeps the scale it was drawn at,
  so a zoom stretched a soft picture that snapped sharp after: the owner saw a
  blur flicker on every wheel step). Nothing is switched on or off, and no
  redraw waits on a timer.
- **F3** — The viewport layer sits on whole device pixels. The remainder of
  React Flow's translate is taken back with the CSS `translate` property, so
  text does not shimmer while it slides between pixels.
- **F4** — The dot grid (minor every 32, major every 160 flow units, same
  sizes, colours and positions as before) is drawn once per zoom and slid by a
  GPU transform on pan, snapped to whole device pixels. `html[data-grid="off"]`
  still hides it.
- **F5** — Ending a pan or zoom does not re-render the canvas component: the
  saved viewport is read once as the starting point and persisted through a
  store subscription (500 ms debounce, Decision 7), not a React selector.

- **F6** — A class change anywhere in the app (a drag starting, a card being
  selected) never makes the browser re-check the whole page: no `:has()` in
  the renderer's CSS tests a class substring (`[class*=…]`, `[class^=…]`,
  `[class$=…]`); the one-line rule for controls names its wrap parts, the same
  list as the dev overflow guard.
- **F7** — While a mouse button is held, hovering a window does not re-render
  anything, and the embed guard class is set only when the page holds an
  iframe.

## Non-Functional Requirements

- **NF1** — No change of layout or position at rest beyond sub-pixel rounding
  (under half a device pixel). Text on the canvas is drawn by the GPU layer at
  all times, so it keeps one kind of smoothing (greyscale, not ClearType); it
  no longer switches between the two while moving.
- **NF2** — A pan with pauses (trackpad, wheel, right-drag) shows no hitch at
  each pause and no flicker of text.
- **NF3** — Measured in the built app (middle-drag after 5 s idle): the canvas
  moves within 10 ms of the press, and no frame of a pan takes over 20 ms.
  v0.16.1: 26–59 ms and 5–7 such frames per drag; now 3–8 ms and none.

## Use Cases

- **UC-K1** — The user pans slowly across a board with a big Calendar, stopping
  and starting; it glides without hitches and the Calendar's text stays steady.
- **UC-K2** — The user zooms in on a note; it is soft while zooming and sharp a
  moment after the zoom stops, once.

## User Stories

- As a user, I want moving around the canvas to feel as smooth as my monitor
  allows, without anything flickering, so the board feels calm to work on.

## Gherkin Scenarios (ATDD)

```gherkin
Feature: Smooth canvas

  Scenario: F1 the viewport is always one layer
    Given the Free canvas is shown
    Then the canvas container has the class "krnl-canvas"
    And no class is added to it while the canvas pans

  Scenario: F2 zooming stays sharp
    Given the canvas viewport is a GPU layer with an opacity hint
    When the user zooms notch by notch
    Then each step is drawn at its own size (as sharp mid-zoom as at rest)
    And no class is set and no timer runs

  Scenario: F3 the layer lands on whole pixels
    Given a viewport translate of 10.3 px at device pixel ratio 1
    Then the correction is -0.3 px

  Scenario: F3 a canvas at a fractional place on the screen
    Given the canvas starts 0.5 px from the window's edge and a translate of 10 px
    Then the layer lands on a whole pixel (a correction of at most half a pixel)

  Scenario: F4 the grid slides instead of redrawing
    Given a viewport of x 170, y -30, zoom 1
    Then the grid layer sits at (-150, -30)

  Scenario: F6 no :has() tests a class substring
    Given the renderer's style sheets
    Then no :has() contains [class*=, [class^= or [class$=
    And the one-line rule's wrap parts equal the dev guard's WRAP_PARTS

  Scenario: F5 ending a pan does not re-render the canvas
    Given the canvas is mounted
    When the store viewport changes
    Then the viewport is saved once after 500 ms
```
