# ADR 0008 — Station Mode: a switchable fixed-panel layout that reuses the existing dock chrome

**Status**: Proposed (2026-05-18)
**Branch**: `feat/station-mode`
**PR**: TBD
**Issue / Spec**: PRD `docs/02-prd/PRD-station-mode.md`
**Supersedes**: nothing (additive).
**Extends**: ADR 0006 (LifeOS UI refresh), Decision 13 (anchored mother nodes), the existing dock-style system in `src/renderer/components/ChassisLayer/` (variants: `classic | synthesizer | telemetry | krnl-dock`), `docs/06-requirements/app-chrome.md` (F1–F9).

> Naming note. The word **dock** in KRNL0 already refers to the decorative chrome that wraps the mother row in the infinite canvas — the synth/telemetry/krnl-dock variants chosen via `useDockStyle()` and applied through `<html data-dock="…">`. This ADR does **not** introduce a "dock mode." It introduces **Station Mode**: a new *layout* in which the mother nodes occupy fixed, resizable panels — and the existing dock chrome still wraps them, exactly as it does in Canvas Mode. An earlier draft of this ADR used the word "dock" for the layout; that was a misnomer and has been corrected.

---

## 1. Why this exists

Repeated tester feedback:

> "I open the app and see this floaty thing. The important nodes are just stuck on the canvas."

The current layout (Decision 13 + `ChassisLayer`) anchors Pomo, Todo, Habit, Term, Calendar, Clock at fixed world coordinates on the infinite canvas and wraps them in a dock-chrome variant. They are *positionally* fixed but *spatially* part of the canvas: they pan with it, share its zoom, and a user who pans away loses them off-screen. The gestalt reads as "scratchpad with stuck stickies" rather than "application with a built-in dashboard plus a free workspace."

The fix is not visual — the dock chrome (synth/telemetry/krnl-dock) already gives the mother row a strong application-chrome look. The fix is *layout*: pull the mother row off the infinite canvas, place it in fixed screen-anchored, resizable panels, and re-mount the infinite canvas as one widget inside the layout. The same six mothers, the same dock chrome, the same store — only the container hierarchy differs.

## 2. What we are building

### 2.1 Two layout modes (per board)

```ts
// src/renderer/store/boardStore.ts
export type LayoutMode = 'canvas' | 'station';

interface BoardState {
  // ... existing fields
  layoutMode: LayoutMode;             // default 'canvas' for existing boards; 'station' for new boards
  setLayoutMode(mode: LayoutMode): void;
}
```

- `'canvas'` — current behaviour. React Flow fills the viewport; mother nodes are RF nodes at their seeded x-positions (`pomo:-1400, todo:-840, habit:-280, term:280, calendar:840, clock:1400`, all at y=0); `ChassisLayer` decorates them via `ViewportPortal` in RF flow-space.
- `'station'` — new layout. A CSS-grid station shell occupies the viewport; mother nodes mount in resizable grid cells outside React Flow; the React Flow surface mounts inside one of the cells as a fully-functional embedded canvas; `ChassisLayer` decorates the mother row in screen-space (no `ViewportPortal`).

