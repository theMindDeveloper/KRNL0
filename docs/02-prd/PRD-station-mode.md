# PRD — Station Mode

*Drafted 2026-05-18 · Status: Proposed · Pairs with [ADR 0008](../03-adr/0008-station-mode-layout-toggle.md)*

---

> Terminology note. "Station Mode" is a new **layout** for the existing app. The word **dock** is reserved for the existing decorative chrome variants (`classic | synthesizer | telemetry | krnl-dock`) chosen via `useDockStyle()`. Station Mode does not change the dock chrome — it adds a new layout in which that same chrome wraps the mother row.

---

## 1. One-sentence pitch

Add a switchable **Station Mode** that mounts KRNL0's mother nodes in fixed, VS-Code-style resizable panels at screen-anchored positions — with the existing infinite canvas embedded as a fully-functional widget in one of the panels, and the existing dock chrome (synth/telemetry/krnl-dock) wrapping the mother row exactly as it does today — so first-time users see a dashboard instead of a scratchpad, and power users can flip back to **Canvas Mode** in one click.

## 2. Problem

Repeated feedback from informal testers:

> "I open the app and see this floaty thing. I don't know what to do. The important nodes are just… stuck on the canvas."

The current layout anchors Pomo, Todo, Habit, Term, Calendar, Clock at fixed canvas positions and wraps them in a dock-chrome variant. But those mothers still pan and zoom with the canvas — they drift off-screen the moment a user pans. The visual signal that "this is application chrome" is already there (the synth knobs, the krnl-dock rails); the *behavioural* signal is wrong (the chrome pans).

The thesis of v0.6.0 — "one canvas, talk to it, yours to own" — remains right for power users and long-form planning. It is wrong as a default for first-run users and for daily-driver use.

## 3. Goal

Ship a per-board toggle:

- **Canvas Mode** (current behaviour, unchanged): infinite canvas; mother nodes anchored as RF nodes; everything pans/zooms together; ChassisLayer decorates via `ViewportPortal`.
- **Station Mode** (new default for new boards): mother nodes mounted in screen-anchored, resizable CSS-grid panels; infinite canvas embedded as one widget; ChassisLayer decorates in screen-space; same source of truth, same visual style, same dock chrome variants.

The toggle is reversible, lossless, persisted per board, and accessible via a topbar pill and a keyboard shortcut.

## 4. Non-goals (v1)

- A new visual design or CSS file specific to Station Mode. *Visual style is shared.* Any refresh applies to both modes.
- A new dock chrome variant. The existing four variants (classic/synth/telemetry/krnl-dock) remain the only choices.
- A new node type or schema migration beyond `layoutMode`, `layoutGeometry.station`, and `stationSlot`.
- User-customisable station slots (re-ordering panels by drag). Slot bindings are config-driven in v1.
- Mobile / narrow-viewport station layout. Station mode requires ≥ 1024 × 640.
- A third mode (e.g., "focus mode" with only Pomo visible). Two modes only.
- Per-user "default mode applied across all boards" preference. Per-board only in v1.
- Multiple boards visible side-by-side.

## 5. Users

| User type | Today's pain | Station Mode value |
|---|---|---|
| First-time user (HTW reviewer, demo audience) | "What is this floaty thing?" | Sees a structured dashboard. Knows where Pomo / Tasks / Habits / Calendar / Clock are. Can start a session without learning the canvas first. |
| Daily driver | Pans away, can't find Pomo, hits FIT, pans back | Pomo is always in the top-left. Canvas window is for the wires/tasks; mothers are always where they were. |
| Power user / long-form planner | "I want everything as nodes on one surface so I can wire them together." | Toggle to Canvas Mode. Unchanged from today. |
| Customiser | "I want to make the right column wider — Calendar is cramped." | Drag the splitter between Habit and Calendar columns. State persists. |
| Demo audience (live demo 2026-07-20) | The reviewer sees a sparse, unanchored canvas and misses the structure | Defaults to Station Mode on a fresh board; structure is immediately visible. |

## 6. User stories

