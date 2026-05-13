# TodoNode — Component Requirements

*Phase 5 · React Flow migration · Derived from PRD v0.6.0, Decision 10, Decision 13, and LifeOS Whiteboard reference*

---

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | Items are sorted at render time: undone items ascending by `createdAt`, done items below undone items |
| F2 | Each item renders a checkbox (`.todo-check`), text (`.todo-text`), and an optional tag pill (`.todo-tag`, mono uppercase, max 4 characters) |
| F3 | Clicking a checkbox dispatches `todo.toggle` with the item id; done items display strikethrough text and `color: var(--ink-4)` |
| F4 | The "add task" row at the bottom dispatches `todo.add` with the typed text on `Enter`; the `↵` keyboard hint is always visible |
| F5 | Double-clicking an item's text enters inline edit mode; blur or `Enter` dispatches `todo.edit` with the updated text |
| F6 | A "clear done" action dispatches `todo.clearDone`, removing all items where `done === true` |
| F7 | The node header shows the count of undone items as `"Todos (N)"` updating reactively |
| F8 | An RF `<Handle type="target" position="left">` is rendered for receiving edge signals |
| F9 | Right-clicking a todo row opens a context menu with three actions: "Edit text", "Delete", "Start pomo" |
| F10 | Clicking the text body of a linked, undone row dispatches `todo.startPomoForItem` with the item id; no-op if item has no linked TaskNode or if the item is done |
| F11 | "Delete" in the row context menu dispatches `todo.remove`; the dispatcher cascades to remove the linked TaskNode, all its descendants, and all referencing edges |
| F12 | `todo.clearDone` cascades — every removed done item also removes its linked TaskNode, all descendants of that TaskNode, and all referencing edges |
| F13 | `todo.toggle` mirrors done state to the linked TaskNode (if `taskNodeId !== null`); `task.toggle` mirrors done state back to the linked TodoItem (if `todoItemId !== null`) |
| F14 | Each `TodoItem` stores `taskNodeId: string \| null`; `todo.add` initialises it as `null`; `todoLinkTask` sets it atomically when the TaskNode is spawned |
| F15 | The add-task row renders a **minutes input** (3 chars wide, mono) next to the text input. It defaults to the current `pomoConfig.sessionMin` value. On `Enter` the dispatched `todo.add` carries `{ text, plannedMin }`; the spawned TaskNode is created with that `plannedMin` (and `durationMin = pomoConfig.sessionMin`). Free-form text matching `/,\s*time:\s*(\d+)/i` also extracts a `plannedMin` if the dedicated input is empty. |

---

## Non-Functional Requirements

| # | Requirement |
|---|---|
| NF1 | Node width is 320 px; item list scrolls vertically inside the node when items exceed visible area |
| NF2 | Tag pills display at most 4 characters; longer values are truncated with no tooltip required |
| NF3 | The add-task input clears after dispatch and re-focuses so successive entries require no click |
| NF4 | All state mutations go through `onCommand`; the component holds no local item state |

---

## Use Cases

**UC-T1 — Add a task**
Actor clicks the "add task" row, types text, presses Enter. New item appears at top of undone list.

**UC-T2 — Complete a task**
Actor clicks checkbox. Item moves below undone items, text gains strikethrough.

**UC-T3 — Edit a task**
Actor double-clicks item text. Inline input appears. Actor edits, presses Enter. Text updates.

**UC-T4 — Clear completed**
Actor activates "clear done". All done items are removed from the list.

**UC-T5 — Start pomo from todo row**
Actor clicks the text of an undone, linked todo row. The Pomo mother starts a session labelled with the task text and the task's `durationMin`. No-op if the item has no linked TaskNode.

**UC-T6 — Row context menu: Start pomo**
Actor right-clicks a todo row. A context menu appears. Actor selects "Start pomo" (enabled only when the row has a linked TaskNode). The Pomo mother begins a session for that task.

**UC-T7 — Row context menu: Delete with cascade**
Actor right-clicks a todo row and selects "Delete". The todo item is removed from the list, the linked TaskNode is removed from the canvas, all descendant TaskNodes are removed, and all referencing edges are removed.

**UC-T8 — Bidirectional done mirroring**
Actor toggles a todo row checkbox to done. The linked TaskNode opacity drops to 0.4 and its text gains strikethrough (done state mirrored). Conversely, toggling the TaskNode's checkbox marks the todo row done.

---

## User Stories

- As a user, I want undone tasks at the top so I see what remains without scrolling past completed work.
- As a user, I want strikethrough on done items so I feel the satisfaction of completion without losing the history.
- As a user, I want to add tasks without switching context so I can capture ideas quickly.
- As a user, I want short tags so I can categorize tasks at a glance.
- As a user, I want a "clear done" action so the list stays manageable over time.