Mode is persisted to `board.json` per board. The dock-chrome variant (`classic | synthesizer | telemetry | krnl-dock`) is **orthogonal**: the same variant choice applies to both modes (it's a global user preference today, and remains so — see § 4.3).

### 2.2 Visual style is shared

The visual appearance of every mother node — Pomo timer, Calendar week grid, Clock arcs, Todo rows, Habit pip grid, Term scroll — is identical in both modes. The `MotherFrame` chassis renders the same content. The dock chrome (synth/telemetry/krnl-dock) renders the same decorations. The only thing that differs is where the chassis is mounted and how it is sized.

**No new CSS file is created for Station Mode.** Any visual refresh discovered while implementing Station Mode lands in shared component files and applies to both modes simultaneously.

### 2.3 The station shell

```
┌─────────────────── TOPBAR (existing) ────────────────────────┐
│ KRNL0  ∷ ~/krnl0 / boards / deep-work · ◆ live   [◳ STATION │ ◰ CANVAS]  FIT  ☾DARK  TWEAKS  SHARE │
├──────────┬──────────┬──────────┬──────────────────────────────┤
│          │          │          │                              │
│  POMO    │  TODO    │  HABIT   │  CALENDAR  (top-right-upper) │
│ (chassis)│ (chassis)│ (chassis)│  (chassis)                   │
│          │          │          ├──────────────────────────────┤
│          │          │          │                              │
│          │          │          │  CLOCK     (top-right-lower) │
│          │          │          │  (chassis)                   │
├──────────┴──────────┴──────────┴──────────────────────────────┤
│ ◀━━━━━━━━━ horizontal splitter (resizable) ━━━━━━━━━━━━━━━━ ▶│
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  CANVAS WINDOW  — embedded React Flow                         │
│  ┌─ canvas-toolbar: ＋text  ＋image  ＋frame  ⌖ fit  − +─┐ │
│  │ [task nodes, habit lanes, frame groups, wires, …]        │ │
│  │  pan / zoom / drop / drag — all canvas features intact   │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
├──────────────────── DOCK CHROME STRIP ────────────────────────┤
│  (rendered by ChassisLayer when dockStyle ≠ 'classic')        │
│  synth: knob rail · telemetry: instrument cells · krnl-dock:  │
│  rack rails wrap the mother panels in screen-space            │
├──────────────────── STATUSBAR (existing) ─────────────────────┤
│  6 nodes · 4 edges · deep-work   [system log strip]           │
└───────────────────────────────────────────────────────────────┘
```

Every divider between cells is a resizable splitter. Drag to resize, double-click to reset to default proportions. Persist the user's resize state per-board in `board.json` under `layoutGeometry.station`.

### 2.4 Resizable panels (VS Code-style)

Splitters between every pair of adjacent cells:

- Vertical splitters between Pomo / Todo / Habit / Calendar columns (resize column widths).
- Horizontal splitter inside the right column between Calendar (upper) and Clock (lower).
- Horizontal splitter between the mother row and the canvas window (resize how much vertical space the row gets).

Implementation candidate: **`react-resizable-panels`** (small, accessible, persistence-friendly, keyboard-resizable). Architect to confirm in § 9. We do not roll our own splitter system in v1.

State stored as `{ rowFraction: number; columnFractions: number[]; rightColumnSplit: number }`. Defaults if absent: row 0.32, columns `[0.22, 0.30, 0.22, 0.26]`, right-column-split 0.55.

### 2.5 The embedded canvas is a real canvas

The Station-mode canvas window is the same React Flow instance the app uses today, mounted inside a sized grid cell instead of the window. Concretely: there is one `<ReactFlowProvider>` at the App root (today — see `src/renderer/App.tsx:13`); in Station Mode, the `<ReactFlow>` element renders inside the station's canvas cell rather than at the viewport root.

All canvas features must remain functional inside the embedded canvas:

- Pan (drag), zoom (wheel / pinch), fit (FIT button), MiniMap, Controls.
- Add a text node, image node, frame node via the existing left dock (F3/F4 in `docs/06-requirements/app-chrome.md`).
- Drop child nodes (tasks, habit lanes, frame groups), wire edges between them, run the assistant orb inside it.
- Mother nodes do **not** appear inside the canvas in Station Mode — they live in the station cells. Child nodes do, exactly as in Canvas Mode.

The left tool dock (select/text/image/connect) and the assistant orb are dock-chrome elements; they continue to render against the canvas window in Station Mode (because their job is "add a thing to the canvas").

### 2.6 ChassisLayer in Station Mode

Today, `ChassisLayer` decorates the mother row by mounting itself inside `<ViewportPortal>` so it shares RF's transform — when the user pans/zooms, the chassis follows.

In Station Mode the mother row is not inside RF, so `<ViewportPortal>` is the wrong vehicle. We add a screen-space rendering path:

```tsx
// src/renderer/components/ChassisLayer/index.tsx (refactor)
function ChassisLayer() {
  const layoutMode = useBoardStore(s => s.layoutMode);
  const dockStyle = useDockStyle();
  if (dockStyle === 'classic') return null;
  if (layoutMode === 'canvas') return <CanvasChassis style={dockStyle} />;     // current behaviour, ViewportPortal-anchored
  return <StationChassis style={dockStyle} />;                                   // new path, screen-anchored
}
```

`StationChassis` reads the station's geometry (column boundaries, row fraction) from `boardStore.layoutGeometry.station` so the synth rail / telemetry instruments / krnl-dock rails align with the actual mother cells after the user resizes them. The decorative content (knobs, lights, log strip, gauges) is unchanged — only the positioning math differs.

### 2.7 Mother nodes in Station Mode

In Canvas Mode, a mother node is a React Flow node (`type: 'pomo' | 'todo' | ...`) registered in `nodeTypes`, rendered by RF inside its viewport.

In Station Mode, a mother node is a plain React component that reads from the same `boardStore` (via `useBoardStore`) and dispatches the same commands. No second store, no shadow node list — `boardStore.nodes` remains the source of truth.

**One generic `StationCell` wrapper handles all six (and future) mother kinds.** Decision #8's `NodeProps<TState, TConfig>` is RF-independent: the mother components themselves never see `xPos`, `yPos`, `dragging`, or any RF-specific prop (verified — see `src/renderer/components/nodes/PomoNode/index.tsx:60`, `TodoNode/index.tsx:17`, `TerminalNode/index.tsx:12`). The bridge to RF is `createNodeAdapter` in `rfAdapters.tsx`; in station mode there is no bridge — `StationCell` builds the same `NodeProps` context directly:

```tsx
// src/renderer/components/Station/StationCell.tsx (single generic wrapper)
export function StationCell({ slot }: { slot: StationSlot }) {
  const node = useBoardStore(s =>
    s.board?.nodes.find(n => n.isMother && resolveStationSlot(n) === slot) ?? null
  );
  const dispatch = useBoardStore(s => s.dispatch);   // same dispatch CanvasFlow uses
  const selectNode = useBoardStore(s => s.selectNode);
  if (!node) return null;
  const Component = NODE_REGISTRY[node.kind];
  return (
    <Component
      node={node}
      selected={false}
      onCommand={(cmd, args) => dispatch({ nodeId: node.id, command: cmd, args })}
      onSelect={() => selectNode(node.id)}
      slotIndex={SLOT_INDEX[slot]}
      slotTotal={MOTHER_TOTAL}
    />
  );
}
```

`MotherFrame` accepts `variant?: 'canvas' | 'station'`. In `'station'`:
- **Skip the entire `useLayoutEffect` rfToScreen badge tracker** (lines 74–104 of `MotherFrame/index.tsx`). The badge tracker exists to escape `.react-flow { overflow: hidden }`; in station the panel is not RF-clipped.
- Render the badge as a normal absolute-positioned span inside the panel (no portal, no `rfToScreen`).
- Keep the corner brackets (they're decorative, unrelated to RF).

That is the only branch added inside `MotherFrame` — one `if (variant === 'station')` guard around the badge tracking effect and badge JSX. The mother *content* is identical.

### 2.8 Many static nodes, not just six

The current mother row contains six nodes. Station Mode formalises the long-running drift toward "more single-instance dashboard widgets": Analytics, Ambient, KRNL header frame, Assistant. In Station Mode v1 these remain on the canvas (as today). v1.1 may promote any of them to station cells if user feedback wants them. The station-cell slot system is extensible (named slots in a schema), so promotion is a one-line config change per node.

### 2.9 Theming

Dark/light theming is a global toggle today, persisted via `localStorage["krnl0-theme"]` and applied as `<html data-theme="dark|light">`. The tokens in `src/renderer/styles/tokens.css` flip `--paper` / `--ink` based on that attribute; signal tokens (`--acid`, `--rust`, etc.) are theme-invariant.

Station Mode does not touch the theming system. The same toggle applies; the same tokens are read by the same components. The only sanity check we owe is that the station shell's own CSS (grid backgrounds, splitter handles, panel borders) reads from theme tokens, not from hardcoded colours.

## 3. Why this shape

### 3.1 Why per-board mode and not global

Global toggle would silently re-arrange every board on flip; punishes power users who hand-placed mothers in Canvas Mode. Per-board mode is opt-in per workspace.

### 3.2 Why reuse ChassisLayer instead of building a "station chrome"

The user has a strong attachment to the synth/telemetry/krnl-dock chrome. Building a separate "station chrome" would either duplicate that work (two systems to maintain) or replace it (regression for users who love their krnl-dock look). Reusing ChassisLayer means one chrome system, one mental model, one place to update when the user wants a new variant.

### 3.3 Why CSS grid + `react-resizable-panels` and not pure CSS

CSS-only resizing requires `resize: both` on individual elements, which doesn't compose into a grid where every divider is draggable. A small library that knows about panel groups, persistence, and keyboard a11y is worth the dep. Architect to confirm the choice in § 9.

### 3.4 Why one RF instance, not two

Two RF instances would mean two stores or a fragile sync layer. The single instance approach lets us toggle modes without unmounting nodes — the RF tree is preserved, only its host element changes. There may be a one-frame remount as React reconciles the new parent, which is acceptable.

### 3.5 Why visual style is shared and not "station gets a different look"

The visual style differences in the prototype (clock arc style, calendar grid look) were illustrative, not intentional. The user explicitly called out that style must be shared. If we ship Station Mode with a different look, we've created two design languages to maintain — and the next visual update has to be done twice. Bad deal.

## 4. Persistence rules

### 4.1 New fields on `board.json`

```ts
interface BoardFile {
  // existing fields
  schemaVersion: 2;                         // bumped from 1 — see migration notes
  layoutMode: 'canvas' | 'station';        // default 'canvas' for legacy, 'station' for new
  layoutGeometry?: {
    station?: {
      rowFraction: number;                  // [0..1] mother-row height as fraction of viewport
      columnFractions: number[];            // length matches station column count
      rightColumnSplit: number;             // [0..1] split between calendar and clock cells
    };
  };
}
```

**`schemaVersion` bump rule.** Old boards arrive with `schemaVersion === 1` (or undefined). The load-time migration sets it to `2` in memory and writes `2` on the next save (forward-only). An old app reading a `schemaVersion: 2` board ignores the unknown fields — no break.

### 4.2 Mother node position fields

Existing `node.position` (x, y) is preserved unchanged. It is the source of truth for Canvas Mode placement. Station Mode does not write to it — station cells are determined by the station shell's slot binding.

```ts
interface MotherNodeConfig {
  isMother: boolean;
  stationSlot?:
    | 'top-left' | 'top-center' | 'top-right-upper' | 'top-right-lower'
    | 'bottom-strip';                       // term goes here
}
```

Backfilled by migration: pomo → `top-left`, todo → `top-center`, habit → `top-right-upper`, calendar → `top-right-upper` (with conflict resolution; see § 9), clock → `top-right-lower`, term → `bottom-strip`.

### 4.3 Dock style remains global

`useDockStyle()` stays global (localStorage). It is *not* per-board. Tracking it per-board introduces two surfaces for the user to remember — Decision 13's mother-row convention (one dock per app) is well-loved and we shouldn't change it without cause.

## 5. Migration

Forward-only.

- `board.json` without `layoutMode`: opens as `'canvas'`. Preserves current behaviour for every existing user.
- `board.json` without `stationSlot` on mother nodes: backfilled to defaults on save.
- `board.json` without `layoutGeometry.station`: defaults applied at render-time, not persisted until the user resizes.
- New boards created by the app after this ADR ships: created with `layoutMode: 'station'`.
- Old app reading a new `board.json`: unknown fields ignored.

## 6. Files affected (planned)

**New:**
- `src/renderer/components/Station/StationLayout.tsx` — grid + `react-resizable-panels` host.
- `src/renderer/components/Station/StationCell.tsx` — **single generic** cell wrapper. Takes `slot: StationSlot`, resolves `boardStore.nodes.find(n => n.isMother && n.stationSlot === slot)`, looks up the React component via `registry.ts`, wraps it in `<MotherFrame variant="station">`, supplies the same `NodeProps`-shaped `onCommand`/`onSelect` context that `createNodeAdapter` builds today in `CanvasFlow.tsx`. Decision #8's `NodeProps` is RF-independent by design — no per-kind shims required.
- `src/renderer/components/Station/EmbeddedCanvasCell.tsx` — sized container for the RF mount.
- `src/renderer/components/Station/SlotResolver.ts` — maps mother kind → default station slot.
- `src/renderer/components/Station/useStationViewportGate.ts` — narrow-viewport fallback hook (see § 9.5).
- `src/renderer/components/ChassisLayer/StationChassis.tsx` — screen-space rendering path.
- `src/renderer/components/ChassisLayer/CanvasChassis.tsx` — renamed from current `ChassisLayer.tsx` body; the existing `index.tsx` becomes a router that branches on `layoutMode`.
- `src/renderer/components/ui/LayoutModeToggle.tsx` — topbar pill.
- Tests under `tests/unit/renderer/station.*.test.tsx`.

**Modified:**
- `src/renderer/store/boardStore.ts` — `+layoutMode`, `+setLayoutMode`, `+layoutGeometry`, `+setLayoutGeometry`, persistence.
- `src/main/persistence/board.ts` — migration: backfill `layoutMode`, `stationSlot`.
- `src/renderer/App.tsx` — branch on `layoutMode` to mount `<CanvasFlow>` (current) or `<StationLayout>` (new); both use the same `ReactFlowProvider`.
- `src/renderer/components/Canvas/CanvasFlow.tsx` — extract the RF mount so both `<CanvasFlow>` and `<EmbeddedCanvasCell>` can host it.
- `src/renderer/components/ChassisLayer/index.tsx` — branch on `layoutMode` between `CanvasChassis` (existing) and `StationChassis` (new).
- `src/renderer/components/nodes/MotherFrame/index.tsx` — accept `variant?: 'canvas' | 'station'`; station variant skips RF-specific decorations.
- `docs/06-requirements/app-chrome.md` — add F10 (mode toggle), F11 (resizable splitters), F12 (canvas remains full-feature in station mode).

**Dependency added:**
- `react-resizable-panels` (~12 kB gzipped, MIT, well-maintained). Architect confirms or vetoes in § 9.

## 7. Tests

- **Toggle preserves state**: `setLayoutMode('station')` then `setLayoutMode('canvas')` — nodes, edges, viewport, RF zoom level unchanged.
- **Same source of truth**: dispatching `task.complete` from inside the embedded canvas updates the Todo cell instantly in station mode.
- **Dock-chrome parity**: with `dockStyle = 'krnl-dock'`, both `CanvasChassis` and `StationChassis` render the same decorative content.
- **Resize persists**: drag the column splitter, save, reload — column widths restored.
- **Embedded canvas features**: from station mode, add a text node, an image node, a frame node — all appear inside the canvas window.
- **Theme parity**: toggle dark/light — both modes flip together; no station-specific overrides leak.
- **Migration**: pre-ADR `board.json` opens as canvas; mother nodes get default `stationSlot` only when user first toggles to station.
- **Playwright smoke**: UC-1 (first-run new board → station), UC-2 (existing user toggles to station and back), UC-3 (resize splitter persists).

## 8. Rejected alternatives

- **"Dock Mode" name.** Conflicts with existing `useDockStyle` / `data-dock` terminology. Renamed to "Station Mode."
- **Different visual style per mode.** Two design languages to maintain. Rejected per user direction.
- **Two RF instances (one for each mode).** Sync hell. One instance, two host elements.
- **Mother nodes as React-Flow `Panel` panels in station mode.** Panels live inside the RF viewport and inherit its event surface — bad for app-chrome focus/scroll containment.
- **Per-board dock-style variant.** Already global, well-loved, no reason to fragment it.
- **Roll our own splitter.** Solved problem; `react-resizable-panels` is small and accessible. (Architect can veto.)
- **Mother nodes as world-space RF nodes that get moved into a fixed-position transform in station mode.** Fights RF's coordinate system; produces remount thrash on toggle. Cleaner to render mothers as React components outside RF in station mode.

## 9. Open questions (for architect sign-off before implementation)

### 9.1 Calendar vs Habit in `top-right-upper`

Default station layout puts Calendar in `top-right-upper` and Clock in `top-right-lower`. Habit's current canvas position is third (next to Todo). In station mode there is no slot for Habit in the top-right column. Options:

- A) Habit gets its own column between Todo and the right rail (5-column layout).
- B) Habit moves into the canvas window as a child-style card (loses its mother status in station mode only).
- C) Habit shares `top-right-upper` with Calendar via a tab strip.