- **U1** — As a first-time user, when I open the app, I see five named regions (Pomo, Tasks, Habits, Calendar, Clock) in fixed positions so I know what the app is about.
- **U2** — As any user, I can click a pill in the topbar to switch between Station and Canvas modes without losing any data.
- **U3** — As a power user, my Canvas Mode boards stay in Canvas Mode after the Station Mode update ships — nothing changes for me unless I opt in.
- **U4** — As a daily driver, my Station Mode layout is persisted so the next time I open this board it is still in Station Mode, with my resized columns intact.
- **U5** — As a keyboard-first user, I can toggle modes with `⌘/Ctrl+Shift+L`.
- **U6** — As a user with multiple boards, each board remembers its own mode independently.
- **U7** — As a user in Station Mode, I can pan/zoom inside the canvas window without disturbing the station layout.
- **U8** — As a user in Station Mode, the mother nodes (Pomo timer, Task list, Habit grid, Calendar, Clock, Terminal) work identically to Canvas Mode — same commands, same wiring behaviour, same store, same look.
- **U9** — As a user, I can drag the splitter between any two adjacent station panels to resize them, and double-click a splitter to reset it to its default proportion.
- **U10** — As a user, the dock chrome variant I picked (classic, synth, telemetry, krnl-dock) wraps the mother row in Station Mode exactly as it does in Canvas Mode.
- **U11** — As a user in Station Mode, I can add a text node, image node, or frame node to the embedded canvas using the same left dock that the canvas mode uses.
- **U12** — As a user, dark/light theme toggling affects Station Mode and Canvas Mode identically.

## 7. Functional requirements

| # | Requirement |
|---|---|
| F1 | `boardStore` exposes `layoutMode: 'canvas' \| 'station'` and `setLayoutMode(mode)`; both are persisted to `board.json` |
| F2 | A `LayoutModeToggle` pill in the topbar (immediately left of FIT) shows the current mode and flips it on click |
| F3 | The keyboard shortcut `⌘/Ctrl+Shift+L` calls `setLayoutMode(otherMode)` |
| F4 | In `'canvas'` mode, React Flow fills the viewport (current behaviour, unchanged); `ChassisLayer` decorates via `ViewportPortal` |
| F5 | In `'station'` mode, a CSS-grid station shell occupies the viewport with named slots: top-left (Pomo), top-center (Tasks), top-right-pre (Habits) *if 5-column*, top-right-upper (Calendar), top-right-lower (Clock), bottom-strip (Term), centre-large (embedded canvas) |
| F6 | The embedded canvas is the same React Flow instance — same nodes, same edges, same store, same commands — mounted inside the station's centre cell instead of the viewport |
| F7 | Mother nodes render in their station slots (not inside the canvas) in Station Mode; child nodes (task children, habit lanes, frame groups, text/image/wires) stay inside the canvas window |
| F8 | `MotherFrame` accepts `variant?: 'canvas' \| 'station'`; the *content* of every mother is unchanged across variants — only the chassis wrapping logic differs (no `ViewportPortal` in station variant) |
| F9 | Mode toggle is lossless: switching `canvas → station → canvas` returns to the original canvas layout (mother positions, RF viewport, RF zoom, child node coords all preserved) |
| F10 | New boards default to `'station'`; existing boards loaded from a pre-ADR `board.json` default to `'canvas'` |
| F11 | Every divider between station cells is a draggable splitter; drag to resize, double-click to reset; resize state stored in `board.json` under `layoutGeometry.station` |
| F12 | Inside the embedded canvas, pan, zoom, fit, add text node, add image node, add frame node, drop child nodes, wire edges, and the assistant orb all work as in Canvas Mode (zero feature loss) |
| F13 | The dock chrome variant (`classic \| synthesizer \| telemetry \| krnl-dock`) selected via `useDockStyle()` wraps the mother row in **both** modes; `ChassisLayer` branches between `CanvasChassis` (existing, ViewportPortal-anchored) and `StationChassis` (new, screen-anchored) based on `layoutMode` |
| F14 | Dark/light theme toggling applies identically in both modes; the station shell's own CSS reads from theme tokens, not hardcoded colours |
| F15 | The mode toggle pill has tooltip `Toggle Station / Canvas mode (⌘⇧L)` |

## 8. Non-functional requirements

