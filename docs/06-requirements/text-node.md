# TextNode — Component Requirements

*Phase 5 · React Flow migration · Derived from PRD v0.6.0, Decision 4, Decision 13, Decision 20, and LifeOS Whiteboard reference*

---

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | TextNode renders `state.text` inside a body element with class `.text-body`. When `state.text === ''`, the body shows a placeholder `"write..."` in `var(--ink-4)` |
| F2 | Clicking the body switches the node into edit mode: a `<textarea>` replaces the body div, autofocuses, and places the caret at the end of the existing text |
| F3 | While editing, typing updates a local `draft` value. After 400 ms of no keystrokes OR on `blur`, the component dispatches `text.setText` with `{ text: draft }` |
| F4 | Pressing `Escape` while editing restores the pre-edit text and exits edit mode without dispatching |
| F5 | A `<NodeResizer>` is rendered with `isVisible={selected}`, `minWidth=180`, `minHeight=80`, `maxWidth=800`, `maxHeight=2000`. On `onResizeEnd`, dispatch `text.setSize` with `{ width, height }` (rounded integers) |
| F6 | When `state.width` / `state.height` are absent, the node renders with default width 260 px and min-height 120 px |
| F7 | Visual style matches LifeOS `.node.text`: transparent background, 1px dashed `var(--paper-3)` border at rest, solid border + `--shadow-1` on hover, body uses `var(--font-serif)` at 18 px with `letter-spacing: -0.005em` and `line-height: 1.35` |
| F8 | React Flow `<Handle type="target" position="left">` and `<Handle type="source" position="right">` are rendered with `isConnectable={true}` so the node accepts visual connections to/from other non-mother nodes |
| F9 | `sys text add [--text "..."] [--at x,y]` creates a TextNode and persists it to `board.json`; `sys text set <id> --text "..."` mutates `state.text`; `sys text resize <id> --w N --h N` mutates size |

---

## Non-Functional Requirements

| # | Requirement |
|---|---|
| NF1 | Typing latency is <16 ms — persistence is debounced 400 ms so each keystroke does NOT trigger a board save |
| NF2 | Click-to-edit must not fire when the user clicks a React Flow `<Handle>` or a NodeResizer handle |
| NF3 | All state mutations go through `onCommand`; the component does not write to the store directly |
| NF4 | Pure command handlers in `TextNode/commands.ts` contain no `any` types and no side effects |
| NF5 | The node round-trips: `load → save` produces byte-identical board.json (modulo `savedAt`) when no edit occurs |

---

## Use Cases

**UC-X1 — Create a text note**
Actor clicks the dock's Text button (or presses `N`). A new TextNode appears at the canvas center with placeholder visible.

**UC-X2 — Write text**
Actor clicks an empty TextNode body. A textarea appears. Actor types. After 400 ms (or blur) the text persists.

**UC-X3 — Cancel an edit**
Actor enters edit mode, types changes, then presses Escape. The text reverts to the pre-edit value.

**UC-X4 — Resize a text note**
Actor selects the node, drags the bottom-right resize handle. On release, the new size persists.

**UC-X5 — Connect a text note**
Actor drags from the right handle of a TextNode to the left handle of an ImageNode. A `link` edge is created and persisted.

**UC-X6 — Create via CLI**
Actor runs `sys text add --text "hello" --at 100,200`. A new TextNode with that text appears on the canvas.

---

## User Stories

- As a user, I want to write notes anywhere on the canvas so I can annotate my workspace.
- As a user, I want my notes to autosave so I never lose what I type.
- As a user, I want to undo an in-progress edit so I can change my mind freely.
- As a user, I want resizable notes so long passages don't truncate.
- As a user, I want to draw a visual link between a note and any other node so the relationship is explicit.
- As a user, I want CLI parity so Claude Code can add notes for me programmatically.

---

## Gherkin Scenarios (ATDD)

```gherkin
Feature: TextNode editable, resizable, connectable note

  Background:
    Given a TextNode is mounted with state { text: "" }

  Scenario: F1 — Empty state shows placeholder
    When the component renders
    Then a body element with class "text-body" is present
    And it contains the text "write..."
    And the placeholder color is var(--ink-4)

  Scenario: F2 — Click enters edit mode
    When the user clicks the ".text-body"
    Then a <textarea> is rendered in its place
    And the textarea has focus
    And the caret is at the end of the existing text

  Scenario: F3 — Debounced autosave
    Given the node is in edit mode with draft ""
    When the user types "hello"
    And 400 ms pass without further input
    Then onCommand is called once with { type: "text.setText", text: "hello" }

  Scenario: F3b — Autosave on blur
    Given the node is in edit mode with draft "draft text"
    When the textarea loses focus
    Then onCommand is called with { type: "text.setText", text: "draft text" }
    And edit mode exits

  Scenario: F4 — Escape cancels
    Given the node is in edit mode with original text "before" and draft "modified"
    When the user presses Escape
    Then the textarea unmounts
    And the body shows "before"
    And onCommand is NOT called

  Scenario: F5 — Resize dispatches text.setSize
    Given the node is selected with width 260 and height 120
    When the user resizes via NodeResizer to width 400 height 200
    Then onCommand is called with { type: "text.setSize", width: 400, height: 200 }

  Scenario: F6 — Default size when state lacks width/height
    Given the node renders with state { text: "" } and no width/height
    Then the root element computed width is 260 px
    And the root element computed min-height is at least 120 px

  Scenario: F7 — Style at rest and on hover
    When the component renders without hover
    Then the root border style is "dashed"
    When the user hovers
    Then the root border style is "solid"

  Scenario: F8 — Handles are connectable
    When the component renders
    Then a React Flow Handle with type "target" position "left" and isConnectable=true is present
    And a React Flow Handle with type "source" position "right" and isConnectable=true is present

  Scenario: F9 — sys text add creates a node
    Given an empty board
    When `sys text add --text "from cli" --at 100,200` runs
    Then board.json has a node with kind "text", state.text "from cli", position { x: 100, y: 200 }
```

---

*Last updated: 2026-05-12*
