# App Chrome — Component Requirements

*Phase 5 · React Flow migration · Derived from PRD v0.6.0, Decision 13, and LifeOS Whiteboard reference*

---

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | The topbar (height 44 px) renders via `<Panel position="top-center">`: brand-mark `■`, wordmark `KRNL0`, breadcrumb `∷ ~/krnl0 / boards / deep-work`, and a `◆ live` badge on the left side |
| F2 | The topbar right side renders: FIT button (calls RF `fitView()`), theme toggle button (label `☾ DARK` / `☀ LIGHT` per active theme), TWEAKS button, and SHARE button |
| F3 | The left dock renders via `<Panel position="top-left">` at `left: 14px; top: 60px` inside a glassmorphic container (`backdrop-filter: blur`, `border`, `border-radius: 8px`) with 4 icon buttons: select tool, text node, image node, and connect tool |
| F4 | The text node and image node buttons dispatch `board.addNode` with kind `text`/`image` at canvas center; the select and connect buttons change the active tool mode only (no node creation) |
| F5 | The statusbar (height 28 px, background `var(--ink)`) renders via `<Panel position="bottom-left">` showing: active node count, edge count, and current board name |
| F6 | The theme toggle switches between `data-theme="dark"` and `data-theme="light"` on the `<html>` element; the selection persists to `localStorage` under key `krnl0-theme` |
| F7 | The FIT button calls `reactFlowInstance.fitView({ padding: 0.1 })` bringing all nodes into view |
| F8 | Dock button keyboard shortcuts: `V` activates select mode, `N` creates a text note node, `I` creates an image node, `Escape` deactivates connect mode; shortcuts are shown as tooltip text on each button |
| F9 | Fixed (mother) nodes show `‹` / `›` reorder arrows on hover; clicking an arrow swaps that node's horizontal position with its adjacent neighbour |

---

## Non-Functional Requirements

| # | Requirement |
|---|---|
| NF1 | Chrome panels use RF `<Panel>` — not `position: fixed` CSS — so they move correctly when the RF container is not full-screen |
| NF2 | The topbar and statusbar widths match the RF container width, not the window width |
| NF3 | The TWEAKS and SHARE buttons are rendered as stubs (no-op click handlers) in Phase 5 — their presence satisfies the visual parity requirement; full implementation is a post-Phase-5 item per Decision 13 non-goals |
| NF4 | Theme persistence uses `localStorage`; the stored value is read on app boot before first render to avoid a flash of wrong theme |

---

## Use Cases

**UC-A1 — Add a node via dock**
Actor clicks the text node icon in the left dock. A new TextNode appears at canvas center. Actor positions it by dragging.

**UC-A2 — Toggle theme**
Actor clicks the theme toggle. Canvas and all nodes switch from dark to light theme instantly. On next app launch, light theme loads without a dark flash.

**UC-A3 — Fit view**
Actor clicks FIT. The viewport animates to frame all nodes with 10% padding.

**UC-A4 — Read board status**
Actor reads the statusbar at a glance: "5 nodes · 2 edges · deep-work" without opening any settings pane.

---

## User Stories

- As a user, I want the topbar brand and breadcrumb so I always know which board I am on.
- As a user, I want the dock icon buttons so I can create text and image nodes, and switch between select and connect tool modes, without a right-click context menu.
- As a user, I want `‹` / `›` reorder arrows on fixed nodes so I can rearrange the mother-node row without drag-and-drop.
- As a user, I want the theme toggle in the topbar so I can adjust for ambient light without hunting through settings.
- As a user, I want the FIT button so I can reorient after panning far from my nodes.
- As a user, I want the statusbar counts so I can track board complexity at a glance.

---

## Gherkin Scenarios (ATDD)

```gherkin
Feature: App chrome panels

  Background:
    Given the app is mounted with boardStore containing 3 nodes and 1 edge in board "deep-work"

  Scenario: F1 — Topbar left content
    When the app renders
    Then the topbar contains the brand-mark "■"
    And the topbar contains the wordmark "KRNL0"
    And the topbar contains breadcrumb text "∷ ~/krnl0 / boards / deep-work"
    And the topbar contains badge text "◆ live"

  Scenario: F2 — Topbar right buttons present
    When the app renders
    Then the topbar contains a "FIT" button
    And the topbar contains a theme toggle button
    And the topbar contains a "TWEAKS" button
    And the topbar contains a "SHARE" button

  Scenario: F3 — Left dock position and buttons
    When the app renders
    Then a dock panel is present at position "top-left"
    And the dock container has a glassmorphic style (backdrop-filter blur, border, border-radius 8px)
    And the dock contains a select tool button
    And the dock contains a text node button
    And the dock contains an image node button
    And the dock contains a connect tool button

  Scenario: F4 — Text node button creates node at canvas center
    When the user clicks the text node dock button
    Then onCommand is called with { type: "board.addNode", kind: "text", position: canvasCenter }
    And a new TextNode appears on the canvas

  Scenario: F4b — Select button changes active tool mode, no node created
    When the user clicks the select dock button
    Then the active tool mode becomes "select"
    And no board.addNode command is dispatched

  Scenario: F4c — Connect button changes active tool mode, no node created
    When the user clicks the connect dock button
    Then the active tool mode becomes "connect"
    And no board.addNode command is dispatched

  Scenario: F5 — Statusbar content
    When the app renders
    Then the statusbar reads "3 nodes · 1 edge · deep-work"

  Scenario: F6 — Theme toggle persists to localStorage
    Given data-theme on <html> is "dark"
    When the user clicks the theme toggle button
    Then data-theme on <html> becomes "light"
    And localStorage["krnl0-theme"] is "light"
    And the button label changes to "☀ LIGHT"

  Scenario: F6b — Theme restored from localStorage on boot
    Given localStorage["krnl0-theme"] is "light"
    When the app mounts
    Then data-theme on <html> is "light" before the first paint

  Scenario: F7 — FIT button calls fitView
    When the user clicks the FIT button
    Then reactFlowInstance.fitView is called with { padding: 0.1 }

  Scenario: F8 — V key activates select mode
    When the user presses the "V" key
    Then the active tool mode becomes "select"
    And no board.addNode command is dispatched

  Scenario: F8b — N key creates a text note node
    When the user presses the "N" key
    Then onCommand is called with { type: "board.addNode", kind: "text", position: canvasCenter }

  Scenario: F8c — I key creates an image node
    When the user presses the "I" key
    Then onCommand is called with { type: "board.addNode", kind: "image", position: canvasCenter }

  Scenario: F8d — Escape deactivates connect mode
    Given the active tool mode is "connect"
    When the user presses the "Escape" key
    Then the active tool mode becomes "select"

  Scenario: F9 — Reorder arrows appear on fixed node hover
    Given the board has two fixed (mother) nodes side by side
    When the user hovers over the left fixed node
    Then a "›" reorder arrow appears on the node
    When the user clicks the "›" arrow
    Then the two nodes swap horizontal positions
```

---

*Last updated: 2026-05-10 — F3/F4/F8 rewritten for child-node dock; F9 added (mother reorder arrows)*