| # | Requirement |
|---|---|
| NF1 | Mode switch happens in a single render — no animation that exceeds 200 ms, no flash of unmounted nodes |
| NF2 | `board.json` schema version is bumped to accommodate `layoutMode`, `layoutGeometry.station`, and `stationSlot`; migration is forward-only |
| NF3 | Station layout uses CSS grid for the cell shape and `react-resizable-panels` for the splitter handles; no custom layout math |
| NF4 | The mother-node content component renders identically in both modes — the only difference is the wrapper. **No CSS file is added for Station Mode.** |
| NF5 | The mode toggle requires at most one remount of the React Flow tree; node and edge state is preserved across the remount |
| NF6 | Station mode minimum viewport: 1024 × 640. Below that, station mode falls back to canvas mode for the session (saved mode preserved); fallback is announced in the statusbar |
| NF7 | No two sources of truth: mother nodes in station mode read from the same `boardStore.nodes` array as in canvas mode |
| NF8 | `ChassisLayer` produces visually-equivalent output for the same `dockStyle` in both modes (parity test) |
| NF9 | New dependency `react-resizable-panels` is < 30 kB gzipped, MIT-licensed, and added to `package.json` `dependencies` (not `devDependencies`) |

## 9. Use cases

**UC-1 — First-run on a fresh install.** A new user installs KRNL0, creates a board called "today". The board opens in Station Mode. They see Pomo at top-left, an empty Tasks list at top-center, an empty Habits grid (5-column layout), Calendar week-view top-right-upper, Clock top-right-lower, an empty canvas in the centre, and the synth/telemetry/krnl-dock chrome (whatever they picked globally) wrapping the row. They start typing into Tasks.

**UC-2 — Existing user upgrades.** An existing user updates the app. Their "deep-work" board opens in Canvas Mode (exactly as before). They notice the new `◳ STATION / ◰ CANVAS` pill in the topbar. They click `STATION`. The mothers slot into fixed cells; the krnl-dock rails — which previously panned with the canvas — now sit in screen-space around the mother row. The canvas (with their three task nodes wired to a habit) is now a window in the middle. They click back to Canvas Mode; the krnl-dock rails resume panning.

**UC-3 — Daily-driver workflow.** The user lives in Station Mode. They drag the splitter between Habit and Calendar to give Calendar more space. They resize the row height to make Pomo bigger. They start a session with one click on Pomo's START. Tomorrow they re-open the board and the splitter positions are exactly as they left them.

**UC-4 — Multiple boards, multiple modes.** "deep-work" board is in Station Mode; "tinker" board is in Canvas Mode. Switching between them via the breadcrumb restores each board's saved mode.

**UC-5 — Power user wires nodes in Canvas Mode, then switches to Station for daily use.** The user uses Canvas Mode to design a complex chain (task → pomo → habit). Tomorrow they flip to Station Mode for daily work. The chain lives inside the canvas window; Pomo is in the station slot; double-clicking a task in the canvas window loads it into the Pomo cell — same dispatch path as before.

**UC-6 — Demo on July 20.** The presenter opens KRNL0 fresh on stage. The board is in Station Mode by default. The audience sees a structured dashboard. The presenter clicks Tasks, adds three items, hits START on the Pomo, then clicks `◰ CANVAS` to show off the wire-graph view for a few seconds, then flips back.

**UC-7 — Customiser changes dock chrome.** The user opens settings, switches dock style from `classic` to `krnl-dock`. The krnl-dock rails now wrap the mother row in both Station Mode and Canvas Mode. The user toggles between modes; the same chrome variant is visible in each.

## 10. Acceptance criteria (Gherkin)