---

## Gherkin Scenarios (ATDD)

```gherkin
Feature: TodoNode task list

  Background:
    Given a TodoNode is mounted with two undone items (createdAt T1, T2) and one done item

  Scenario: F1 — Sort order: undone first, ascending createdAt
    When the component renders
    Then the item with createdAt T1 appears before the item with createdAt T2
    And both undone items appear before the done item

  Scenario: F2 — Item anatomy
    When the component renders
    Then each item has a ".todo-check" element
    And each item has a ".todo-text" element
    And items with a tag property have a ".todo-tag" element showing the first 4 characters

  Scenario: F3 — Toggle checkbox dispatches todo.toggle
    When the user clicks the ".todo-check" of an undone item with id "abc"
    Then onCommand is called with { type: "todo.toggle", id: "abc" }
    And the item text has class "strikethrough"
    And the item text color is var(--ink-4)

  Scenario: F4 — Add task on Enter
    When the user types "buy oat milk" in the add-task input and presses Enter
    Then onCommand is called with { type: "todo.add", text: "buy oat milk" }
    And the input field is cleared and focused

  Scenario: F4b — Enter hint is always visible
    When the component renders
    Then the "↵" hint is visible in the add-task row regardless of input content

  Scenario: F5 — Inline edit on double-click
    When the user double-clicks the text of item with id "xyz"
    Then the text node becomes an editable input pre-filled with item text
    When the user changes the text to "revised text" and presses Enter
    Then onCommand is called with { type: "todo.edit", id: "xyz", text: "revised text" }

  Scenario: F6 — Clear done dispatches todo.clearDone
    Given at least one item has done === true
    When the user activates the "clear done" action
    Then onCommand is called with { type: "todo.clearDone" }

  Scenario: F7 — Header count is reactive
    Given 3 undone items and 2 done items
    When the component renders
    Then the header reads "Todos (3)"
    When one undone item is toggled to done
    Then the header updates to "Todos (2)"

  Scenario: F8 — RF target handle is rendered
    When the component renders
    Then a React Flow Handle with type "target" and position "left" is present

  Scenario: F9 — Row right-click context menu
    Given a TodoNode with one item
    When the user right-clicks the item row
    Then a context menu appears with buttons "Edit text", "Start pomo", and "Delete"
    And "Start pomo" is disabled when the item has no linked taskNodeId
    And "Start pomo" is enabled when the item has a linked taskNodeId
    And clicking "Delete" dispatches todo.remove with the item id
    And clicking "Start pomo" (when enabled) dispatches todo.startPomoForItem with the item id
    And pressing ESC dismisses the menu

  Scenario: F10 — Row body click fires todo.startPomoForItem when linked
    Given a TodoNode with a linked undone item (taskNodeId set)
    When the user clicks the ".todo-text" element of that item
    Then onCommand is called with { type: "todo.startPomoForItem", itemId: "<item-id>" }
    Given the same item is done
    When the user clicks the ".todo-text" element
    Then onCommand is NOT called with todo.startPomoForItem
    Given an unlinked item (taskNodeId is null)
    When the user clicks the ".todo-text" element
    Then onCommand is NOT called with todo.startPomoForItem

  Scenario: F11 — todo.remove cascades to linked TaskNode and descendants
    Given a board with a TodoNode, a root TaskNode, and a child TaskNode (parentTaskId = root)
    And an edge referencing the root TaskNode
    When the dispatcher handles todo.remove for the linked TodoItem
    Then the TodoItem is removed from the list
    And the root TaskNode is removed from the board
    And the child TaskNode is removed from the board
    And the referencing edge is removed from the board

  Scenario: F12 — todo.clearDone cascades all done items' TaskNodes
    Given a TodoNode with one done item (taskNodeId set) and one undone item
    When the dispatcher handles todo.clearDone
    Then the done TodoItem is removed from the list
    And the linked TaskNode for the done item is removed from the board
    And the undone item and its linked TaskNode remain

  Scenario: F13 — Bidirectional done mirroring
    Given a TodoNode item linked to a TaskNode, both done = false
    When the dispatcher handles todo.toggle for the item
    Then the linked TaskNode done becomes true
    Given the same setup with done = true
    When the dispatcher handles task.toggle for the TaskNode
    Then the linked TodoItem done becomes false

  Scenario: F14 — TodoItem taskNodeId field
    Given an empty TodoNode state
    When todoAdd is called with text "my task"
    Then the new TodoItem has taskNodeId = null
    When todoLinkTask is called with { itemId, taskNodeId: "task-abc" }
    Then the matching item has taskNodeId = "task-abc"
    And all other items are unchanged
```

---

*Last updated: 2026-05-13 — Decision 22 (minutes input on add-task row)*