**Lean:** A. The mother row is already four columns; adding Habit makes it five and matches the current canvas count.

**Decision (architect, 2026-05-18): A.** B is forbidden by F8/NF4 — mother *content* must be identical across modes; demoting Habit to a child card in station-only breaks the "same source of truth, same look" contract and creates a per-mode behavioural divergence we will pay for forever. C hides a mother behind a tab click, which fights UC-1 ("user sees five named regions immediately") and U1. A is the only option compatible with the PRD as written.

Note that the resulting top row is **4 columns** (Pomo / Todo / Habit / right-rail), not 5 — the right rail stacks Calendar over Clock. At a 1024px viewport with the default fractions `[0.22, 0.30, 0.22, 0.26]` and ~6px splitters, each column gets ~225–305 px. Habit's pip grid renders compactly enough at that width. Enforce a `minSize` on each `<Panel>` (≈ 180 px translated to the panel's % unit at 1024 px viewport); below that, NF6's narrow-viewport fallback kicks in for the session. Add a test ("Station shell minimum column width is enforced at 1024px viewport") under § 7.

### 9.2 Splitter library: `react-resizable-panels` vs hand-rolled

`react-resizable-panels` is small, popular, accessible, persistence-friendly. Hand-rolled keeps the dep tree clean and gives us full styling control but is ~200 lines of code we'd own forever. **Lean:** library, override CSS to match the dock chrome.