```gherkin
Feature: Station Mode

  Background:
    Given the app is mounted with a board "deep-work" containing 1 pomo, 1 todo, 1 habit, 1 calendar, 1 clock, 1 term, 2 task children, and 1 edge

  Scenario: F1 — layoutMode persists across reload
    Given layoutMode is "canvas"
    When the user calls setLayoutMode("station")
    And the board is saved to board.json
    And the app reloads the board
    Then layoutMode is "station"

  Scenario: F2 — Toggle pill flips mode
    Given layoutMode is "canvas"
    When the user clicks the LayoutModeToggle pill
    Then layoutMode is "station"
    When the user clicks the pill again
    Then layoutMode is "canvas"

  Scenario: F3 — Keyboard shortcut flips mode
    Given layoutMode is "station"
    When the user presses Ctrl+Shift+L
    Then layoutMode is "canvas"

  Scenario: F5 — Station mode renders all default slots
    Given layoutMode is "station"
    When the app renders
    Then a station cell "top-left" contains the pomo node
    And a station cell "top-center" contains the todo node
    And a station cell "top-right-upper" contains the calendar node
    And a station cell "top-right-lower" contains the clock node
    And a station cell "bottom-strip" contains the term node
    And the habit node renders in its assigned slot (per OQ-1 resolution)
    And a centre cell contains an embedded React Flow canvas

  Scenario: F7 — Child nodes stay inside the embedded canvas
    Given layoutMode is "station"
    When the app renders
    Then the 2 task children are inside the canvas window
    And no child node is rendered in any station cell

  Scenario: F9 — Toggle is lossless
    Given layoutMode is "canvas" with pomo at world (-1400, 0) and a child task at (240, 80)
    And the RF viewport is at zoom 0.85, pan (120, -40)
    When the user toggles to "station"
    And the user toggles back to "canvas"
    Then pomo is at world (-1400, 0)
    And the child task is at (240, 80)
    And the RF viewport is at zoom 0.85, pan (120, -40)

  Scenario: F10 — New board defaults to station
    When the user creates a new board "fresh"
    Then layoutMode is "station"

  Scenario: F10b — Pre-ADR board defaults to canvas
    Given a board.json without a layoutMode field
    When the app loads it
    Then layoutMode is "canvas"

  Scenario: F11 — Splitter drag persists
    Given layoutMode is "station"
    When the user drags the splitter between the Pomo column and the Todo column to widen Pomo by 60 px
    And the board is saved
    And the app reloads the board
    Then the Pomo column is 60 px wider than its default

  Scenario: F11b — Double-click splitter resets
    Given the user has dragged a splitter off-default
    When the user double-clicks that splitter
    Then the splitter returns to its default position
    And the change persists

  Scenario: F12 — Embedded canvas remains full-feature
    Given layoutMode is "station"
    When the user clicks the "text" tool in the left dock
    And clicks inside the canvas window at (300, 200)
    Then a new text node appears in the canvas window at (300, 200)
    And the new node is added to boardStore.nodes

  Scenario: F13 — Dock chrome is the same variant in both modes
    Given dockStyle is "krnl-dock"
    When the user views the board in canvas mode
    Then ChassisLayer renders the krnl-dock rails in flow-space
    When the user toggles to station mode
    Then ChassisLayer renders the krnl-dock rails in screen-space
    And the rails wrap the actual mother panel boundaries

  Scenario: F14 — Theme toggle applies to both modes
    Given layoutMode is "station" and data-theme is "dark"
    When the user clicks the theme toggle
    Then data-theme becomes "light"
    And the station shell's panel borders read from --line (light value)
    And the mother content reads from --paper / --ink (light values)
    When the user toggles to canvas mode
    Then the canvas still reads "light" tokens

  Scenario: NF6 — Narrow viewport falls back
    Given the window is 800 px wide
    And the saved layoutMode is "station"
    When the app renders
    Then layoutMode is effectively "canvas" for this session
    And the saved layoutMode in board.json remains "station"
    And the statusbar shows "Station mode requires ≥ 1024 px width"
```

## 11. Rollout

