# Theme Engine — Component Requirements

*Frame styles become full themes · Derived from ADR 0009 (frame-style theme engine) and the "KRNL0 Reimagined" design drafts*

Today a frame style (Classic, Synthesizer, Telemetry, KRNL Dock, Blueprint, Macintosh, Submarine) only paints chrome around the mother row. The components inside look the same in every style, child nodes on the canvas never pick up a style's tokens, and about 80 colour literals inside components ignore themes entirely. This document specifies the engine that lets every frame style skin every component from one manifest, and adds a new **Pro** frame style. **Classic stays the default and keeps today's green look unchanged.**

---

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | Every frame style declares a `ThemeManifest` (tokens per mode, component variants, slots, fonts). The manifest lives on its `DOCK_REGISTRY` entry; there is no second registry. |
| F2 | `applyFrameTheme(id, mode)` writes the manifest's tokens as CSS custom properties on `<html>` using the token names components already read (`--paper`, `--ink*`, `--acid`, `--rust`, `--cyan`, …) plus new `--k-*` tokens for values that were previously hard-coded. Because the tokens sit on `<html>`, mother nodes **and** child canvas nodes (task, text, image) inherit them. |
| F3 | The Classic manifest reproduces today's look exactly: every new `--k-*` token defaults to the literal it replaces. Classic stays `DEFAULT_DOCK_STYLE`. |
| F4 | A new frame style `pro` ("Pro · matte graphite") ships: neutral graphite surfaces, one lit acid accent, matte panels. Amended 2026-11-03: Pro has a light mode too (light-grey panels, graphite ink, the lime kept as a fill), so choosing Light on Pro stays on Pro instead of switching to the default style. The default style (id `classic`) is shown as "Paper · Cream & lime"; `krnl theme frame paper` is an alias. |
| F5 | `sys theme frames` lists every frame style (id, label, modes, active marker). `sys theme frame <id>` switches the frame style in the open window. `sys theme show` reports both `theme` (light/dark) and `frame`. All three support `--json`. |
| F6 | The Clock dial renders the same feature set in every style: task arcs (outer lane), pomo session arcs (inner lane: done / running / remaining), 60 ticks, numerals with 12 highlighted, now-pointer, hour/minute/second hands, hub, HH:MM readout. A style only changes appearance through `components.clock` params. |
| F7 | `components.pomo.face` is the default Timer face for a style. It is used only when the node has no face of its own; a face the user picked in Pomo settings always wins. |
| F8 | The terminal's xterm colours come from the manifest (`components.terminal.xterm`) and update live when the frame style or mode changes, without remounting the terminal. |
| F9 | `slots.panelToggles` decides where the Station panel toggles render: `'row'` (today's separate toolbar row), `'topbar'` (inside the TopBar), or `'chrome-top'` (inside the style's own top chrome). When it is not `'row'`, the separate toolbar row is not rendered. |
| F10 | Fonts a style needs are bundled with the app and loaded only while that style is active; nothing is fetched from the network at runtime. |
| F11 | Component bodies use plain surface tokens; textures (scanlines, brushed metal, wood grain, grids) are confined to chrome and the canvas background. |
| F12 | Switching frame style or mode never loses component detail: every control, readout and menu a component has in Classic is present in every other style. |

---

## Non-Functional Requirements

| # | Requirement |
|---|---|
| NF1 | Switching frame style applies within one animation frame and needs no reload or remount of nodes. |
| NF2 | After migration, node components contain no hard-coded hex/rgba colours except those on an explicit allowlist (habit/task tone palettes that are data, not theme). A unit test enforces the allowlist. |
| NF3 | The manifest contract is strictly typed (`ThemeManifest`, `ThemeTokens`); adding a style is one registry entry plus one manifest file. |
| NF4 | Works offline; no runtime network request for fonts or assets. |
| NF5 | `npm run typecheck` reports 0 errors and `npm test` is green at the end of every phase. |
| NF6 | Text meets WCAG AA (4.5:1, 3:1 at 18px+) against its real surface in every style and mode, measured on the live renderer. Exempt: disabled controls, decorative glyphs. Acid used as text goes through `--acid-ink`; text on the accent through `--ink-on-bright`. |
| NF7 | Light/dark and frame-style switches reveal the new look in one View Transition frame (circle from the pointer), with an instant fallback under `prefers-reduced-motion`. A dark-only style shows dark without overwriting the saved light/dark preference. |