**Decision (architect, 2026-05-18): `react-resizable-panels`.** ~12 kB gzipped, MIT, accessible (Enter/Arrow keys for keyboard resize), composes into nested PanelGroups for the row/column hierarchy, and already exposes `onLayout` for our persistence.

Install:
```
npm install react-resizable-panels
```

API contract for `StationLayout`:
```tsx
<PanelGroup direction="vertical" onLayout={onRowSplitLayout}>
  <Panel defaultSize={32} minSize={20}>
    <PanelGroup direction="horizontal" onLayout={onColumnLayout}>
      <Panel defaultSize={22} minSize={18}> {/* Pomo */} </Panel>
      <PanelResizeHandle />
      <Panel defaultSize={30} minSize={20}> {/* Todo */} </Panel>
      <PanelResizeHandle />
      <Panel defaultSize={22} minSize={18}> {/* Habit (OQ-1.A) */} </Panel>
      <PanelResizeHandle />
      <Panel defaultSize={26} minSize={20}>
        <PanelGroup direction="vertical" onLayout={onRightColumnLayout}>
          <Panel defaultSize={55} minSize={30}> {/* Calendar */} </Panel>
          <PanelResizeHandle />
          <Panel defaultSize={45} minSize={30}> {/* Clock */} </Panel>
        </PanelGroup>
      </Panel>
    </PanelGroup>
  </Panel>
  <PanelResizeHandle />
  <Panel defaultSize={68} minSize={40}>
    <EmbeddedCanvasCell />
  </Panel>
</PanelGroup>
```

