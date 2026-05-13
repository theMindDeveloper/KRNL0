# TaskNode — Component Requirements

*Phase 5 · React Flow migration · Derived from PRD v0.6.0, Decision 13, and LifeOS Whiteboard reference*

---

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | The header displays `"task · #NN L{layer}"` where NN is the task sequence number and layer is the nesting depth |
| F2 | A `+ pomo` button (`.task-pomo-btn`) in the header dispatches a command to spawn a child PomoNode linked to this task |
| F3 | A single checkbox + text row represents the task; clicking the checkbox dispatches `task.toggle` |
| F4 | When `done === true` the node root gains class `"done"` and the text gains strikethrough styling |
| F5 | The footer renders a tag pill and an ETA string (e.g., `"~45 min"`); both are derived from node data |
| F6 | An RF `<Handle type="target" position="left">` receives signals from parent nodes |
| F7 | An RF `<Handle type="source" position="right">` emits signals to downstream nodes |
| F8 | When `done === true`, the node root's opacity is `0.4` (in addition to the existing strikethrough); cursor is `default` to signal non-interactivity |
| F9 | Clicking the node body (not the checkbox, not the `+ pomo` button) dispatches `task.startPomo`; the dispatcher finds the single `kind === 'pomo'` mother and calls `pomoStart` with `{ label: task.text, minutes: task.durationMin }`; no-op if Pomo mother is absent; drag-safe (only fires if mouseup delta < 4 px) |
| F10 | Right-clicking the node opens a context menu with three actions: "Edit text", "Add subtask" (disabled when done), "Delete" (danger colour `var(--rust)`) |
| F11 | "Add subtask" in the context menu shows an inline `subtask…` input; pressing Enter dispatches `task.addSubtask` with the typed text, spawning a child TaskNode with `layer = parent.layer + 1`, `parentTaskId = parent.id`, and a `task.next → task.activate` chain edge |
| F12 | "Delete" in the context menu dispatches `task.delete`; the dispatcher BFS-collects the node and all descendants (via `parentTaskId` chain), removes them all plus incident edges, removes the linked `TodoItem` (if `todoItemId !== null`), then renumbers siblings |
| F13 | `TaskState` gains three persisted fields: `parentTaskId: string \| null` (null = root task), `todoItemId: string \| null` (back-link to spawning TodoItem), and `pomoSessionsCompleted: number` (default 0); these are backfilled on older `board.json` nodes at load time |
| F14 | `TaskState` gains two more persisted fields (Decision 22): `plannedMin: number` (minutes budgeted for this task; default = `pomoConfig.sessionMin` at creation), and `secondsAccumulated: number` (total seconds spent across all pomo sessions for this task; default 0). Both backfill on older boards via `STATE_DEFAULTS['todo.task']`. |
| F15 | When the pomo mother's `state.activeTaskId === thisTaskId`, the node root gains class `"active"` which renders a 2px acid-coloured ring (`box-shadow: 0 0 0 2px var(--acid), 0 0 24px rgba(201,241,88,0.45)`). |
| F16 | A **corner timer** in the top-left of the body shows the time spent on this task. Value is `secondsAccumulated + (pomo.status === 'running' && pomo.activeTaskId === thisTaskId ? (now - pomo.startedAt) / 1000 : 0)`, formatted as `H:MM:SS` (or `MM:SS` when under 1h). The component subscribes to a single 500ms `setInterval` only when this task is the active running task; otherwise the displayed value is static. |
| F17 | Clicking the task body sets the pomo's `activeTaskId` to this task and immediately starts a session (existing `task.startPomo` flow, now atomic with activation per Decision 22 §5). If another task was the active running task at the moment of the click, the dispatcher commits its elapsed time to its `secondsAccumulated` and records a cancelled history entry before switching. (Superseded by F18 — Decision 22.1) |
| F18 | Clicking the task body dispatches `task.loadIntoPomo` (no auto-start). The pomo FSM goes to `paused` with the task's `currentSessionElapsedSec` as `pausedElapsedMs` if non-zero, else `idle`. The `+ pomo` header button continues to dispatch `task.spawnPomo` for explicit auto-start. (Supersedes F17 — Decision 22.1) |
| F19 | Double-clicking the ETA badge in the footer enters inline edit mode (numeric input, pre-filled with current `plannedMin`); Enter dispatches `task.setPlannedMin` with the parsed minutes; ESC cancels with no dispatch. |
| F20 | `TaskState` gains `currentSessionElapsedSec: number` (Decision 22.1). Default 0. Backfilled by `STATE_DEFAULTS['todo.task']`. Written when a task is swapped out of the active slot; cleared on `pomo.cancel` / `pomo.complete` after the final commit to `secondsAccumulated`. |

---

## Non-Functional Requirements

| # | Requirement |
|---|---|
| NF1 | Node width is 220 px fixed |
| NF2 | The node is draggable (not a mother node); `draggable: true` in RF |
| NF3 | The `+ pomo` button is visible only when the task is not done |
| NF4 | Layer depth 0 means the task is a direct child of a mother node; each nesting level increments by 1 |

---

## Use Cases

**UC-K1 — Spawn a child Pomodoro**
Actor sees a task node on the canvas. Actor clicks `+ pomo`. A new PomoNode child is created and an edge is drawn from the PomoNode source handle to this task's target handle.

**UC-K2 — Complete a task**
Actor clicks the task checkbox. Node gains `done` class. Downstream edges may trigger (R5).

**UC-K3 — Read task metadata**
Actor reads the footer tag and ETA to understand task category and time estimate at a glance.

