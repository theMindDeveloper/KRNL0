# krnl0 — Architecture Decision Log
*May 2026 · Pre-build architecture brief*

This document records the key architectural decisions made before writing code — including alternatives considered and why they were rejected.

---

## Context

Building krnl0: a desktop app that's an infinite-canvas personal OS. Pomodoro, habits, todos — all as connectable nodes on one whiteboard. Local-first.

The defining feature: Claude Code can drive the app itself through a defined CLI surface. The user opens a terminal node, types `claude`, and from there can speak or type instructions that read and modify the board. The terminal is a first-class peer to the GUI, not a power-user escape hatch.

Solo developer. 10-week timeline. Never built a desktop app before. Every decision has to be justifiable against those constraints.

---

## Decision 1 — Desktop runtime: Tauri vs Electron

**Rejected: Tauri**

Arguments for Tauri:
- Smaller bundles (~10MB vs ~150MB)
- Faster, feels more native
- Growing ecosystem

Arguments against Tauri for this project:
- Rust learning curve for anything backend-heavy
- Terminal embedding via `portable-pty` (Rust) is less documented than `node-pty` (Node)
- Solo dev, 10 weeks, learning TypeScript at the same time — Rust on top is too much

**Chosen: Electron**

Electron wins because:
- One language (TypeScript) end-to-end
- `node-pty` for terminal embedding is battle-tested (VS Code, Hyper, Warp all use it)
- Massive ecosystem — `node-pty`, `xterm.js`, `electron-builder` all work out of the box
- 150MB binary is acceptable for a desktop productivity app

**Status: Locked in PRD v0.6.0.**

---

## Decision 2 — Terminal node tech stack

The terminal node has to be a real shell (PowerShell on Windows, zsh/bash on Mac), not a fake REPL. The user must be able to launch `claude` inside it and have Claude Code work normally.

**Chosen stack:**
- **Backend:** `node-pty` — pseudo-terminal that works on Mac/Linux (POSIX PTY) and Windows (ConPTY). Spawns the shell, handles resize, streams I/O.
- **Frontend:** `xterm.js` (via `@xterm/xterm`) — renders ANSI escape codes, handles cursor, scrollback, selection.
- **Bridge:** Electron IPC — `node-pty` lives in the main process, `xterm.js` in the renderer, connected via `ipcMain`/`ipcRenderer`.

**Effort estimate:** 1–2 weeks of focused work to get a stable cross-platform terminal that can host `claude`. This is the riskiest piece; it should be built first.

---

## Decision 3 — How Claude Code drives the app

**Rejected: MCP server**

The original idea was to run an MCP server inside the app and have Claude Code auto-discover it. This is clean architecturally but adds complexity:
- Running a local HTTP/stdio server inside an Electron app is non-trivial
- Auto-discovery configuration is fragile
- v1 scope doesn't justify it

MCP is the right call for v1.1 as a polish step. Cut for v1.

**Chosen: `sys` CLI subprocess**

Claude Code (as `ClaudeCodeProvider`) spawns `claude -p` with `--allowedTools Bash`. Claude Code then runs `sys` commands via its Bash tool. Same surface, simpler plumbing.

The insight: **Claude Code does not need privileged access to the app.** It uses the same CLI a power user would type. No backdoor, no special protocol.

```bash
claude -p "add a todo to call mom" \
  --output-format json \
  --allowedTools "Bash,Read,Edit,Write"
# CWD = codebase folder where CLAUDE.md lives
# Claude reads CLAUDE.md, runs: sys todo add "call mom"
# board.json updates, file watcher fires, canvas re-renders
```

**Status: Locked in PRD v0.6.0.**

---

## Decision 4 — Node + edge architecture

Non-negotiable. Decided before the architecture brief.

Every widget conforms to one `Node` interface: `kind`, JSON `state`, pure `render` function, typed `events`, typed `commands`, `config` schema. Edges are directed `event → command` mappings stored as data in `board.json`.

**Key rule:** No direct imports between node modules. All cross-node communication goes through edges. The kernel dispatches.

The `sys` CLI uses the same command surface that edges use. Edges fire commands locally; Claude Code fires commands through `sys`. Same surface, two callers.

**Status: Locked.**

---

## Decision 5 — Source of truth

**Chosen: `board.json` as singleton**

One JSON file in `~/Documents/krnl0/board.json`. No SQLite, no IndexedDB, no cloud.

Why:
- Human-readable, diffable, backupable
- File watcher pattern (Observer) connects persistence to UI with zero glue code
- Matches the "local-first, yours to own" conviction
- Simple enough for a solo dev to reason about completely

**Persistence rule:** persist intent, derive presentation. A running Pomodoro stores `startedAt` + `durationMin`. The countdown is computed every render from `now() - startedAt`. Never save UI-derived state.

**Status: Locked.**

---

## Decision 6 — v1 scope cuts

Cut before week 1 to keep the scope honest:

| Cut | Reason |
|---|---|
| Plugin system | Adds architecture complexity (sandboxing, manifest, registry). Built-in nodes only. |
| Multiple boards | One board in v1. |
| Cloud sync / multiplayer | Local-first only. |
| Mobile companion | Out of scope. |
| Journal node | Deferred to v1.5. |
| MCP server | Deferred to v1.1. |
| ElevenLabs TTS | Deferred to v1.1. Piper is free and local. |
| OpenAI Realtime | Cost + complexity. |
| Custom themes | Token system supports them; we don't ship more than light + dark. |

**Status: Locked. Do not re-open.**

---

## Build order

