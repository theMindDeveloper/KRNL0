# TaskNode — Component Requirements

*Phase 5 · React Flow migration · Derived from PRD v0.6.0, Decision 13, and LifeOS Whiteboard reference*

---

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | The header displays `"task · #NN L{layer}"` where NN is the task sequence number and layer is the nesting depth |
| F2 | **CONTRACT CHANGE (2026-05-12, Decision 9 Addendum):** the `+ pomo` button (`.task-pomo-btn`) now dispatches `task.startPomo` operating on the task's embedded `state.pomo` block. No separate child PomoNode is spawned. |
| F3 | A single checkbox + text row represents the task; clicking the checkbox dispatches `task.toggle` |
| F4 | When `done === true` the node root gains class `"done"` and the text gains strikethrough styling |
| F5 | The footer renders a tag pill and an ETA string (e.g., `"~45 min"`); both are derived from node data |
| F6 | An RF `<Handle type="target" position="left">` receives signals from parent nodes |
| F7 | An RF `<Handle type="source" position="right">` emits signals to downstream nodes |
| F8 | Each TaskState carries its own `pomo: { status, startedAt, durationMin, breakMin, label, sessionsCompleted, history }` block; two task nodes' pomo states are fully isolated (Decision 9 Addendum 2026-05-12). |
| F9 | The pomo button label and dispatched command vary by status: idle/done → `+ pomo` / `task.startPomo`; running → `pause` / `task.cancelPomo`; break → `skip break` / `task.skipBreak`. |
| F10 | While `state.pomo.status` is `running` or `break`, an inline `MM:SS` mini-timer (`[data-testid="task-mini-timer"]`) is rendered in the header next to the button. |
| F11 | Completing a task pomo increments `state.pomo.sessionsCompleted` and appends a `PomoSessionRecord` to `state.pomo.history`. Both persist via `board.json` and survive app restart. The footer renders the running session count via `[data-testid="task-pomo-count"]`. |

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

  Scenario: F2 — + pomo button starts the task's own pomodoro (Addendum)
    Given state.pomo.status is "idle"
    When the user clicks the ".task-pomo-btn" button
    Then onCommand is called with { type: "task.startPomo" }

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

  Scenario: F8 — Per-task pomo isolation
    Given two TaskNodes A and B
    And A.state.pomo.status is "running"
    When B's pomo state is mutated
    Then A.state.pomo is unchanged

  Scenario: F9 — Button label per status
    Given state.pomo.status is "running"
    When the component renders
    Then the ".task-pomo-btn" reads "pause"
    When clicked
    Then onCommand is called with { type: "task.cancelPomo" }

  Scenario: F10 — Mini-timer visible only while active
    Given state.pomo.status is "idle"
    When the component renders
    Then no element with [data-testid="task-mini-timer"] is present
    When state.pomo.status transitions to "running"
    Then a "[data-testid=task-mini-timer]" element renders

  Scenario: F11 — Completion persists per-task
    Given state.pomo.sessionsCompleted is 2
    When task.completePomo fires after the duration elapses
    Then state.pomo.sessionsCompleted is 3
    And state.pomo.history has one new PomoSessionRecord with completed=true
```

---

*Last updated: 2026-05-12*