| Step | What | Risk |
|---|---|---|
| 1 | Land ADR 0008 + this PRD. Architect signs off on OQs 9.1–9.5 (slot for Habit, splitter library, RF mount strategy, reorder-out-of-scope, narrow-viewport fallback). | None — docs only. |
| 2 | Land schema migration in `board.json` (add `layoutMode`, `layoutGeometry.station`, `stationSlot`; default old boards to `'canvas'`). Add Vitest fixtures. | Low. Forward-only migration. |
| 3 | Land `boardStore.layoutMode` + `setLayoutMode` + `LayoutModeToggle` pill behind a feature flag (`KRNL0_STATION_MODE=1`). No visual change yet. | Low. Hidden behind env. |
| 4 | Land `StationLayout` + `EmbeddedCanvasCell` + per-mother `StationCell` wrappers. Wire `MotherFrame` `variant` prop. Mount RF inside cell when station mode active. | Medium. Touches `MotherFrame`, `CanvasFlow`, `App`. Needs careful test of all six mother kinds. |
| 5 | Land `StationChassis` (screen-space `ChassisLayer` path). Verify parity with `CanvasChassis` for all four dock variants. | Medium. The synth knob rail, telemetry instrument cells, and krnl-dock rails all need re-implementation in screen-space — but their visual content is unchanged. |
| 6 | Land splitter persistence (`layoutGeometry.station` round-trip), keyboard a11y. | Low. |
| 7 | Remove feature flag. Default new boards to station mode. Update onboarding copy. | Medium. First-run UX change. |
| 8 | Update [`docs/06-requirements/app-chrome.md`](../06-requirements/app-chrome.md) with F10/F11/F12/NF5–NF9. Update PRD v0.6.0 index to note station-mode availability. | None — docs. |
| 9 | Playwright smoke covering UC-1, UC-2, UC-3, UC-6, UC-7. | Low. |

Demo target: **Station Mode ready by 2026-07-13** — a week of soak before the 2026-07-20 live demo.

## 12. Open questions (resolved by architect before step 4)

- **OQ-1 — Habit slot in station mode.** ADR 0008 § 9.1 lists three options; lean A (5-column layout: Pomo / Todo / Habit / Calendar+Clock right rail). Architect to confirm.
- **OQ-2 — Splitter library choice.** ADR 0008 § 9.2; lean `react-resizable-panels`. Architect to confirm or veto.
- **OQ-3 — Embedded canvas mount strategy.** ADR 0008 § 9.3; lean A (remount). Architect to confirm or pick portal.
- **OQ-4 — Reorder by drag in v1?** ADR 0008 § 9.4; lean no, defer to v1.1.
- **OQ-5 — Narrow viewport behaviour.** ADR 0008 § 9.5; lean fall back to canvas mode for the session.
- **OQ-6 — Should the assistant orb be inside the canvas window or outside?** Lean inside (it's a canvas tool; it doesn't belong in the chrome). Confirm.

## 13. Success metrics

- After Station Mode ships, ≥ 80% of new boards stay in Station Mode (no toggle to canvas) for their first session.
- First-time testers can name three mother nodes within 10 seconds of opening the app, without help.
- Zero data-loss reports on mode toggle in the first month after launch.
- Live demo on 2026-07-20 opens in Station Mode without commentary needed about "this is an infinite canvas, ignore the empty space."
- ≥ 50% of testers using Station Mode customise at least one splitter within the first session — signal that resize is discoverable.

## 14. References

- [ADR 0008](../03-adr/0008-station-mode-layout-toggle.md) — Architecture rationale, slot binding, ChassisLayer split, migration policy, rejected alternatives.
- [`docs/assets/dockupdate.png`](../assets/dockupdate.png) — User-supplied reference image of the station layout.
- [`docs/assets/prototype-station-mode.html`](../assets/prototype-station-mode.html) — Standalone HTML prototype with live mode toggle, splitter handles, dock-variant indicator, theme toggle. Open in a browser or via the preview panel.
- [`docs/06-requirements/app-chrome.md`](../06-requirements/app-chrome.md) — Existing chrome requirements; to be updated with F10–F12 / NF5–NF9.
- [PRD v0.6.0](./PRD-v0.6.0.md) — Current product spec; this PRD is an additive amendment.
- `src/renderer/components/ChassisLayer/` — Existing dock chrome system (variants: classic, synthesizer, telemetry, krnl-dock).
- `src/renderer/components/nodes/MotherFrame/index.tsx` — Mother chassis (current canvas-mode wrapping).
- `src/renderer/components/Canvas/CanvasFlow.tsx:1304` — Current `<ReactFlow>` mount point.
- `src/renderer/App.tsx:13` — `<ReactFlowProvider>` at App root.
