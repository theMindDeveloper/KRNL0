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
```

---

*Last updated: 2026-05-10*