1. **Terminal node first** — riskiest piece. If `node-pty` cross-platform is broken, we learn early.
2. **`sys` CLI** — the mutation surface. Everything else depends on it.
3. **Canvas + one node** — prove the board renders.
4. **Close the loop** — one `sys` call from Claude Code updates the canvas. End-to-end proof.
5. **Expand** — add remaining mothers, edges, voice.

---

# Phase 2 — Node Contracts (binding)

The decisions below (7–12) lock the contracts backend-dev implements for Week 2. They are derived from PRD v0.6.0 §7 and the locked decisions 1–6. They do not relax any earlier rule; they make the rules concrete enough to write code against.

---

## Decision 7 — Canvas Transform State

**Date:** 2026-05-10
**Status:** Accepted
**Author:** architect

### Context

The canvas needs pan and zoom. The transform `(x, y, zoom)` could live in three places: React local state inside `Canvas`, the Zustand `boardStore`, or `board.json` itself. PRD §7.5 already shows a `viewport` field in `board.json`. Decision 5 says "persist intent, derive presentation" — viewport position is intent (the user *chose* to look here), not derived. Pan and zoom must be smooth (60fps), so writes that hit disk on every pointer event are unacceptable.

### Decision

The canvas transform is a single source of truth in `boardStore`. It is **persisted** to `board.json` under `viewport`, but writes are **debounced at 500ms** so a pointer-drag does not thrash the disk.

**Coordinate convention (binding):** `viewport.x` and `viewport.y` are **screen-space pixels** — they are the literal `translate()` arguments applied to the canvas transform layer **before** `scale(zoom)`. The CSS transform order is fixed: `translate(viewport.x, viewport.y) scale(viewport.zoom)`. The forward map from a node's stored world position `(wx, wy)` to its on-screen pixel position is therefore `(viewport.x + wx * viewport.zoom, viewport.y + wy * viewport.zoom)` (plus the constant `top: 50%; left: 50%` origin offset, which is shared by all nodes and irrelevant to the math).

**Pan is 1:1 in screen pixels.** A pointer delta of `(dx, dy)` produces `viewport.x += dx; viewport.y += dy`. Do **not** divide by zoom — the translate is already screen-space, so dividing would make pan sluggish at high zoom and twitchy at low zoom.

**Zoom uses focal-point math** so the world point under the cursor stays under the cursor across the zoom step. Derivation, given a `wheel` event at screen position `(sx, sy)` and a multiplicative `factor`:

```
worldX_before = (sx - viewport.x) / viewport.zoom
worldY_before = (sy - viewport.y) / viewport.zoom
newZoom       = clamp(viewport.zoom * factor, 0.25, 4)
viewport.x    = sx - worldX_before * newZoom
viewport.y    = sy - worldY_before * newZoom
viewport.zoom = newZoom
```

This formula and the pan rule are mutually consistent under the `translate ∘ scale` order chosen above. Reversing the order (`scale ∘ translate`) would require pan to divide by zoom and would invert the focal formula — that path is **rejected**.

### Contract

```typescript
// src/shared/types/board.ts — already exists, no change
interface BoardViewport { x: number; y: number; zoom: number; }
// x, y are screen-space pixel offsets applied BEFORE scale.
// zoom is dimensionless, clamped [0.25, 4].

// src/renderer/store/boardStore.ts — additions
interface BoardStore {
  // ...existing
  viewport: BoardViewport;                 // mirrors board.viewport, drives Canvas
  setViewport: (v: BoardViewport) => void; // updates store; debounced writer pushes to board.json
  panBy: (dxScreen: number, dyScreen: number) => void;     // screen pixels, no zoom division
  zoomAt: (focalScreenX: number, focalScreenY: number, factor: number) => void;
}
```

**CSS contract (binding — must match this exact order):**

```tsx
<div style={{
  transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
  transformOrigin: '0 0',
}}>
```

**Behavioural rules:**

- **Initial viewport:** `{ x: 0, y: 160, zoom: 1 }` so all four mothers are visible (PRD §7.1). Note: this is screen-space — the layer is offset 160px down so the cluster centred at world `(0, 160)` lands near the screen centre after the `top: 50%; left: 50%` origin shift.
- **Pan:** middle-mouse-button OR space+left-mouse drag. `pointerdown` calls `setPointerCapture`; `pointermove` adds the raw screen delta: `panBy(e.movementX, e.movementY)`; `pointerup` releases capture. Left-mouse drag without space is reserved for node interactions.
- **Zoom:** `wheel` event. `factor = Math.exp(-deltaY * 0.001)`. Apply the focal formula above. Clamp `zoom` to `[0.25, 4]`.
- **Persistence:** `setViewport` updates the store synchronously; a 500ms debounced effect writes `board.viewport` and triggers `sys board save`. The pointer/wheel handlers never write directly.
- **Home key:** resets viewport to `{ x: 0, y: 160, zoom: 1 }` (PRD §7.1).

### Consequences

- Enables: smooth pan/zoom, viewport persists across restarts, single store-driven render.
- Forecloses: per-node viewport overrides, multiple cameras, animated transitions on viewport (can be added later without breaking the contract).
- Risk: debounced write means a crash within 500ms of the last pan loses that viewport delta. Acceptable — viewport is low-stakes.

---

## Decision 8 — Node Kind Dispatch

**Date:** 2026-05-10
**Status:** Accepted
**Author:** architect

### Context

`Canvas` currently renders a placeholder `<div>` for every node regardless of `kind` (see `src/renderer/components/Canvas/index.tsx:70`). The node spec (§7.2) says every node type registers a kernel-side spec with a pure `render` function. We need a single dispatch point that maps `node.kind` → component, and a single `NodeProps` shape that every node component accepts. Rule 5 from §7.2 forbids cross-node imports, so the dispatch map must live outside any individual node module.

