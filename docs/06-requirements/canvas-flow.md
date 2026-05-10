# CanvasFlow — Component Requirements

*Phase 5 · React Flow migration · Derived from PRD v0.6.0, Decision 7, Decision 13, and LifeOS Whiteboard reference*

---

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | `CanvasFlow.tsx` renders `<ReactFlow>` in controlled mode: `nodes` and `edges` are derived from `boardStore` via `toRfNode` and `toRfEdge` adapters |
| F2 | `nodeTypes` map is defined as `{ pomo, todo, habit, term, 'pomo.session', 'todo.task', 'habit.day' }` with each value being a `createNodeAdapter`-wrapped component |
| F3 | `onNodesChange` applies RF `NodeChange` events to `boardStore` (position, selection, removal); mother nodes with `isMother: true` are excluded from removal and position changes |
| F4 | `onEdgesChange` applies RF `EdgeChange` events to `boardStore` (add, remove, selection) |
| F5 | `onMove` (viewport pan/zoom) calls `boardStore.setViewport` debounced at 500 ms with the new `{ x, y, zoom }` in screen-space translate-then-scale order |
| F6 | `<Background variant="dots">` is rendered as the canvas background |
| F7 | `<MiniMap>` is rendered at bottom-right; node colors are keyed by kind: `pomo → var(--rust)`, `todo → var(--acid)`, `habit → var(--spine)`, `term → var(--acid)` |
| F8 | `<Controls>` is rendered at bottom-right alongside the MiniMap |
| F9 | `onSelectionChange` forwards selected node and edge ids to `boardStore.setSelection` |
| F10 | Task-flow edges use custom `edgeTypes` entry rendering cyan stroke `var(--color-cyan)`, `strokeDasharray: '14 8'`, animated marching-ants via `task-flow-march` keyframe |

---

## Non-Functional Requirements

| # | Requirement |
|---|---|
| NF1 | `boardStore` is the single source of truth; RF never writes back to the store except through the `onNodesChange`/`onEdgesChange`/`onMove`/`onSelectionChange` callbacks |
| NF2 | `toRfNode` and `toRfEdge` are pure functions with no side effects; they are memoized with `useMemo` keyed on the store nodes/edges arrays |
| NF3 | The legacy `Canvas/index.tsx` file is deleted after `CanvasFlow.tsx` is confirmed working; no dual-canvas state exists |
| NF4 | The RF `fitView` option is set to `false`; viewport is restored from `boardStore.viewport` on mount |

---

## Use Cases

**UC-C1 — Drag a node**
Actor drags a non-mother node. RF fires `NodeChange` of type `position`. `onNodesChange` forwards the new position to `boardStore`. Node persists at new position after restart (R9).

**UC-C2 — Pan and zoom**
Actor pans the canvas. RF fires `onMove`. After 500 ms debounce, `boardStore.setViewport` is called. Viewport persists after restart.

**UC-C3 — Wire two nodes**
Actor drags from a source handle to a target handle. RF fires `onConnect`. `boardStore` creates the edge. A task-flow edge renders with marching-ants animation.

**UC-C4 — View minimap**
Actor sees the minimap at bottom-right. Node colors match their kind. Actor clicks a minimap region to pan the viewport.

---

## User Stories

- As a user, I want to drag nodes freely so I can arrange my workspace to match my mental model.
- As a user, I want mother nodes to stay fixed so the board's spine remains stable.
- As a user, I want the minimap so I can orient myself on large boards without zooming out.
- As a developer, I want `boardStore` to be the single source of truth so I never have to reconcile two state systems.

---

## Gherkin Scenarios (ATDD)

```gherkin
Feature: CanvasFlow React Flow integration

  Background:
    Given boardStore contains 2 mother nodes and 1 free PomoNode and 1 task-flow edge

  Scenario: F1 — Controlled mode from boardStore
    When CanvasFlow renders
    Then the RF nodes prop contains exactly 3 entries derived via toRfNode
    And the RF edges prop contains exactly 1 entry derived via toRfEdge

  Scenario: F2 — nodeTypes map completeness
    When CanvasFlow renders
    Then the nodeTypes map contains keys: "pomo", "todo", "habit", "term", "pomo.session", "todo.task", "habit.day"

  Scenario: F3 — Non-mother node position change updates boardStore
    When RF fires a NodeChange of type "position" for the free PomoNode with new coordinates { x: 100, y: 200 }
    Then boardStore.updateNode is called with { id: pomoNodeId, x: 100, y: 200 }

  Scenario: F3b — Mother node ignores position change
    When RF fires a NodeChange of type "position" for a mother node
    Then boardStore.updateNode is NOT called for that node

  Scenario: F4 — Edge removal updates boardStore
    When RF fires an EdgeChange of type "remove" for the task-flow edge
    Then boardStore.removeEdge is called with the edge id

  Scenario: F5 — Viewport persisted with debounce
    When the user pans the canvas triggering onMove with { x: 50, y: -20, zoom: 0.8 }
    Then boardStore.setViewport is NOT called immediately
    And after 500ms boardStore.setViewport is called with { x: 50, y: -20, zoom: 0.8 }

  Scenario: F6 — Background dots rendered
    When CanvasFlow renders
    Then a <Background> component with variant "dots" is present in the tree

  Scenario: F7 — MiniMap node colors
    When the MiniMap renders
    Then pomo-kind nodes are colored var(--rust)
    And todo-kind nodes are colored var(--acid)
    And habit-kind nodes are colored var(--spine)
    And term-kind nodes are colored var(--acid)

  Scenario: F8 — Controls rendered
    When CanvasFlow renders
    Then a <Controls> component is present in the tree

  Scenario: F9 — Selection forwarded to boardStore
    When the user selects the free PomoNode
    Then boardStore.setSelection is called with { nodeIds: [pomoNodeId], edgeIds: [] }

  Scenario: F10 — Task-flow edge visual style
    When a task-flow edge renders
    Then its stroke color is var(--color-cyan)
    And its strokeDasharray is "14 8"
    And it has the "task-flow-march" CSS animation applied
```

---

*Last updated: 2026-05-10*