Persistence is canonical via `board.json.layoutGeometry.station` written through `setLayoutGeometry`. **Do not use `autoSaveId`** — that writes to `localStorage` and would fragment our source of truth. The three `onLayout` callbacks dispatch into `boardStore`, which then debounces a `boardSave` IPC.

Double-click reset: `PanelResizeHandle` does not ship a built-in double-click handler; add `onDoubleClick` to a wrapper around each handle that calls `panelGroupRef.current?.setLayout(defaults)`.

No custom splitter CSS file. Style the handle with inline `style={{ background: 'var(--line)' }}` on a wrapper div that contains the `PanelResizeHandle`; hover styling lives in `tokens.css` or shared chrome CSS already.

### 9.3 Embedded canvas mount strategy

Two options:

- A) **Same RF tree, different host**: keep `<ReactFlowProvider>` at App root; conditionally render `<ReactFlow>` inside `<CanvasFlow>` (canvas mode) or `<EmbeddedCanvasCell>` (station mode). Mode toggle remounts `<ReactFlow>` once.
- B) **React portal**: render `<ReactFlow>` once at App root, portal it into the active host. No remount.

A is simpler. B avoids the one-frame remount but introduces portal lifecycle complexity. **Lean:** A unless the remount is visibly bad.

**Decision (architect, 2026-05-18): A.** Portaling `<ReactFlow>` into a sized cell that the parent resizes via `react-resizable-panels` will cause RF's internal `ResizeObserver` to fight the portal host's size changes — every splitter drag becomes a layout flush against the portaled subtree. A keeps the lifecycle linear: one remount on toggle, RF's ResizeObserver attaches to the new host cleanly.