**Naming note (added 2026-05-10 during PR #2):** The kernel-side registration interface in `src/shared/types/node.ts` was originally named `NodeKind<TState, TConfig>`. This decision needs a *literal-union* name for the set of valid kind strings — and `NodeKind` is the natural name for that string type, since it describes what `node.kind` actually is. To resolve the collision: the existing interface is renamed to **`NodeKindSpec<TState, TConfig>`** (it is a *spec* describing how a kind behaves), and **`NodeKind`** is reserved for the literal union of kind strings. Rationale: in day-to-day code (commands, switches, registry keys, IPC payloads) the union is used 10× more often than the spec, so it deserves the shorter name. The spec is a once-per-kind registration; spelling it `NodeKindSpec` is fine.

### Decision

A central registry module `src/renderer/components/nodes/registry.ts` exports a `Record<NodeKind, ComponentType<NodeProps>>`. Canvas iterates `board.nodes`, looks up the component by `node.kind`, and renders it with `NodeProps`. Unknown kinds render a fallback `<UnknownNode>` (do not throw — a future node `kind` should not crash the canvas).

The kernel-side registration interface (formerly `NodeKind<T,C>`) is renamed to `NodeKindSpec<T,C>` to free the `NodeKind` name for the literal union below.

### Contract

```typescript
// src/shared/types/node.ts — kind values are string literals
export type NodeKind = 'pomo' | 'todo' | 'habit' | 'term'
                    | 'pomo.session' | 'todo.task' | 'habit.day';

// src/shared/types/node.ts — kernel registration spec (renamed from NodeKind)
export interface NodeKindSpec<TState, TConfig> {
  kind: NodeKind;
  defaultState: () => TState;
  defaultConfig: () => TConfig;
  render: (props: RenderProps<TState, TConfig>) => ReactElement; // pure
  commands: Record<string, CommandHandler<TState>>;
  events: readonly string[];
  schema: ZodSchema<TState>;
}

// src/renderer/components/nodes/types.ts
export interface NodeProps<TState = unknown, TConfig = unknown> {
  node: Node<TState, TConfig>;
  selected: boolean;
  onCommand: (command: string, args?: Record<string, unknown>) => void;
  onSelect: () => void;
  // Drag is only enabled for child nodes; mothers ignore drag handlers.
  onDragStart?: (e: React.PointerEvent) => void;
}

// src/renderer/components/nodes/registry.ts
import { PomoNode } from './PomoNode';
import { TodoNode } from './TodoNode';
import { HabitNode } from './HabitNode';
import { TerminalNode } from './TerminalNode';
import { UnknownNode } from './UnknownNode';

export const NODE_REGISTRY: Record<string, ComponentType<NodeProps>> = {
  pomo: PomoNode,
  todo: TodoNode,
  habit: HabitNode,
  term: TerminalNode,
};

export function resolveNodeComponent(kind: string): ComponentType<NodeProps> {
  return NODE_REGISTRY[kind] ?? UnknownNode;
}
```

**Canvas dispatch (replaces the TODO at `Canvas/index.tsx:70`):**

```typescript
const Component = resolveNodeComponent(node.kind);
return <Component key={node.id} node={node} selected={...} onCommand={...} onSelect={...} />;
```

**Rules:**

- Every node component is a pure function of `NodeProps`. Local UI state (e.g. an open inline editor) is allowed inside the component but MUST NOT change board state — only `onCommand` does that.
- `onCommand` is the single channel out of a node component. Side effects, `sys` calls, IPC — all routed through `onCommand`. The kernel translates the command into a state mutation.
- No node component imports from another node component module. Shared primitives (buttons, inputs, port handles) live in `src/renderer/components/nodes/_shared/`.

### Consequences

- Enables: adding a new node kind is one entry in `NODE_REGISTRY` plus one component file.
- Forecloses: nodes calling each other directly. All cross-node logic goes through edges (Decision 4).
- Tight coupling between `Canvas` and the registry is intentional and centralised.

---

## Decision 9 — PomoNode State Contract

**Date:** 2026-05-10
**Status:** Accepted
**Author:** architect

### Context

PRD §7.4 fixes the persistence rule: store `startedAt`, derive the countdown. The mother PomoNode owns the *current* session and a *history* of prior sessions. Restart-resume is a hard requirement (R9 in PRD §1) — closing and reopening the app while a Pomodoro is running must show the correct elapsed time. Children of kind `pomo.session` may also be spawned for individual focus blocks; those are out of scope for this decision (defined when needed).

### Decision

PomoNode `state` follows a finite-state machine with four named statuses. The countdown is **always derived** from `now - startedAt`; it is never written to state. On app load, if `status === 'running'` and `now - startedAt >= durationMin * 60_000`, the kernel auto-emits `pomo.complete` once before first render so the timer naturally transitions to `done` without flicker.

### Contract

```typescript
// src/renderer/components/nodes/PomoNode/types.ts
export type PomoStatus = 'idle' | 'running' | 'break' | 'done';

export interface PomoSessionRecord {
  id: string;                  // ULID
  startedAt: string;           // ISO 8601
  endedAt: string;             // ISO 8601
  durationMin: number;
  label: string;
  completed: boolean;          // false if cancelled
}

export interface PomoState {
  status: PomoStatus;
  startedAt: string | null;    // ISO; null when status === 'idle' or 'done'
  durationMin: number;         // default 25
  breakMin: number;            // default 5
  label: string;               // default ''
  sessionsCompleted: number;   // incremented on completion
  history: PomoSessionRecord[];
}

export interface PomoConfig {
  defaultDurationMin: number;  // default 25
  defaultBreakMin: number;     // default 5
  longBreakEvery: number;      // default 4
  longBreakMin: number;        // default 15
}

// Default state factory
export const defaultPomoState = (): PomoState => ({
  status: 'idle',
  startedAt: null,
  durationMin: 25,
  breakMin: 5,
  label: '',
  sessionsCompleted: 0,
  history: [],
});
```

**Commands (every state change must go through one of these — Rule 3 from §7.2):**

| Command | Args | Pre | Post |
|---|---|---|---|
| `pomo.start` | `{ label?, durationMin? }` | `status === 'idle'` or `'done'` | `status = 'running'`, `startedAt = now()` |
| `pomo.cancel` | `{}` | `status === 'running'` | append cancelled record to history; `status = 'idle'`; `startedAt = null` |
| `pomo.complete` | `{}` | `status === 'running'` and `now - startedAt >= durationMin * 60_000` | append completed record; `sessionsCompleted++`; `status = 'break'`; `startedAt = now()` |
| `pomo.skipBreak` | `{}` | `status === 'break'` | `status = 'idle'`; `startedAt = null` |
| `pomo.endBreak` | `{}` | `status === 'break'` and `now - startedAt >= breakMin * 60_000` | `status = 'idle'`; `startedAt = null` |
| `pomo.setLabel` | `{ label }` | always | update `label` |
| `pomo.setDuration` | `{ minutes }` | `status !== 'running'` | update `durationMin` |

**Events (emitted by kernel after state transition):**

- `pomo.started` — fired by `pomo.start`
- `pomo.completed` — fired by `pomo.complete`
- `pomo.cancelled` — fired by `pomo.cancel`

**Render rules:**

- Compute `elapsedMs = status === 'running' || status === 'break' ? Date.now() - Date.parse(startedAt) : 0`.
- `remainingMs = (status === 'running' ? durationMin : breakMin) * 60_000 - elapsedMs`.
- A `requestAnimationFrame` (or 500ms `setInterval`) drives the visual tick. The tick **does not write state**. When `remainingMs <= 0` and `status === 'running'`, the component fires `onCommand('pomo.complete')`.
- On boot, the kernel inspects every PomoNode: if `status === 'running'` and the deadline has passed, it dispatches `pomo.complete` *before* first render.

### Consequences

- Enables: lossless restart-resume, a clean session log for habits/journaling integrations.
- Forecloses: storing a paused timer (no `paused` status) — pause is achievable by `cancel + start` if needed; explicit pause is deferred to v1.1 to keep the FSM small.
- The "tick must not write state" rule prevents 60fps writes to `board.json`.

---

## Decision 10 — TodoNode State Contract

**Date:** 2026-05-10
**Status:** Accepted
**Author:** architect

### Context

The Todo mother holds the active task list. Reordering needs a stable rule (PRD lists "undone first, done last"). IDs must be stable across reorders so React keys, edges, and `sys` references all remain valid. Crypto.randomUUID is available in Electron renderer and main; ULID is preferred for sortable IDs but adds a dependency. We choose `crypto.randomUUID()` for v1 simplicity — sortability isn't required because `createdAt` provides the order signal.

### Decision

TodoNode `state` is a flat array of items. Sort order is computed at render time from `(done, createdAt)`: undone before done, then ascending by `createdAt` within each group (stable). Storage order in the array is **insertion order**, never sorted in place — this preserves an audit trail and makes diffs in `board.json` legible.

### Contract

```typescript
// src/renderer/components/nodes/TodoNode/types.ts
export interface TodoItem {
  id: string;             // crypto.randomUUID()
  text: string;
  done: boolean;
  createdAt: string;      // ISO 8601
  completedAt: string | null; // ISO when done = true, null otherwise
}

export interface TodoState {
  items: TodoItem[];      // insertion order; render sorts a copy
}

export interface TodoConfig {
  showCompleted: boolean; // default true
  maxVisible: number;     // default 50
}

export const defaultTodoState = (): TodoState => ({ items: [] });
```

**Commands:**

| Command | Args | Effect |
|---|---|---|
| `todo.add` | `{ text }` | append `{ id: crypto.randomUUID(), text, done: false, createdAt: now(), completedAt: null }` |
| `todo.toggle` | `{ id }` | flip `done`; set `completedAt = done ? now() : null` |
| `todo.edit` | `{ id, text }` | update `text` (no-op if item missing) |
| `todo.remove` | `{ id }` | filter out the item |
| `todo.clearDone` | `{}` | filter out all `done === true` items |

**Events:** `todo.added`, `todo.completed` (only on `done: false → true`), `todo.removed`.

**Render sort (pure, applied to a copy):**

```typescript
const visible = [...state.items]
  .filter(i => config.showCompleted || !i.done)
  .sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return a.createdAt.localeCompare(b.createdAt); // stable lexicographic on ISO
  })
  .slice(0, config.maxVisible);
```

### Consequences

- Enables: trivial undo via `board.json` diff, edges keyed off `todo.completed`.
- Forecloses: drag-to-reorder semantics in v1 (would require an explicit `order` field). Re-add when needed.
- IDs are opaque strings — never parsed, never relied on for ordering.

---

## Decision 11 — HabitNode State Contract

**Date:** 2026-05-10
**Status:** Accepted
**Author:** architect

### Context

Habits is a 7-day grid. The week boundary needs a rule that survives time-zone weirdness, daylight-saving transitions, and the user's local Sunday-midnight rollover. Storing only the current week's `boolean[7]` would lose history; we need enough data to render *and* to compute streaks. Streaks are emotionally load-bearing (PRD §7.1: "streaks") so the rule must be unambiguous.

### Decision

Each habit stores a sparse log of completion **dates** (local YYYY-MM-DD strings), not a rolling boolean grid. The 7-day grid the user sees is **derived** from the log against the current week. Streak count is derived: walk backwards from today through the log, counting consecutive days; if today is not yet marked, the streak ends at yesterday so the user does not see "0" before completing today's check.

`weekStart` is computed (not stored) as the most recent Monday in the user's local time zone. `grid[0]` is Monday, `grid[6]` is Sunday — ISO 8601 week ordering.

### Contract

```typescript
// src/renderer/components/nodes/HabitNode/types.ts
export interface Habit {
  id: string;              // crypto.randomUUID()
  name: string;
  createdAt: string;       // ISO 8601
  log: string[];           // ['2026-05-10', '2026-05-09', ...] — sorted desc, unique, local YYYY-MM-DD
  archived: boolean;       // default false; archived habits hidden from grid
}

export interface HabitState {
  habits: Habit[];
}

export interface HabitConfig {
  weekStartsOn: 'monday';  // locked for v1
}

export const defaultHabitState = (): HabitState => ({ habits: [] });
```

**Commands:**

| Command | Args | Effect |
|---|---|---|
| `habit.add` | `{ name }` | push new Habit with empty log |
| `habit.toggleDay` | `{ id, date }` (date defaults to today) | toggle membership of `date` in the habit's log; keep log sorted desc |
| `habit.markDone` | `{ id }` | ensure today is in the log (idempotent) — used by edges (e.g., pomo→habit) |
| `habit.rename` | `{ id, name }` | update name |
| `habit.archive` | `{ id }` | set `archived = true` |
| `habit.remove` | `{ id }` | delete the habit (irreversible) |

**Events:** `habit.created`, `habit.markedDone` (only when toggle goes false→true for today), `habit.streakBroken` (emitted on app startup if a previously-active streak is now broken — fires once per habit per session).

**Derived helpers (pure, render-only — never written):**

```typescript
function todayLocal(): string { /* YYYY-MM-DD in local TZ */ }
function mondayOfThisWeek(): Date { /* most recent Monday 00:00 local */ }

function gridFor(habit: Habit): boolean[7] {
  const monday = mondayOfThisWeek();
  return Array.from({length: 7}, (_, i) => {
    const d = addDays(monday, i);
    return habit.log.includes(toYMD(d));
  });
}

function streak(habit: Habit): number {
  const today = todayLocal();
  const set = new Set(habit.log);
  let count = 0;
  let cursor = set.has(today) ? today : prevDay(today);
  while (set.has(cursor)) { count++; cursor = prevDay(cursor); }
  return count;
}
```

**Rules:**

- Dates in `log` are **local-time YYYY-MM-DD strings**, not UTC ISO timestamps. This avoids the "I checked at 11pm but it counts as tomorrow in UTC" bug.
- Sort log descending; `toggleDay` re-sorts.
- The week boundary recalculates implicitly on the next render after Sunday midnight — no scheduled tick needed because `mondayOfThisWeek()` reads the current clock.

### Consequences

- Enables: arbitrarily long history (months of streaks), back-dated entries via `habit.toggleDay({ date })`.
- Forecloses: per-day partial completion (a habit is either done that day or not). Adding "intensity" later requires changing the log shape.
- Time-zone changes (user travels) may produce one anomalous day; acceptable for v1.

---

## Decision 12 — TerminalNode IPC Contract

**Date:** 2026-05-10
**Status:** Accepted
**Author:** architect

### Context

Decision 2 fixed the stack: `node-pty` in main, `xterm.js` in renderer, IPC bridge between them. Multiple TerminalNode instances may exist on the canvas (children spawned by the user), so the protocol must be **session-keyed**. The pty lifecycle belongs in the **main process** because `node-pty` is a native module and renderers shouldn't load native code under modern Electron sandboxing.

### Decision

Terminal sessions are owned by the main process and identified by a `sessionId` (the renderer-side TerminalNode's `node.id`). The renderer requests session creation; the main process spawns the pty and streams data back via a session-scoped event. The renderer never holds a pty handle — only a sessionId.

### Contract

**IPC channel names (all lowercase, colon-namespaced, request/reply for invocations and on/send for streams):**

| Channel | Direction | Payload | Reply |
|---|---|---|---|
| `pty:create` | renderer→main (invoke) | `{ sessionId: string, shell?: string, cwd?: string, cols: number, rows: number, env?: Record<string,string> }` | `{ ok: true, pid: number } \| { ok: false, error: string }` |
| `pty:write` | renderer→main (send) | `{ sessionId: string, data: string }` | — |
| `pty:resize` | renderer→main (send) | `{ sessionId: string, cols: number, rows: number }` | — |
| `pty:kill` | renderer→main (invoke) | `{ sessionId: string, signal?: string }` | `{ ok: true }` |
| `pty:data` | main→renderer (send) | `{ sessionId: string, data: string }` | — |
| `pty:exit` | main→renderer (send) | `{ sessionId: string, exitCode: number, signal: string \| null }` | — |

**Lifecycle:**

1. Renderer mounts a `TerminalNode`. On mount it calls `ipcRenderer.invoke('pty:create', { sessionId: node.id, cols, rows })`.
2. Main process spawns `node-pty.spawn(shell, [], {cwd, env, cols, rows})`, registers `onData` and `onExit` handlers that forward to the renderer scoped by `sessionId`, and stores the pty in a `Map<sessionId, IPty>`.
3. Renderer subscribes once at startup (in `preload.ts`) to `pty:data` and `pty:exit`; it dispatches each event to the matching xterm instance using `sessionId`.
4. xterm's `onData` (user keystrokes) calls `ipcRenderer.send('pty:write', {sessionId, data})`.
5. ResizeObserver on the xterm container debounces and calls `ipcRenderer.send('pty:resize', {sessionId, cols, rows})`.
6. On unmount the renderer calls `ipcRenderer.invoke('pty:kill', {sessionId})`. Main kills the pty and removes it from the Map.
7. If the user closes the window, main iterates the Map and kills all ptys (`app.on('before-quit')`).

**Default shell:**

```typescript
// main process
const defaultShell = process.platform === 'win32'
  ? (process.env.COMSPEC ?? 'powershell.exe')
  : (process.env.SHELL ?? '/bin/zsh');
```

`cwd` defaults to the user's home dir. Override allowed via `pty:create` args (used by the kernel when launching `claude` inside the codebase folder — see Decision 3).

**Security:**

- The main process **must** validate that `sessionId` is a known nodeId in the current board before honoring `pty:write` / `pty:resize` / `pty:kill`. A renderer compromise must not let arbitrary sessions spawn or be hijacked.
- The `shell`, `cwd`, and `env` parameters from the renderer are accepted for v1 (single-user local app). If a sandboxed mode is added later, these become server-controlled.

**Type definitions:**

```typescript
// src/shared/types/ipc.ts
export interface PtyCreateArgs {
  sessionId: string;
  shell?: string;
  cwd?: string;
  cols: number;
  rows: number;
  env?: Record<string, string>;
}
export type PtyCreateResult =
  | { ok: true; pid: number }
  | { ok: false; error: string };

export interface PtyWriteArgs   { sessionId: string; data: string; }
export interface PtyResizeArgs  { sessionId: string; cols: number; rows: number; }
export interface PtyKillArgs    { sessionId: string; signal?: string; }
export interface PtyDataEvent   { sessionId: string; data: string; }
export interface PtyExitEvent   { sessionId: string; exitCode: number; signal: string | null; }
```

### Consequences

- Enables: multiple terminals on one canvas, hosting `claude` inside any of them, clean shutdown.
- Forecloses: running ptys in renderer (by design — native modules stay in main).
- Native-module pain (rebuilds for Electron version) is concentrated in one place; `electron-rebuild` runs in postinstall.

---

## Decision 14 — Child Node Kinds and Edge.visual Field

**Date:** 2026-05-10
**Status:** Accepted
**Author:** architect

### Context

Decision 8 defined the `NodeKind` literal union as `'pomo' | 'todo' | 'habit' | 'term' | 'pomo.session' | 'todo.task' | 'habit.day'`. Three additional child node kinds — `calendar`, `text`, and `image` — were needed as composable widgets that can appear on the canvas as non-mother nodes. They are children in the sense that they carry `isMother: false` and are draggable; they are not tied to a specific mother kind (unlike `todo.task`).

Separately, `rfAdapters.toRfEdge` had been using a kind-based heuristic (inferring visual style from `_srcKind` / `_tgtKind`) to decide how edges were rendered in React Flow. This heuristic was fragile: it could not distinguish between two edges of the same kind pair that intentionally looked different, and it added implicit coupling between the adapter and node kind names.

### Decision

**Child nodes:** `calendar`, `text`, and `image` are added to the registry and `NodeKind` union. Each has its own `State`, `Config`, default factories, and `commandDispatch` entries. They are spawned via Dock buttons using `addNodeToBoard(kind)`. They do not emit events in v1 (no edges originate from them).

**Edge.visual:** The `Edge` interface gains an optional `visual?: 'default' | 'task-flow' | 'pomo-edge'` field. `toRfEdge` reads this field directly and falls back to `'default'` when absent. The `_srcKind` and `_tgtKind` parameters are retained in the function signature (for future use) but are no longer read. The kind-heuristic path is removed.

### Contract

```typescript
// src/shared/types/edge.ts
export interface Edge {
  id: string;
  from: { nodeId: string; event: string };
  to:   { nodeId: string; command: string };
  args?: Record<string, unknown>;
  enabled: boolean;
  visual?: 'default' | 'task-flow' | 'pomo-edge';
}

// src/renderer/components/nodes/CalendarNode/types.ts
export interface CalendarEvent { date: string; title: string; color?: string; }
export interface CalendarState { month: number; year: number; events: CalendarEvent[]; }
export interface CalendarConfig { firstDay?: 0 | 1; }

// src/renderer/components/nodes/TextNode/types.ts
export interface TextState { content: string; fontSize?: number; }
export interface TextConfig { placeholder?: string; }

// src/renderer/components/nodes/ImageNode/types.ts
export interface ImageState { src: string; alt?: string; caption?: string; }
export interface ImageConfig { fit?: 'contain' | 'cover' | 'fill'; }
```

**Commands added to `commandDispatch.applyCommand`:**

| Kind | Command | Args | Effect |
|---|---|---|---|
| `calendar` | `calendar.prevMonth` | — | decrement month, wrap year |
| `calendar` | `calendar.nextMonth` | — | increment month, wrap year |
| `text` | `text.setContent` | `{ content }` | update text content |
| `text` | `text.setFontSize` | `{ size }` | update font size |

**Registry additions:**

```typescript
// src/renderer/components/nodes/registry.ts
NODE_REGISTRY: { ..., calendar: CalendarNode, text: TextNode, image: ImageNode }
NODE_TYPES:    { ..., calendar: createNodeAdapter(CalendarNode), text: createNodeAdapter(TextNode), image: createNodeAdapter(ImageNode) }
```

### Consequences

- Enables: arbitrary canvas widgets without needing a mother relationship; explicit edge visual semantics per edge instance.
- Forecloses: automatic edge style inference from node kinds (removed by design).
- `calendar`, `text`, and `image` emit no events in v1; edges from them are deferred to a later phase.

---

## Decision 15 — PomoNode Display Variants and node.setConfig Command

**Date:** 2026-05-10
**Status:** Accepted
**Author:** architect

### Context

The PomoNode's single visual (a circular ring countdown) was the only display option. The PRD's "local-first, yours to own" ethos implies users should be able to personalise their workspace. Five distinct display variants were designed: `ring` (default animated arc), `ascii` (text art), `lcd` (segmented digit display), `blocks` (block-progress bar), and `vapor` (vapourwave aesthetic). These are presentation differences only — they do not affect state or command surface.

Separately, there was no generic mechanism for the UI to patch a node's `config` without routing through a kind-specific command. Adding per-kind config commands for every configurable field would create boilerplate and require updating `commandDispatch` for every new config option.

### Decision

**Variants:** `PomoConfig` gains an optional `variant?: 'ring' | 'ascii' | 'lcd' | 'blocks' | 'vapor'` field (defaults to `'ring'` when absent). `PomoNode/index.tsx` switches on this field to render one of five sub-components (`VariantRing`, `VariantAscii`, `VariantLcd`, `VariantBlocks`, `VariantVapor`). Each variant receives identical props (`remainingMs`, `totalMs`, `status`, `label`) — the variant is a pure visual transformation of the timer state.

**node.setConfig:** A universal `node.setConfig` command is added to `commandDispatch`. When a node fires `onCommand('node.setConfig', { patch: { ... } })`, the dispatcher patches `node.config` with the provided object (shallow merge) and persists. This is intercepted before `applyCommand` so no kind-specific handler is needed. The Tweaks panel uses this to switch the PomoNode variant.

### Contract

```typescript
// src/renderer/components/nodes/PomoNode/types.ts — addition to PomoConfig
export interface PomoConfig {
  defaultDurationMin: number;
  defaultBreakMin: number;
  longBreakEvery: number;
  longBreakMin: number;
  variant?: 'ring' | 'ascii' | 'lcd' | 'blocks' | 'vapor'; // added
}

// commandDispatch.ts — universal config patch (fires before applyCommand)
if (command === 'node.setConfig') {
  const patch = args['patch'] as Record<string, unknown> | undefined;
  if (!patch) return;
  const newConfig = { ...(node.config as Record<string, unknown>), ...patch };
  updateNode(nodeId, { config: newConfig });
  // persist
  return;
}
```

**Tweaks panel** reads `selectedNodeId` from `boardStore`. If the selected node is `kind === 'pomo'`, it renders a variant picker that fires `onCommand('node.setConfig', { patch: { variant } })`. The panel also exposes global vibe and density controls (CSS `data-vibe` / `data-density` attributes).

**Variant sub-component contract:**

```typescript
interface PomoVariantProps {
  remainingMs: number;
  totalMs: number;
  status: PomoStatus;
  label: string;
}
// All five variants (VariantRing, VariantAscii, VariantLcd, VariantBlocks, VariantVapor)
// implement this interface. They are pure functions — no store access, no onCommand.
```

### Consequences

- Enables: per-node visual personalisation without touching state contracts; any future node kind can expose config via `node.setConfig` without changes to `commandDispatch`.
- Forecloses: variant-specific state (e.g., a `vapor` variant cannot store extra data — variants are presentation only).
- The `node.setConfig` pattern is intentionally generic; kind-specific validation of config values is deferred to v1.1 (Zod schemas per config type).

---

## Decision 16 — Full AI Orb Architecture

**Date:** 2026-05-10
**Status:** Accepted
**Author:** architect

### Context

The AI Orb was previously a monolithic component (`Orb/index.tsx`) with all state co-located in local React state. This made it impossible to test the conversation history independently, access orb state from other components, or wire up Brain/STT/TTS providers in Phase 5 without restructuring.

The orb needed a persistent position (survives panel open/close), an in-memory conversation history (cleared on session end, not persisted to `board.json`), and a surface for Brain/STT/TTS wiring in Phase 5.

### Decision

The Orb is split into four sub-components and a dedicated Zustand store:

- **`useOrbStore`** — Zustand slice managing: `state` (idle/listening/thinking/speaking), `messages` (in-memory conversation history), `suggestions`, `caption`, `micActive`, `panelOpen`, and `position`. Only `position` and `panelOpen` are persisted (via `zustand/middleware/persist` with `partialize`). Messages are intentionally in-memory only.
- **`OrbButton`** — the draggable floating button. Reads position and state from `useOrbStore`. Renders the pulsing orb SVG with state-driven glow filter.
- **`OrbPanel`** — slide-in panel rendered when `panelOpen` is true. Composes `OrbHistory` and `OrbForm`.
- **`OrbHistory`** — scrollable message list, reads `messages` from store.
- **`OrbSuggestions`** — chip row of quick-action suggestions, reads `suggestions` from store.
- **`OrbForm`** — text input for typed commands. Dispatches `addMessage` to store.

Brain/STT/TTS wiring is stubbed: `useOrbStore` exposes `setState`, `setCaption`, and `setMicActive` as the integration points for Phase 5 providers. The actual `BrainProvider`, `STTProvider`, and `TTSProvider` are not implemented in this phase.

### Contract

```typescript
// src/renderer/store/useOrbStore.ts
export interface OrbMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface OrbStore {
  state: 'idle' | 'listening' | 'thinking' | 'speaking';
  messages: OrbMessage[];
  suggestions: string[];
  caption: string;
  micActive: boolean;
  panelOpen: boolean;
  position: { x: number; y: number };

  setState: (s: OrbStore['state']) => void;
  addMessage: (m: OrbMessage) => void;
  clearMessages: () => void;
  setSuggestions: (s: string[]) => void;
  setCaption: (c: string) => void;
  togglePanel: () => void;
  setMicActive: (active: boolean) => void;
  setPosition: (pos: { x: number; y: number }) => void;
}

// Persistence: only position and panelOpen survive page reload.
// messages, state, caption, micActive are always reset to defaults.
partialize: (s) => ({ position: s.position, panelOpen: s.panelOpen })
```

**Phase 5 wiring points:**

- `STTProvider` will call `setState('listening')`, write transcript chunks to `setCaption`, then call `addMessage({ role: 'user', content })`.
- `BrainProvider` will call `setState('thinking')`, then `addMessage({ role: 'assistant', content })`.
- `TTSProvider` will call `setState('speaking')`, then `setState('idle')` on completion.

### Consequences

- Enables: independent testing of `useOrbStore` (195 tests added), accessing orb state from any component, clean Phase 5 wiring without restructuring.
- Forecloses: storing conversation history in `board.json` (by design — conversation is session-scoped, not board state).
- The monolithic `Orb/index.tsx` becomes a thin re-export after the split; it is retained for backward import compatibility.

---

## Decision 17 — Per-Instance Board Isolation

**Date:** 2026-05-10
**Status:** Accepted
**Author:** architect

### Context

The build is now developed across multiple **git worktrees** in parallel — `main` plus one or more feature worktrees (e.g. `feat/new-features`). Each worktree runs its own Electron dev server via `npm run dev`. They share the same source tree of `~/Documents/krnl0/`.

Two problems surfaced:

1. **Single shared `board.json`.** `BOARD_DIR` was hard-coded to `~/Documents/krnl0/`. Both worktrees read and wrote the same file. When `feat/new-features` (which knows the `calendar` / `text` / `image` node kinds) seeded those nodes into the board, then `main` was launched (which does **not** know those kinds), the heal-on-load path in `handlers.ts` (PR #63 on main) silently dropped the unknown nodes and persisted a stripped board. Re-launching the feature worktree found a board with its new nodes already gone — and the seed gate did not re-fire because the file still existed. The user's work appeared to vanish.
2. **Single shared Electron `userData`.** Both worktrees declared `name: "krnl0"` in `package.json`, so Electron's `app.getPath('userData')` resolved to the same `%APPDATA%\krnl0\` (and equivalent on macOS/Linux). LocalStorage, IndexedDB, GPU cache, and crash dumps were shared, compounding cross-worktree pollution.

A truly isolated dev workflow requires both surfaces to split per running instance.

### Decision

Board state is isolated per Electron app instance. The `BOARD_DIR` is derived as:

```ts
const BOARD_DIR = process.env.KRNL0_BOARD_DIR
  ?? join(homedir(), 'Documents', app.getName());
```

Two layers of isolation:

1. **Default — by `app.getName()`.** Electron returns the `name` field from `package.json`. Production main stays `krnl0`, so the default board path remains `~/Documents/krnl0/board.json` — **no breaking change for end-users**. Feature worktrees override `package.json#name` (e.g. `krnl0-newfeatures`), which automatically:
   - Routes the board to `~/Documents/krnl0-newfeatures/board.json`.
   - Splits Electron's `userData` to `%APPDATA%\krnl0-newfeatures\` (Electron uses `app.getName()` by default).
2. **Explicit — `KRNL0_BOARD_DIR` env var.** Highest precedence. Lets a developer point an arbitrary instance at any directory (e.g. `KRNL0_BOARD_DIR=D:\krnl0-experiment npm run dev`) without touching `package.json`. Useful for ad-hoc spikes, integration tests, or migration rehearsals.

### Conventions

- The `name` in `package.json` on `main` is **always** `krnl0`. End-user board path is locked to `~/Documents/krnl0/`.
- Long-lived feature branches that introduce schema-breaking node kinds **must** rename `package.json#name` (e.g. `krnl0-newfeatures`) so they cannot stomp on a developer's main board. This branch (`feat/new-features`) carries `name: "krnl0-newfeatures"` for that reason.
- Short-lived fix branches that don't add node kinds do **not** need to rename; their schema is identical to main, so sharing the board is safe.
- Tests and CI should set `KRNL0_BOARD_DIR` to a temp directory, never touching the user's real board.

### Consequences

- Enables: parallel development across worktrees without cross-contamination of board state, localStorage, or caches; safe coexistence of schema-incompatible branches.
- Forecloses: the simplification of "one board file per machine, period." A user running both `krnl0` (production) and a `krnl0-*` dev build will see two separate boards in `~/Documents/`. This is a feature for developers, but worth noting if a packaged variant ever ships.
- Existing user boards at `~/Documents/krnl0/board.json` continue to work unchanged on production builds.
- **Pre-merge checklist for this branch:** before `feat/new-features` merges to `main`, `package.json#name` must either be reverted to `krnl0` (so released builds use the canonical board path) or the rename must be intentionally adopted as a release-time signal — to be decided in the merge PR.
