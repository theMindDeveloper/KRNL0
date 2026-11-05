# TodoNode — Component Requirements

*Phase 5 · React Flow migration · Derived from PRD v0.6.0, Decision 10, Decision 13, and LifeOS Whiteboard reference*

---

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | Items are sorted at render time: undone items ascending by `createdAt`, done items below undone items |
| F2 | Each item renders a checkbox (`.todo-check`), text (`.todo-text`), and a tag button (`.todo-tag`) showing the tag's label and colour dot, or a faint `+` when untagged (ADR 0016 — was a 4-char pill) |
| F3 | Clicking a checkbox dispatches `todo.toggle` with the item id; done items display strikethrough text and `color: var(--ink-4)` |
| F4 | The "add task" row at the bottom dispatches `todo.add` with the typed text on `Enter`; the `↵` keyboard hint is always visible |
| F5 | Double-clicking an item's text enters inline edit mode; blur or `Enter` dispatches `todo.edit` with the updated text |
| F6 | The header's "ARCHIVE DONE" action dispatches `todo.archiveDone` (ADR 0016 — it used to delete via `todo.clearDone`, which stays available as a command for scripts) |
| F7 | The node header shows the count of undone items as `"Todos (N)"` updating reactively |
| F8 | An RF `<Handle type="target" position="left">` is rendered for receiving edge signals |
| F9 | Right-clicking a todo row opens a context menu with three actions: "Edit text", "Delete", "Start pomo" |
| F10 | ~~Clicking the text body of a linked, undone row dispatches `todo.startPomoForItem`~~ — retired 2026-11-03: a single click fires on the first half of every double-click (F5 edit), so it would start a pomo each time the user renames a row. `todo.startPomoForItem` is reached from the row context menu ("Start pomo", F9) and the CLI; the row text shows a text cursor |
| F11 | "Delete" in the row context menu dispatches `todo.remove`; the dispatcher cascades to remove the linked TaskNode, all its descendants, and all referencing edges |
| F12 | `todo.clearDone` cascades — every removed done item also removes its linked TaskNode, all descendants of that TaskNode, and all referencing edges |
| F13 | `todo.toggle` mirrors done state to the linked TaskNode (if `taskNodeId !== null`); `task.toggle` mirrors done state back to the linked TodoItem (if `todoItemId !== null`) |
| F14 | Each `TodoItem` stores `taskNodeId: string \| null`; `todo.add` initialises it as `null`; `todoLinkTask` sets it atomically when the TaskNode is spawned |
| F15 | The add-task row renders a **minutes input** (3 chars wide, mono) next to the text input. It defaults to the current `pomoConfig.sessionMin` value. On `Enter` the dispatched `todo.add` carries `{ text, plannedMin }`; the spawned TaskNode is created with that `plannedMin` (and `durationMin = pomoConfig.sessionMin`). Free-form text matching `/,\s*time:\s*(\d+)/i` also extracts a `plannedMin` if the dedicated input is empty. |
| F16 | Completing an item moves it out of the open list into a collapsible **Done (N)** dropdown (collapsed by default). The header count `Todos (N)` counts open items only |
| F17 | A done item stays in Done for the rest of its completion day, then shows in a collapsible **Archive (N)** dropdown (newest first, grouped under day labels). The buckets are derived from `completedAt` and the clock, so the rollover needs no midnight job and works even if the app was closed |
| F18 | "ARCHIVE DONE" (`todo.archiveDone`) moves every done item to the Archive immediately by stamping `archivedAt` |
| F19 | Ticking an archived (or done) row's checkbox reopens it: `done = false`, `archivedAt` cleared, back in the open list |
| F20 | The Archive header's CLEAR (`todo.clearArchived`) deletes archived rows and their TaskNodes. The completion ledger is untouched, so analytics keeps the history |
| F21 | Every new item is auto-tagged by an offline classifier (`src/shared/tags/classify.ts`) into one of 11 built-in tags — Code, Study, Writing, Reading, Meetings, Admin, Planning, Health, Chores, Social, Creative — or left untagged ("Other") when nothing scores high enough. Editing the text re-classifies auto tags. Hand tags (`tagSource: 'user'`) are never overwritten. Auto tags render with a dashed border |
| F22 | Clicking a tag opens a picker (best guesses first, then all tags, then "Auto"). Picking dispatches `todo.setItemTag`. Hand-tagged items train the classifier: their words vote for their tag, and a near-duplicate follows its example. Other open auto-tagged items are re-classified immediately |
| F23 | Users can create custom tags by typing a new name in the picker (or `todo.addTag`), optionally with keywords. Custom tags can be removed (`todo.removeTag`). Built-ins cannot |
| F24 | Every completion-ledger entry records the tag the task was completed under (`CompletionRecord.tag`). Re-tagging a done item updates its entry. The Analytics node's **Time** view shows minutes by tag (pomo-tracked minutes, else planned): a donut, a ranked list and a stacked bar per day |
| F25 | CLI parity: `todo list [--done\|--archived\|--all]`, `todo tag <ref> <tag\|auto>`, `todo tags [list\|add\|remove]`, `todo archive`, `todo clear-archive`, `analytics show --view tags` |
| F26 | **Adding a task creates no edge** (#205). `todo.add` (UI), `krnl todo add` and `krnl task add` spawn the TaskNode unchained, so a new task is never pushed after the previous one on the Calendar. The user chains tasks by hand: TaskNode "Add next task", `krnl task chain <a> <b> …`, `krnl task addNext`, `krnl edge add` |
| F27 | **Estimate on the row** (#207): one readable figure — "30m", or "⏱ 1h20 / 30m" once time is tracked (rust when over); the work/break/total breakdown is in the tooltip. Clicking it edits the estimate (also in the row menu). **0 = no set time**: the task becomes open-ended (Calendar/Clock draw it fading out), the row reads "open". CLI: `krnl task duration <ref> 0`. |

---

## Non-Functional Requirements

| # | Requirement |
|---|---|
| NF1 | Node width is 320 px; item list scrolls vertically inside the node when items exceed visible area |
| NF2 | Tag buttons are at most 84 px wide; longer labels ellipsize and the full label is in the tooltip |
| NF3 | The add-task input clears after dispatch and re-focuses so successive entries require no click |
| NF4 | All state mutations go through `onCommand`; the component holds no local item state |
| NF5 | Classification is deterministic, local and dependency-free (no model call). It runs on add, edit and re-tag, never on render |

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

**UC-T9 — Done, then archived (ADR 0016)**
Actor ticks a task. It leaves the open list and the "Done (N)" count goes up. The next day the item appears under "Archive", labelled with the day it was finished. Ticking it there reopens it.

**UC-T10 — Correct a tag (ADR 0016)**
Actor sees "Krnl0 sprint review" auto-tagged Meetings, clicks the pill and picks Study. The pill turns solid, and other open "Krnl0 sprint …" items switch to Study.

**UC-T11 — See where the time went (ADR 0016)**
Actor opens Analytics → Time and sees completed minutes split by tag for the selected range.

---

## User Stories

- As a user, I want undone tasks at the top so I see what remains without scrolling past completed work.
- As a user, I want strikethrough on done items so I feel the satisfaction of completion without losing the history.
- As a user, I want to add tasks without switching context so I can capture ideas quickly.
- As a user, I want short tags so I can categorize tasks at a glance.
- As a user, I want a "clear done" action so the list stays manageable over time.
- As a user, I want finished tasks to wait in a Done dropdown for the rest of the day, then move to an archive, so I see today's wins without the list filling up.
- As a user, I want my tasks tagged automatically, and I want to fix a wrong tag in one click so it learns, so I can see where my time goes without filling in forms.
- As a user, I want my own tags next to the built-in ones, so the categories fit my life.

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

  Scenario: F16 — Completing moves an item into the Done dropdown
    Given an open item "Email"
    When the user ticks it
    Then it is no longer in the open list
    And the "Done (1)" toggle is shown collapsed
    When the user expands Done
    Then "Email" is listed there with strikethrough

  Scenario: F17 — Done rolls into Archive after the day ends
    Given an item completed today
    When the clock passes midnight
    Then the item is listed under "Archive" with yesterday's day label

  Scenario: F18 — Archive now
    Given two done items
    When the user clicks "ARCHIVE DONE"
    Then onCommand is called with "todo.archiveDone"
    And both items have archivedAt set

  Scenario: F19 — Restore from archive
    Given an archived item
    When the user ticks its checkbox
    Then the item is open again and archivedAt is cleared

  Scenario: F20 — Clear archive keeps analytics
    Given an archived, completed task
    When todo.clearArchived is dispatched
    Then the row and its TaskNode are removed
    And its completion-ledger entry remains

  Scenario: F21 — Auto tag
    When todoAdd is called with text "Fix login bug"
    Then the item has tag "code" and tagSource "auto"
    When todoAdd is called with text "zxqv"
    Then the item has no tag

  Scenario: F22 — A correction teaches the classifier
    Given open auto-tagged items "krnl0 sprint review" and "krnl0 sprint planning poker"
    When the user tags "krnl0 sprint review" as Study
    Then "krnl0 sprint planning poker" is re-tagged Study automatically

  Scenario: F23 — Custom tag from the picker
    When the user types "Gaming" in the tag picker and chooses Create
    Then onCommand is called with "todo.setItemTag" { tag: "Gaming" }
    And the list's tagLibrary contains { id: "gaming", label: "Gaming" }

  Scenario: F24 — Time by tag
    Given "Fix login bug" and "Gym" were completed today
    When analytics show --view tags runs
    Then the result has one Code slice and one Health slice

  Scenario: F25 — CLI parity
    When the user runs "todo tag <ref> Planning"
    Then the item has tag "planning" and tagSource "user"
    When the user runs "todo tag <ref> auto"
    Then the item is auto-classified again

  Scenario: F26 — adding tasks never chains them
    Given the todo list has the task "task 1"
    When the user adds "task 2" (from the Todo row, "todo add" or "task add")
    Then the board has no task.next edge from "task 1" to "task 2"
    When the user runs "task chain <task 1> <task 2>"
    Then "task 2" follows "task 1"
```

---

*Last updated: 2026-11-02 — ADR 0016 (Done/Archive lifecycle, task tags, time by tag)*