**Hard prerequisite for shipping Step 4 of § 11.** Backend-dev's **first commit in Step 4** must be a Vitest unit test that proves viewport survives a remount under the same `<ReactFlowProvider>`:

```ts
// tests/unit/renderer/reactflow-remount.test.tsx
// Mount <ReactFlowProvider><ReactFlow defaultViewport={...}/></ReactFlowProvider>
// Inside: capture useReactFlow().setViewport({ x:120, y:-40, zoom:0.85 })
// Unmount <ReactFlow> (provider stays). Remount.
// Assert: useReactFlow().getViewport() === { x:120, y:-40, zoom:0.85 }
```

If that test passes, F9 is honoured for free. If it fails (because `<ReactFlow>` re-reads `defaultViewport` on remount or RF's internal store resets), the contract becomes: `boardStore` holds the last-known viewport (it already does via `onMoveEnd` → `setViewport`), and `<ReactFlow>` always mounts with `defaultViewport={boardStore.viewport}`. That's a 3-line fix, but we must know which path we're on **before** the rest of Step 4 lands.

`<ReactFlowProvider>` stays at App root unchanged (see `src/renderer/App.tsx:110`). Both `<CanvasFlow>` and `<EmbeddedCanvasCell>` are descendants of the same provider.

### 9.4 Reorder by drag (re-sliding panels)

User mentioned "they should be able to be swiped." Interpretation: dragging a panel's header swaps it with an adjacent panel. Out of scope for v1 (resize only) — promoted to v1.1 if validated by use. The slot model supports it without schema changes.

**Decision (architect, 2026-05-18): defer to v1.1.** The 2026-07-20 demo is a hard date and reorder-by-drag is pure scope. The named-slot schema (`stationSlot: 'top-left' | 'top-center' | ...`) already supports promotion to a `setStationSlot(motherId, slot)` command without migration — when v1.1 lands, the drag UI dispatches that command and we get persistence for free.

If user feedback after v1 strongly demands reorder, the v1.1 work is: drag-handle on each `StationCell` header, hit-test against the grid, dispatch `setStationSlot`. No ADR change required.

### 9.5 Narrow viewport fallback

Below 1024 × 640, station mode collapses to canvas mode for the session (saved mode preserved). Logged as a notice in the statusbar.

**Decision (architect, 2026-05-18): accept the session-fallback as specified.** Do not ship a "tablet station layout" in v1 — it would be a third design surface to maintain. The session fallback rule is:

- On window resize below 1024×640 with saved `layoutMode === 'station'`: render `<CanvasFlow>` for this session.
- `boardStore.layoutMode` in memory shows `'canvas'` (so the toggle pill reflects what the user sees); the **persisted** `layoutMode` in `board.json` remains `'station'`.
- StatusBar shows the line `Station mode requires ≥ 1024 × 640 — falling back to canvas.` (token: muted ink, no rust-red signal — this is informational not error).
- On resize back above the threshold within the same session: restore `'station'` immediately, no reload required.

Implementation: a `useStationViewportGate()` hook that reads `window.innerWidth/innerHeight`, watches a `resize` listener, and returns the effective mode. `App.tsx`'s mount branch reads the effective mode, not the stored mode.

## 10. PRD

[`docs/02-prd/PRD-station-mode.md`](../02-prd/PRD-station-mode.md). Owns user stories, acceptance criteria, rollout plan. This ADR owns the architecture rationale.

## 11. Prototype

A static HTML prototype lives at [`docs/assets/prototype-station-mode.html`](../assets/prototype-station-mode.html). It illustrates the station layout, the mode toggle, the resizable splitters, the dock-chrome variant indicator, and the theme toggle. It is for review only — not shipped, not linked from the app.

## 12. Architect sign-off

**Status:** Approved with changes.
**Date:** 2026-05-18
**Reviewer:** architect

### Verdict

The shape is right. Per-board mode, shared visual style, single `boardStore`, single RF instance, `ChassisLayer` reused with a screen-anchored variant, named-slot schema with backfill — all of this matches the established patterns in `src/renderer/components/Canvas/rfAdapters.tsx` (Decision #13), `nodes/types.ts` (Decision #8), and the dock-chrome system. The risks are real but contained, and the open questions all resolve cleanly to the leans.

### Required changes (must land before Step 4 of § 11 begins)

1. **Splitter library**: install `react-resizable-panels`; persistence routes through `boardStore.layoutGeometry.station`, not the library's `autoSaveId`. See § 9.2.
2. **Schema version**: bump `schemaVersion` to `2` on first load of a station-aware app. § 4.1 updated to reflect this.
3. **Generic `StationCell`**: § 6 and § 2.7 are updated to drop the per-mother wrappers — one generic wrapper handles all mother kinds because `NodeProps` is RF-independent by design.
4. **`MotherFrame` variant scope**: the only branch is a guard around the `rfToScreen` badge tracker and badge portal. No `StationMotherFrame` extraction. See § 2.7.
5. **`ChassisLayer` split**: extract the existing body to `CanvasChassis.tsx`; `ChassisLayer/index.tsx` becomes a 5-line router. See § 6.

### Gating prerequisite for Step 4

Backend-dev's **first commit in Step 4** must be the viewport-survives-remount test described in § 9.3. If the test fails, the fix is to mount `<ReactFlow>` with `defaultViewport={boardStore.viewport}` and rely on the existing `onMoveEnd → setViewport` write — both already exist in `CanvasFlow.tsx`. The test exists to force us to know which path we're on before the rest of Step 4 lands.

### Implementation order (which step ships first)

PRD § 11's order is correct. Reaffirmed:

1. **Step 1 — ADR + PRD + this sign-off.** Doc-only. **Ship first.**
2. **Step 2 — Schema migration.** `migrateLayoutMode` + `migrateStationSlot` inserted in the existing chain in `src/main/persistence/board.ts` (see migration order rules already documented there). Vitest fixtures for a pre-ADR `board.json` and a station `board.json`. **Schema bump only — no UI yet.**
3. **Step 3 — Store + toggle pill behind `KRNL0_STATION_MODE` env flag.** No layout change. Toggle is wired but flips between two identical canvas views until Step 4. This is the safest place to land the `setLayoutMode` + persistence round-trip.
4. **Step 4 — `StationLayout` + `EmbeddedCanvasCell` + generic `StationCell` + `MotherFrame` variant.** *First commit: the viewport-remount test from § 9.3.* Then the layout work behind the same flag.
5. **Step 5 — `StationChassis`.** Parity matrix against `CanvasChassis` for all three non-classic dock variants.
6. **Step 6 — splitter persistence + a11y.**
7. **Step 7 — flag removed; new boards default to station.**
8. **Step 8 — docs.**
9. **Step 9 — Playwright smoke.**

### New tests beyond § 7

- **`reactflow-remount.test.tsx`** — viewport, node set, edge set, and selection all survive a `<ReactFlow>` unmount/remount under the same `<ReactFlowProvider>`. Gates § 9.3. **Must land first in Step 4.**
- **`station-cell-generic.test.tsx`** — the single `StationCell` wrapper renders all six mother kinds (pomo/todo/habit/calendar/clock/term) when given the corresponding slot, with no per-kind shim, and dispatches `onCommand` correctly. Gates the generic-wrapper claim in § 2.7 / § 6.
- **`station-min-column-width.test.tsx`** — at a simulated 1024×640 viewport, each station column respects its `minSize` floor and no panel collapses below the floor when the user drags the splitter past it. Gates OQ-1's tight-column concern.
- **`schema-version-bump.test.ts`** — loading a `schemaVersion: 1` board surfaces `2` in memory; the next save writes `2`; an unrelated round-trip of a `schemaVersion: 2` board is idempotent. Gates NF2 and § 4.1.
- **`narrow-viewport-fallback.test.tsx`** — with `localStorage`-persisted `layoutMode === 'station'` and a 800×600 window, the effective mode is `'canvas'`, the saved value remains `'station'`, the statusbar shows the notice; on resize back above the threshold within the same session, station mode resumes without reload. Gates § 9.5.

### What this approves

The PRD as written, with the five OQs resolved above and the five required changes folded in. Backend-dev is unblocked to start Step 2 once those changes are reflected in this ADR (they are, as of this commit).

### What this does not approve

- Any third layout mode in this ADR (focus mode, etc.). Out of scope.
- Per-board dock-style. Stays global per Decision 13 convention.
- A separate Station Mode CSS file. § 2.2 and NF4 are load-bearing.
- A new `StationMotherFrame` component. § 2.7 keeps the variant inside `MotherFrame`.
- Drag-to-reorder in v1. § 9.4 defers to v1.1.

— architect, 2026-05-18