**UC-K4 — Start pomo by clicking task body**
Actor clicks the body of an undone TaskNode (not the checkbox or button). The Pomo mother begins a session labelled with the task text and using the task's `durationMin`. If the task is already done the click is a no-op.

**UC-K5 — Task right-click context menu**
Actor right-clicks a TaskNode. A context menu appears at the cursor with "Edit text", "Add subtask" (greyed-out when done), and "Delete" (styled in danger colour). Pressing ESC or clicking outside dismisses the menu.

**UC-K6 — Edit task text inline**
Actor selects "Edit text" from the context menu (or double-clicks the task text when not done). An inline input appears pre-filled with the current text. Actor edits and presses Enter — `task.edit` is dispatched with the new text. ESC cancels with no dispatch.

**UC-K7 — Add subtask**
Actor right-clicks a TaskNode and selects "Add subtask". A `subtask…` input appears below the footer. Actor types the subtask text and presses Enter. A child TaskNode is spawned with `layer = parent.layer + 1` and a `task.next → task.activate` edge connects parent to child.

**UC-K8 — Delete task with cascade**
Actor right-clicks a TaskNode and selects "Delete". The TaskNode, all descendant TaskNodes (BFS), all incident edges, and the linked TodoItem (if any) are removed from the board in a single store transaction. Remaining sibling tasks are renumbered.

---

## User Stories

- As a user, I want the header to identify the task number and layer so I can navigate nested plans visually.
- As a user, I want a `+ pomo` shortcut directly on the task so I can start timing without switching context.
- As a user, I want the done state visually prominent so I can see at a glance which tasks are finished.
- As a user, I want the ETA visible in the footer so I can make scheduling decisions without opening a detail pane.

---

## Gherkin Scenarios (ATDD)

```gherkin
Feature: TaskNode display and interaction

  Background:
    Given a TaskNode is mounted with sequenceNumber 3, layer 1, tag "deep", eta "~45 min", done false

  Scenario: F1 — Header format
    When the component renders
    Then the header text is "task · #3 L1"

  Scenario: F2 — + pomo button spawns child
    When the user clicks the ".task-pomo-btn" button
    Then onCommand is called with { type: "task.spawnPomo" }

  Scenario: F3 — Checkbox dispatches task.toggle
    When the user clicks the task checkbox
    Then onCommand is called with { type: "task.toggle" }

  Scenario: F4 — Done state styling
    Given done is true
    When the component renders
    Then the node root has class "done"
    And the task text has strikethrough styling

  Scenario: F4b — Done state hides + pomo button
    Given done is true
    When the component renders
    Then the ".task-pomo-btn" element is not present

  Scenario: F5 — Footer tag and ETA
    When the component renders
    Then the footer contains a tag pill reading "deep"
    And the footer contains the ETA string "~45 min"

  Scenario: F6 — RF target handle rendered
    When the component renders
    Then a React Flow Handle with type "target" and position "left" is present

  Scenario: F7 — RF source handle rendered
    When the component renders
    Then a React Flow Handle with type "source" and position "right" is present

  Scenario: F8 — Done card opacity
    Given done is true
    When the component renders
    Then the node root's opacity style is "0.4"
    And the node root's cursor style is "default"
    Given done is false
    When the component renders
    Then the node root's opacity style is "1"
    And the node root's cursor style is "pointer"

  Scenario: F9 — Body click fires task.startPomo (drag-safe)
    Given done is false
    When the user performs a clean click (mousedown and click at same coordinates) on the node root
    Then onCommand is called with { type: "task.startPomo" }
    Given the user performs a drag (mousedown at (0,0), click at (10,0))
    Then onCommand is NOT called with task.startPomo
    Given done is true
    When the user clicks the node root
    Then onCommand is NOT called with task.startPomo
    When the user clicks the checkbox
    Then onCommand is called with task.toggle but NOT with task.startPomo

  Scenario: F10 — Right-click opens context menu
    When the user right-clicks the node root
    Then a context menu appears with buttons "Edit text", "Add subtask", and "Delete"
    And "Delete" has color var(--rust)
    And "Add subtask" is disabled when done = true
    And "Add subtask" is enabled when done = false
    And pressing ESC dismisses the menu

  Scenario: F11 — Add subtask inline input
    When the user right-clicks and selects "Add subtask"
    Then an input with placeholder "subtask…" appears
    When the user types "child work" and presses Enter
    Then onCommand is called with { type: "task.addSubtask", text: "child work" }
    When the user types text and presses ESC
    Then onCommand is NOT called with task.addSubtask
    And the subtask input disappears

  Scenario: F12 — Delete cascades via dispatcher
    Given a board with a root TaskNode and a child TaskNode (parentTaskId = root) and a linked TodoItem
    When the dispatcher handles task.delete for the root
    Then the root TaskNode is removed from the board
    And the child TaskNode is removed from the board
    And all incident edges are removed
    And the linked TodoItem is removed from the TodoNode
    And remaining sibling TaskNodes are renumbered

  Scenario: F13 — Persisted state fields
    Given a TaskState without parentTaskId / todoItemId / pomoSessionsCompleted
    When the board is loaded
    Then parentTaskId defaults to null
    And todoItemId defaults to null
    And pomoSessionsCompleted defaults to 0
    Given a new TaskState
    Then parentTaskId, todoItemId, and pomoSessionsCompleted are present and persisted in board.json
```

---

*Last updated: 2026-05-13 — Decision 22.1 (load-without-start, ETA inline edit, currentSessionElapsedSec)*