---

## Use Cases

**UC-T1 — Switch frame style from the picker**
Actor opens the Frame-style picker in the left dock and picks Pro. The chrome changes, and every mother node and child node re-skins immediately.

**UC-T2 — Switch frame style from the CLI**
The assistant (or a user in the terminal) runs `sys theme frame synthesizer`. The open window switches to Synthesizer. `sys theme show --json` returns `{ "theme": "dark", "frame": "synthesizer" }`.

**UC-T3 — Keep the original look**
Actor picks Classic. The app looks exactly as it did before the engine existed (the original green theme).

**UC-T4 — Personal Pomo face survives a style change**
Actor set their Pomo face to ASCII in settings, then switches to Telemetry (whose default face is LCD). The Pomo node keeps ASCII.

**UC-T5 — Panel toggles inside the chrome**
In Station mode with Pro active, the panel toggles sit in the TopBar and no separate toolbar row is drawn.

---

## User Stories

- As a user, I want each frame style to restyle the components too, so a style feels like one coherent instrument rather than a frame around the same cards.
- As a user, I want the original green look to stay available, so a new style never takes away the one I know.
- As a user, I want the clock to show my tasks and pomo sessions in every style, so switching style never hides information.
- As the assistant, I want `sys theme` commands, so I can switch and inspect the frame style without the mouse.

---

## Gherkin Scenarios (ATDD)

```gherkin
Feature: Frame-style theme engine

  Scenario: F1 — every frame style has a manifest
    Given the dock registry
    Then every entry has a manifest with tokens for each supported mode

  Scenario: F2 — tokens are applied on the document root
    When applyFrameTheme("pro", "dark") runs
    Then <html> has the CSS custom property "--paper" set to the Pro page colour
    And <html> has data-dock="pro"

  Scenario: F3 — Classic keeps today's look
    When applyFrameTheme("classic", "dark") runs
    Then every "--k-*" token equals the literal it replaced
    And <html> has no data-dock attribute

  Scenario: F4 — Pro frame style exists
    Then the dock registry contains "pro" with label "Pro", with light and dark modes

  Scenario: F5 — CLI lists and switches frame styles
    When I run "sys theme frames --json"
    Then the result lists 8 frame styles including "classic" and "pro"
    When I run "sys theme frame pro" with a renderer window open
    Then the renderer receives cli:dispatch "theme.frame" with value "pro"
    When I run "sys theme frame nope"
    Then the command fails with "Unknown frame style: nope"

  Scenario: F6 — clock features are identical across styles
    Given any frame style
    When the clock dial renders at 17:06 with 4 scheduled tasks and a running pomo
    Then it draws 4 task arcs, the pomo arcs, 60 ticks, 12 numerals, a now-pointer, 3 hands and a "17:06" readout

  Scenario: F7 — a user's Pomo face wins over the style default
    Given a Pomo node with config.face "ascii"
    When the frame style switches to "telemetry" whose default face is "lcd"
    Then the Pomo node renders the "ascii" face

  Scenario: F8 — terminal colours follow the style
    Given an open terminal
    When the frame style switches to "pro"
    Then the xterm theme background equals the Pro manifest terminal background

  Scenario: F9 — panel toggles move into the top bar
    Given Station mode and frame style "pro"
    Then the station panel toggles render inside the TopBar
    And no separate station toolbar row is rendered

  Scenario: F10 — fonts are local
    When frame style "krnl-dock" is active
    Then its fonts load from bundled files and no network font request is made

  Scenario: F12 — no detail is lost
    Given frame style "pro"
    Then the Pomo node still shows its gear, cycle counter and session pips
    And the Todo node still shows overdue markers and the W·B·Tm breakdown
```

---

## Delivery phases

| Phase | Scope |
|---|---|
| 1 | Engine core (F1, F2, F3), Pro manifest (F4), CLI (F5), first literal sweep, tests |
| 2 | Clock parity (F6), Pomo face defaults + new faces (F7), xterm theme (F8) |
| 3 | Panel-toggle slot (F9), local fonts (F10), component backgrounds (F11) |
| 4 | Per-style component skins for the six legacy styles, one style per commit (F12) |
| 5 | Readability pass (NF6), look-switch transition and preference fix (NF7), tactile top-bar buttons |

*Last updated: 2026-11-01 — phase 5 readability and transitions*
