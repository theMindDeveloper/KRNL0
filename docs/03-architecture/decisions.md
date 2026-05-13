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
const defaultShell = process.env.KRNL0_SHELL
  ?? (process.platform === 'win32'
        ? 'powershell.exe'
        : (process.env.SHELL ?? '/bin/zsh'));
```

**Why PowerShell, not cmd.exe.** Earlier revisions of this contract listed `process.env.COMSPEC ?? 'powershell.exe'` on Windows — `COMSPEC` resolves to `cmd.exe` on every default Windows install, so the "fallback" never triggered. This was changed (PR #71) after cmd.exe demonstrated several TTY-semantics problems through node-pty's ConPTY backend:

- cmd.exe ignores `0x7f` (DEL), forcing a renderer-side translation to `0x08` (PR #70). bash, zsh, and PowerShell all accept `0x7f` natively.
- cmd.exe is a 1985-era line-oriented batch interpreter, not a TTY-aware shell. Tab completion, history, ANSI colour, and Unicode are all degraded.
- `claude` and other modern CLIs assume a real shell environment.

PowerShell ships preinstalled on every supported Windows version (`powershell.exe` is Windows PowerShell 5.1; the newer `pwsh.exe` is PowerShell 7+ if separately installed). The user can override either by setting `KRNL0_SHELL=cmd.exe` (or `pwsh.exe`, or any other path) in their environment before launching the app.

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
- Native-module pain (rebuilds for Electron version) is concentrated in one place; the `@electron/rebuild` postinstall hook (Decision 18) absorbs it.

### Status: Re-affirmed 2026-05-10

**What happened.** Phase 2 implementation (commit `4fa99b63`) substituted Node's built-in `child_process.spawn` for `node-pty` in `src/main/ipc/handlers.ts`. The motivation was pragmatic: `node-pty` is a native module that needs a per-Electron-version rebuild, and at that moment the build pipeline did not have a postinstall hook wired up. `child_process` ships with Node and required no extra tooling, so it looked like a zero-risk shortcut to unblock the rest of Phase 2.

**Why it produced an unusable terminal.** `child_process.spawn` with `stdio: ['pipe', 'pipe', 'pipe']` does not allocate a pseudo-terminal. On Windows specifically, `cmd.exe` and `powershell.exe` detect the absence of a console (no ConPTY, no `isatty`) and switch to **non-interactive pipe mode**: line-buffered, no character echo, no readline editing, no ANSI cursor handling, no job-control signal forwarding. Verified on this branch by instrumenting the IPC chain — `stdin.write` returns `true`, the byte reaches the child, but stdout produces nothing visible until a full line + newline is buffered, and even then the input is never echoed. The user sees a black rectangle that "eats" keystrokes. This violates F9 (echo), F10 (backspace edits the buffer), F11 (Enter submits), F12 (arrow-key history / cursor nav), and F14 (`claude` interactive prompt). It also defeats the entire reason a terminal node exists per Decision 3 — `claude` cannot run without a TTY.

**Resolution.** Revert to the original Decision 12 contract: `node-pty` in main, `xterm.js` in renderer. Real ConPTY on Windows, real POSIX PTY on macOS / Linux. No pipe-mode fallback path — a fallback is what produced the bug, and "no terminal" is a clearer failure mode than "broken terminal."

**Install / rebuild expectation.** `node-pty` is added to `dependencies` (runtime, not dev — it is required at app start). `@electron/rebuild` is added to `devDependencies` and wired to a `postinstall` script that targets `node-pty` against the installed Electron version's ABI. Full mechanics in Decision 18.

**IPC contract — unchanged.** The channel names (`pty:create`, `pty:write`, `pty:resize`, `pty:kill`, `pty:data`, `pty:exit`) and their payload shapes as defined above are preserved verbatim. `node-pty` plugs in as a drop-in replacement for the `child_process` handlers because the data flow (write bytes / receive bytes / resize / kill) is identical at the IPC boundary. The renderer side does **not** change.

**Canonical session-key field name: `sessionId`.** Decision 12's contract names this `sessionId`. The requirements doc `docs/06-requirements/terminal-node.md` (F4, F5, F4b scenarios) uses `nodeId` for the same field — that is a documentation drift, not a contract change. The wire format remains `sessionId` and its **value** remains `node.id`. Backend-dev implements `sessionId` per this ADR; pm-docs is responsible for normalising the requirements doc in the same PR cycle so the two sources agree. No code rename is owed to the renderer or preload.

---

## Decision 17 — Per-Instance Board Isolation

**Date:** 2026-05-10
**Status:** Accepted
**Author:** architect

### Context

The build is now developed across multiple **git worktrees** in parallel — `main` plus one or more feature worktrees (e.g. `feat/new-features`). Each worktree runs its own Electron dev server via `npm run dev`. They share the same source tree of `~/Documents/krnl0/`.

Two problems surfaced:

1. **Single shared `board.json`.** `BOARD_DIR` was hard-coded to `~/Documents/krnl0/`. Both worktrees read and wrote the same file. When `feat/new-features` (which knows the `calendar` / `text` / `image` node kinds) seeded those nodes into the board, then `main` was launched (which does **not** know those kinds), the heal-on-load path in `handlers.ts` (PR #63) silently dropped the unknown nodes and persisted a stripped board. Re-launching the feature worktree found a board with its new nodes already gone — and the seed gate did not re-fire because the file still existed. The user's work appeared to vanish.
2. **Single shared Electron `userData`.** Both worktrees declare `name: "krnl0"` in `package.json`, so Electron's `app.getPath('userData')` resolved to the same `%APPDATA%\krnl0\` (and equivalent on macOS/Linux). LocalStorage, IndexedDB, GPU cache, and crash dumps were shared, compounding cross-worktree pollution.

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
- Long-lived feature branches that introduce schema-breaking node kinds **must** rename `package.json#name` (e.g. `krnl0-newfeatures`) so they cannot stomp on a developer's main board.
- Short-lived fix branches that don't add node kinds do **not** need to rename; their schema is identical to main, so sharing the board is safe.
- Tests and CI should set `KRNL0_BOARD_DIR` to a temp directory, never touching the user's real board.

### Consequences

- Enables: parallel development across worktrees without cross-contamination of board state, localStorage, or caches; safe coexistence of schema-incompatible branches.
- Forecloses: the simplification of "one board file per machine, period." A user running both `krnl0` (production) and a `krnl0-*` dev build will see two separate boards in `~/Documents/`. This is a feature for developers, but worth noting if a packaged variant ever ships.
- Existing user boards at `~/Documents/krnl0/board.json` continue to work unchanged on production builds.
- Renaming `package.json#name` on a feature branch is a one-line change but it **must** be reverted (or merged carefully) before that branch ships to users — otherwise the released build would silently look at a different board path.

### Update — 2026-05-13: Dev server port

The original decision isolated `board.json`, the assets folder, and Electron's `userData` per worktree, but missed a fourth surface: **the Vite dev-server port**. The gap manifested as a confusing developer-experience bug.

**Symptom.** A developer running `npm run dev` in two worktrees simultaneously saw identical UI in both Electron windows — same nodes, same layout, same edits reflected in both — and concluded the worktrees were sharing everything despite Decision 17. The board state on disk was in fact correctly isolated; the UI was not.

**Real cause.** Vite's dev server defaults to port `5173`. When a second `npm run dev` boots, Vite detects the port is busy and silently falls back to `5174`. But `src/main/index.ts` hard-codes `mainWindow.loadURL('http://localhost:5173')`. So worktree B's Electron main process loaded worktree A's renderer bundle. Two windows, one renderer, identical UI — even though each was reading/writing its own `board.json`. From the developer's seat this was indistinguishable from "they share state."

**Decision.** The dev-server port is also isolated per worktree, on the same model as `KRNL0_BOARD_DIR`.

- `scripts/dev.mjs` derives a deterministic port from the absolute worktree root:

  ```js
  const port = process.env.KRNL0_DEV_PORT
    ?? (5174 + (parseInt(sha1(worktreeRoot).slice(0, 8), 16) % 100));
  process.env.KRNL0_DEV_PORT = String(port);
  ```

  The hash makes the port stable across restarts of the same worktree (so DevTools, breakpoints, and bookmarks survive), and distinct across different worktrees (so two `npm run dev` invocations don't collide). A pre-set `KRNL0_DEV_PORT` wins — escape hatch for CI or manual overrides.

- `electron.vite.config.ts` reads `KRNL0_DEV_PORT` into `renderer.server.port` and sets **`strictPort: true`**. The strict flag is non-negotiable: without it Vite silently falls back to the next free port and reintroduces the exact bug this update fixes. A startup failure is the correct outcome if the chosen port is taken.

- `src/main/index.ts` reads the same env var when constructing the dev URL, falling back to `5173`:

  ```ts
  const devPort = process.env.KRNL0_DEV_PORT ?? '5173';
  mainWindow.loadURL(`http://localhost:${devPort}`);
  ```

### Conventions (port)

- Production builds and any `npm run dev` launched without `scripts/dev.mjs` continue to use port `5173`. No breaking change.
- The derived port range is `[5174, 5273]`. `5173` is intentionally reserved as the unisolated default so a bare `vite` invocation stays predictable.
- 100 slots over a typical working set of ~10 simultaneous worktrees yields ~1% collision probability per pair — acceptable. On a collision, `strictPort: true` will fail loudly at startup; rename the worktree directory or set `KRNL0_DEV_PORT` explicitly.

### Consequences (port)

- Enables: truly parallel `npm run dev` across worktrees. Each Electron window loads its own renderer bundle, matching the isolation guarantee already in place for `board.json` and `userData`.
- Forecloses: nothing. The change is purely additive — env-var-driven, with `5173` preserved as the default.

---

## Decision 18 — Native Module Rebuild Flow

**Date:** 2026-05-10
**Status:** Accepted
**Author:** architect

### Context

Decision 12 commits us to `node-pty`, a native (C++) Node.js module. Native modules are compiled against a specific V8 / Node ABI, and Electron ships its own embedded Node with an ABI that drifts from the host system Node a developer used to run `npm install`. A module built against system Node will throw `NODE_MODULE_VERSION mismatch` the moment Electron tries to `require` it, and the renderer / main process crashes at startup.

The Phase 2 deviation (`child_process` workaround, see Decision 12 Re-affirmation) was driven precisely by the absence of a rebuild story. We need a rebuild flow that is:

1. **Automatic on `npm install`** — a fresh clone produces a working terminal with no manual step. This is the binding NF5 requirement.
2. **Automatic on Electron version bumps** — `npm i electron@<new>` re-triggers a `node-pty` rebuild without the developer remembering to do anything. NF6.
3. **Loud on failure** — a rebuild that cannot succeed (no toolchain installed) must fail the install with a legible error, not silently leave a stale `.node` binary that crashes at runtime.
4. **Aligned with packaging** — `electron-builder`'s production pipeline already rebuilds native modules during `build`; the dev hook should not duplicate or fight that.

Two tools exist:

- **`electron-rebuild`** — the original package, now deprecated. The npm registry entry redirects users to the scoped fork.
- **`@electron/rebuild`** — the actively-maintained scoped fork under the official `@electron/` org. Same API surface, current Electron versions tested.

### Decision

Use **`@electron/rebuild`**. Wire it in via a `postinstall` script in `package.json`. `node-pty` itself is a runtime dependency, not a dev dependency.

Rationale for the tool choice:

- `@electron/rebuild` is the supported package; `electron-rebuild` (unscoped) is deprecated and unmaintained. Picking the deprecated package now would create a known-future migration cost for zero present benefit.
- Both packages expose the same CLI binary name (`electron-rebuild`) so existing scripts and docs that reference the binary remain valid.
- `electron-builder` already depends on `@electron/rebuild` transitively for its own packaging step, so adding it as a direct dev-dep does not bloat the dep tree.

Rationale for `dependencies` (not `devDependencies`) for `node-pty`:

- The compiled `.node` binary is required at app runtime. `electron-builder` only packages modules listed under `dependencies`. A dev-deps placement would silently produce an installer that crashes on first launch.
- `@electron/rebuild` is a build-time tool only — it stays in `devDependencies`.

### Contract

**`package.json` changes (binding for backend-dev):**

```jsonc
{
  "scripts": {
    // ...existing
    "postinstall": "electron-rebuild -f -w node-pty"
  },
  "dependencies": {
    // ...existing runtime deps
    "node-pty": "^1.0.0"
  },
  "devDependencies": {
    // ...existing dev deps
    "@electron/rebuild": "^3.6.0"
  }
}
```

The `electron-rebuild` binary is supplied by the `@electron/rebuild` package. Flags:

- `-f` (force) — rebuild even if a `.node` file is already present, so an Electron upgrade always re-compiles. This is what makes NF6 work without ceremony.
- `-w node-pty` — scope the rebuild to `node-pty`. Avoids accidentally rebuilding unrelated native deps that may live deeper in the tree.

**Behavioural rules:**

- `npm install` triggers `postinstall`, which compiles `node-pty` against the currently-installed Electron's ABI. NF5 is satisfied.
- `npm i electron@<new>` is treated by npm as an install operation — `postinstall` fires again, rebuild runs against the new ABI. NF6 is satisfied without a separate command.
- `electron-builder build` runs its own internal rebuild during packaging. The `postinstall` hook is a dev-time convenience and does not interfere with the builder's pipeline; the builder is the source of truth for the shipped binary.
- CI environments that run `npm ci` also fire `postinstall`. CI runners must have a C++ toolchain available (Visual Studio Build Tools on Windows, Xcode CLT on macOS, `build-essential` on Linux). This is a one-line documentation note in the README and a CI workflow concern; it is **not** grounds to add a fallback path.

**Failure mode (intentional, do not paper over):**

- If the C++ toolchain is missing, `postinstall` fails with a build error. `npm install` exits non-zero. The developer sees the failure immediately rather than at runtime. This is the correct behaviour: a compiled native dep cannot be substituted at runtime, and a `child_process` fallback is precisely the trap that produced the original bug. Document the toolchain prerequisites in `docs/05-node-system/node-spec.md` (per NF7) including Windows/Mac/Linux setup steps and the most common error signatures.

**Out of scope (explicitly rejected):**

- A pure-JS pty shim or a `child_process` fallback when native build fails. Rejected — degrades to pipe mode, fails F9–F14, reproduces the bug we are fixing.
- Pre-built binaries via `prebuild-install` / `node-gyp-build`. Could be revisited later as an optimisation, but adds a hosting concern (where do the prebuilds live?) and `node-pty` upstream's prebuild coverage is incomplete for Electron ABIs. Default to source rebuild for v1.

### Architect sign-off

Backend-dev is cleared to proceed if and only if **all** of the following hold:

1. Changes are confined to **`src/main/ipc/handlers.ts`** (replace `child_process.spawn` usage with `node-pty.spawn`, preserving the `pty:create` / `pty:write` / `pty:resize` / `pty:kill` / `pty:data` / `pty:exit` channel names and payload shapes from Decision 12 verbatim) and **`package.json`** (add `node-pty` to `dependencies`, `@electron/rebuild` to `devDependencies`, add the `postinstall` script per the contract above). A regenerated `package-lock.json` is expected.
2. **No** changes to `src/renderer/**`, `src/preload/**`, `src/shared/types/ipc.ts`, or any IPC channel name. The wire field name remains `sessionId` (Decision 12); the renderer side is untouched.
3. The session validation rule from Decision 12 ("main process **must** validate that `sessionId` is a known nodeId in the current board before honoring `pty:write` / `pty:resize` / `pty:kill`") is preserved — the existing `child_process`-based validation logic must port over, not be deleted.
4. `before-quit` cleanup that iterates the pty Map and kills all sessions is preserved (Decision 12 Lifecycle step 7).
5. The default-shell selection rule (Decision 12: `process.env.COMSPEC ?? 'powershell.exe'` on win32, else `process.env.SHELL ?? '/bin/zsh'`) is preserved. `cwd` defaults to home.
6. After implementation, `npm install` from a clean clone on Windows (the developer's primary platform) produces a working terminal with no extra commands. `npm run typecheck` is zero errors. Tests added by tester for F9–F15 pass.

If any of (1)–(5) cannot be met without breaking the contract, backend-dev escalates back to architect before merging — do not silently widen the surface.

### Consequences

- Enables: a native PTY on every supported platform, real interactive shells, `claude` running inside the terminal node (closing Decision 3's loop), and frictionless Electron version upgrades.
- Forecloses: zero-toolchain installs. A developer on a locked-down corporate machine without C++ build tools cannot run KRNL0 from source. Acceptable tradeoff — the alternative (pipe-mode fallback) is what got us here.
- Concentrates native-module risk in one dep (`node-pty`) and one tool (`@electron/rebuild`). Future native deps follow the same pattern by extending `-w node-pty` to `-w node-pty -w <new-dep>`.
- pm-docs follow-up: normalise `nodeId` → `sessionId` in `docs/06-requirements/terminal-node.md` (F4, F4b, F5, F5b) so the requirements doc matches Decision 12's wire contract.

---

## Decision 19 — TerminalNode UX hardening (Backspace, Ctrl+C, cwd, GPU rendering)

**Status:** Accepted — 2026-05-10
**Closes:** #72, #73, #74, #75
**Supersedes:** the `0x7f → 0x08` translation introduced in PR #70

### Context

Once Decision 12 + 18 landed and PowerShell became the default Windows shell (PR #71), four follow-on issues surfaced from real use of `claude` inside the terminal node:

1. **Backspace stopped working.** PR #70 had translated xterm's `0x7f` (DEL) to `0x08` (BS) so cmd.exe would erase characters. PowerShell, bash, and zsh all expect `0x7f`; the translation made the new default unusable.
2. **Claude Code TUI was visibly laggy** and dropped keystrokes. xterm's default DOM renderer thrashes layout under heavy ANSI redraws.
3. **`cwd = USERPROFILE`** meant `claude` couldn't see `CLAUDE.md`, `board.json`, or any project file without a manual `cd`.
4. **Ctrl+C did nothing.** Running processes (e.g. `Start-Sleep`, `claude`'s long operations) couldn't be interrupted.

### Decision

Four targeted changes, all narrow:

1. **Remove the 0x7f → 0x08 translation.** The xterm `onData → ptyWrite` path passes bytes through verbatim. PowerShell/bash/zsh handle DEL natively. Users on `KRNL0_SHELL=cmd.exe` accept that Backspace will not work in cmd.exe — that is cmd.exe's own line-discipline limitation, and we no longer warp the byte stream to paper over it.
2. **GPU-accelerated xterm renderer.** The renderer dynamically imports `@xterm/addon-webgl` (preferred) and falls back to `@xterm/addon-canvas` if WebGL context creation fails. DOM is the last-resort fallback. Dynamic import keeps these browser-only modules out of Node test environments.
3. **PTY `cwd` defaults to `process.cwd()`** — the project root in dev (electron-vite is launched from there), the resources dir in a packaged build. `KRNL0_TERM_CWD` env var overrides. Falls back to `USERPROFILE` / `HOME` / `homedir()` only if the chosen path doesn't exist.
4. **Explicit Ctrl+C handler via `term.attachCustomKeyEventHandler`.** With a selection: copy to clipboard via `navigator.clipboard.writeText`, clear selection, return `false`. Without a selection: write `\x03` to the PTY directly, return `false`. We do not rely on xterm's variable default behaviour, which can drop `0x03` when the helper textarea loses focus mid-press.

### Consequences

- **Enables:** real Backspace on the new default shell; smooth `claude` TUI rendering; CLAUDE.md / board.json reachable from the terminal without `cd`; interruptible processes.
- **Forecloses:** Backspace inside cmd.exe (when explicitly opted into via `KRNL0_SHELL`). Acceptable — cmd.exe is no longer the default and the translation hack was always shell-conditional anyway.
- **GPU dependency:** WebGL needs a working OpenGL/ANGLE context. On Windows under Electron this is provided by ANGLE; failure paths are fully covered by Canvas → DOM fallbacks, so there is no hard runtime dependency.
- **`process.cwd()` semantics in packaged builds:** in a packaged Electron app `process.cwd()` is the install directory, not the project source. Users who want a stable cwd for `claude` set `KRNL0_TERM_CWD` explicitly. Documented in [docs/06-requirements/terminal-node.md](../06-requirements/terminal-node.md).


## Decision 14 — HabitNode v2 (color, multi-view, past backfill, settings popover, sys wiring)

**Date:** 2026-05-12
**Status:** Accepted
**Author:** architect
**Supersedes:** §"Contract" of Decision 11 (schema additions); leaves Decision 11's
sparse-log semantics, derived week grid, and streak rules unchanged.

### Context

Decision 11 fixed the data model but left v1 with: a single weekly view, no
per-habit identity beyond name + glyph, no settings UX, and no UI affordance for
back-dating completions. v2 (this decision) lands the full feature set the user
asked for: add/delete habits, pin any past day, three views (week/month/year),
a settings gear at top-right, per-habit color from the fixed cyber palette, and
end-to-end persistence — through both the renderer and the sys CLI.

### Decision

Extend the habit schema with two additive fields and one config field. Every
mutation routes through pure command handlers (renderer or sys CLI) into
`board.json` via the shared persistence module. No fake state, no hidden
ephemeral data.

**Schema additions** (back-fill at render and at load, see Migration):

```typescript
export type HabitColor = 'acid' | 'rust' | 'cyan' | 'plum' | 'spine' | 'ink';
export type HabitView  = 'week' | 'month' | 'year';

export interface Habit {
  id: string;
  name: string;
  createdAt: string;
  log: string[];
  archived: boolean;
  color: HabitColor;          // NEW — default 'acid'
}

export interface HabitConfig {
  weekStartsOn: 'monday';
  view: HabitView;            // NEW — default 'week'
  maxHabits?: number;         // tolerated legacy seed field; no enforcement
}
```

**New commands:**

| Command | Target | Args | Effect |
|---|---|---|---|
| `habit.setColor` | state | `{ id, color }` | set color (no-op on unknown color) |
| `habit.setView`  | config | `{ view }`     | switch view (no-op on unknown view) |

`habit.toggleDay` hardens its guard: **future dates are no-ops; past dates are
always accepted** (including dates before `createdAt`, so users can back-fill
habits they began tracking late — the user-stated rule "regardless if it's in
the past, but the future is not allowed").

**Dispatcher contract change:** `applyCommand` in
`src/renderer/components/Canvas/commandDispatch.ts` returns
`{ state?, config? } | null` instead of `Node['state'] | null`. `makeCommandHandler`
applies whichever keys are present in a single `updateNode` call. This
generalisation is node-agnostic; only Habit uses it today.

**Settings popover (F9–F13):** a gear button in the node header toggles an
inline popover absolutely-positioned inside the node body. The popover contains
a segmented view toggle and a list of habits, each with a color swatch (click
to open a 6-dot picker) and a delete (×) button. Click-outside-to-close via a
`mousedown` listener on `document` filtered by the popover's container ref.
No react-portal — the popover clips with the node card.

**View layouts (F15):**

| View | Layout | Cell size × gap | Total grid width |
|---|---|---|---|
| Week | inline glyph + name + 7-cell row + streak | 18px × 3px | 144px |
| Month | name+streak header line + single-row month grid | 10px × 1px | 28–31 cells, ≤340px |
| Year | name+streak header line + 53×7 contribution grid | 5px × 1px | 53 cols × 7 rows |

Mother content width is 346px (`MOTHER_WIDTH 380` − 32 padding − 2 border).
All views fit.

**Sys CLI (F17):** `src/sys/commands/habit.ts` is wired end-to-end via the
shared persistence module `src/main/persistence/board.ts`. Commands resolve
habits by id (exact) or case-insensitive name; ambiguous names → error.
Verbs: `add`, `done`, `streak`, `color`, `remove`, `view`, `list`. `SysFacade`
takes a `{ boardPath, hasOpenRenderer, onBoardChanged }` deps bundle so the
same code works from both `ipcMain.handle('sys:run')` (Electron renderer
present → broadcast `board:reload`) and the standalone CLI entry
(`src/sys/index.ts`, renderer absent → write disk only).

### Migration

Two-stage, render-time fallback + load-time back-fill:

1. **Render-time fallback** — `habit.color ?? 'acid'` and `config.view ?? 'week'`
   keep the v1 UI alive against an unmigrated `board.json`.
2. **Load-time back-fill** — `loadBoardFrom()` in the shared persistence module
   patches missing `color` on each habit (defaulting to `'acid'`) and missing
   `view` on the habit mother config (defaulting to `'week'`). The first save
   after a load writes the resolved defaults back to disk, so reads converge to
   the schema.

No imperative migration pass is required; this is consistent with how Decision
17 handles per-instance isolation (write fresh, read tolerant).

### Consequences

- **Enables:** add/delete habits via UI and sys; back-fill any past day; persistent
  per-habit colors used as the done-cell fill; per-node view selection that
  survives reloads; full sys-CLI parity with the GUI (rule §8 in CLAUDE.md).
- **Forecloses:** custom colors outside the 6-token palette (intentional — keeps
  the visual system coherent). Per-day intensity is still ruled out by
  Decision 11.
- **Risks resolved:**
  - View-vs-state dispatch — generalised dispatcher return type.
  - Sys/renderer race — `onBoardChanged` broadcasts `board:reload` to open
    renderers after a sys write.
  - Popover clipping — popover lives inside the body, no portal.
  - Future-date toggling via sys — blocked at the FSM level.
  - Color-as-sole-signal — done cells retain the existing outline/ring;
    selected swatch in the picker is identified by a paper inset border,
    not by color alone.

---

## Decision 20 — Todo/Task bidirectional linkage + TaskNode FSM

**Date:** 2026-05-12
**Status:** Accepted
**Closes:** #80 (todo-task-nodes feature branch)

### Context

Tasks are spawned from TodoItems when a user adds a task in the TodoNode. Previously `TodoItem` had no back-link to the spawned `TaskNode`, and `TaskState` had no back-link to the `TodoItem`. This meant done-state mirroring, cascade-deletes, and pomo-triggering from the todo row all required scanning the full board — brittle and inconsistent.

### Decision

**Two new fields on `TodoItem`:**
```typescript
taskNodeId: string | null  // null until a task node is spawned
```

**Three new fields on `TaskState`:**
```typescript
parentTaskId: string | null      // null = root task; else parent task node id (for subtasks)
todoItemId: string | null        // back-link to the TodoItem.id that spawned this task
pomoSessionsCompleted: number    // count of completed pomo sessions for this task (default 0)
```

**Invariants (Decision 20 contract):**
1. When `todo.add` spawns a TaskNode, `item.taskNodeId = taskNode.id` and `taskState.todoItemId = item.id` are set atomically in the same store transaction.
2. `task.toggle` → if `todoItemId !== null`, mirror done state to the linked `TodoItem` (no loop: check `item.done !== nextTask.done` before mirroring).
3. `todo.toggle` → if `item.taskNodeId !== null`, mirror done state to the linked `TaskNode`.
4. `task.delete` BFS-collects the node + all descendants (via `parentTaskId` chain), removes them all + incident edges, then removes the linked `TodoItem` (if `todoItemId !== null`), then renumbers siblings.
5. `todo.remove` cascades to the linked `TaskNode` + all descendants before removing the `TodoItem`.
6. `todo.clearDone` cascades all done items' TaskNodes.
7. `task.startPomo` / `task.spawnPomo` finds the single `kind === 'pomo'` mother node and calls `pomoStart` — never duplicates it.
8. `todo.startPomoForItem` resolves `item.taskNodeId → taskNode → task.startPomo`.
9. `task.addSubtask` spawns a child TaskNode with `parentTaskId = parentNodeId` and `layer = parent.layer + 1`; `todoItemId` is null for subtasks.
10. Sibling sequence numbers are 1-based, sorted ascending by `createdAt`, scoped to `{parentTodoId, parentTaskId}`.

**Pure FSM handlers added:**
- `TaskNode/commands.ts`: `taskToggle`, `taskEdit`, `taskIncrementPomo`, `taskActivate`
- `TodoNode/commands.ts`: `todoLinkTask(state, {itemId, taskNodeId}) => TodoState`

**UI affordances:**
- `TaskNode`: body click triggers `task.startPomo` (drag-safe: only fires if mouseup delta < 4px); right-click opens `ContextMenu` with Edit / Add subtask / Delete items; inline edit on double-click; add-subtask input below footer; opacity 0.4 when done.
- `TodoNode`: row right-click opens `ContextMenu` with Edit / Start pomo (disabled when no linked task) / Delete; clicking the todo-text of a linked item dispatches `todo.startPomoForItem`.

**sys CLI additions:**
- `sys task add <text> [--todo <todoId>] [--duration <min>]`
- `sys task edit <id> <text>`
- `sys task toggle <id>`
- `sys task delete <id>`
- `sys task pomo <id>`
- `sys task subtask <parentId> <text>`
- `sys task list [<todoId>]`
- `sys todo add/check/list` — replaced stubs with real board.json operations.

### Consequences

- **Enables:** bidirectional done mirroring; cascade-delete; per-task pomo sessions; subtask nesting; full CLI parity for tasks.
- **Forecloses:** detached task nodes (every task with a `todoItemId` has a corresponding `TodoItem`; orphan cleanup is handled at delete time).
- **Migration:** existing `board.json` task nodes missing `parentTaskId`/`todoItemId`/`pomoSessionsCompleted` are backfilled by the board load migration in `src/main/persistence/board.ts` (via `STATE_DEFAULTS['todo.task']` entry — to be added if needed). Runtime access on unmigrated nodes defaults gracefully via `?? null` / `?? 0` guards.

---

## Decision 21 — Asset persistence and the `krnl-asset://` protocol

**Status:** Accepted — 2026-05-12
**Closes:** TextNode / ImageNode upgrade (PR #88)
**Related:** Decision 5 (board.json as singleton source of truth), Decision 13 (RF + boardStore adapter)

### Context

The TextNode and ImageNode shipped as read-only placeholders. To make them honest first-class nodes — editable, resizable, connectable, and (for images) drag-droppable — three new capabilities were needed:

1. **Per-node sizing.** Up to now every node had a fixed CSS width and no persisted height. Resizable nodes must round-trip their dimensions through `board.json`.
2. **Real image persistence.** Embedding bytes as base64 inside `board.json` was rejected outright — it would bloat the file, make diffs unreadable, and violate the "no fake functionality" rule in CLAUDE.md. The honest design is files-on-disk.
3. **A cheap way for `<img>` to fetch those bytes.** IPC-per-render would force every image to re-decode on every React render. A protocol handler is the canonical Electron pattern.

### Decision

**1) Width/height live in `state`.** New optional fields `state.width?: number` and `state.height?: number` for any resizable node (currently TextNode and ImageNode). Absent values render with kind-specific defaults. The kernel does NOT migrate or rewrite the absence on load — round-trip `load → save → byte-identical` (modulo `savedAt`) is preserved per Decision 5.

**2) Assets live in `<BOARD_DIR>/assets/<ULID>.<ext>`.** `<BOARD_DIR>` defaults to `~/Documents/krnl0/` and is overridable via `KRNL0_BOARD_DIR` (parallel to Decision 17 / per-instance isolation). The ID is a 26-character Crockford-base32 random string (ULID-shaped). The on-disk filename carries the extension so the protocol handler can serve the correct `Content-Type` without re-sniffing bytes.

**3) `asset:write` validates magic bytes per extension.** Whitelist: png, jpg/jpeg, webp, gif, svg. Magic-byte signatures are checked before the file is written. SVG additionally rejects any input containing `<script`, `onload=`, `onerror=`, or `onclick=` (case-insensitive) — this prevents JS execution under the privileged protocol origin. Maximum size: 25 MB.

**4) The `krnl-asset://<assetId>` protocol is registered as a privileged scheme.** Registration happens in two phases:
   - `protocol.registerSchemesAsPrivileged([{ scheme: 'krnl-asset', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: false } }])` is called **before** `app.whenReady()`. Chromium requires this ordering — privileges declared after whenReady are silently ignored.
   - `protocol.handle('krnl-asset', ...)` is called inside `whenReady`. The handler streams the file body with the correct `Content-Type` header. Unknown / invalid ids return a 1×1 transparent PNG so `<img onError>` can swap to a placeholder visual without a render crash.

**5) Edge semantics for visual connections.** Text and image nodes have no domain events or commands of their own, but the user wants to draw arrows between them. New convention: when the user drags a Handle between two non-mother nodes, the resulting edge carries `from.event = 'link'`, `to.command = 'link'`. The kernel does NOT dispatch anything on a `'link'` event — these edges are purely visual relations. Documented as the v1 default; richer typed connections are a follow-up.

**6) `board:changed` IPC channel.** `sys` commands run in the main process and mutate `board.json` directly. So the renderer can reflect those mutations without a manual refresh, main emits `board:changed` to every BrowserWindow after every sys-driven write. The renderer's `useBoardChannel` hook re-runs `boardLoad` and pushes the result into the Zustand store.

### Consequences

- **board.json stays small and human-readable.** A board with twenty 4 MB photos is ~6 KB of JSON; the photos are 80 MB on disk in `assets/`. Diffs of board.json show layout and intent, not byte streams.
- **Drag-drop is one of the most reachable features in the app.** Drop a PNG anywhere on the canvas → ImageNode appears at the drop position with the image rendered via `krnl-asset://<id>`. No clipboard dance, no upload UI, no fakery.
- **Cross-platform without conditionals.** All paths route through Electron's `protocol` API — no `file://` URLs, no per-OS path normalisation in the renderer.
- **Mother nodes remain non-connectable.** Handles are conditionally rendered based on `!isMother`; only non-mother↔non-mother visual edges are wireable in v1.
- **Known limitations / followups:**
  - No asset GC. Replacing an image leaves the old file on disk. Track as `image-asset-gc`.
  - No paste-from-clipboard / drag-from-browser-URL. v1 is file-only.
  - SVG sanitiser is a string scan, not a DOM parser. The four-pattern blocklist (`<script`, `onload=`, `onerror=`, `onclick=`) covers the obvious vectors; a future hardening pass could use DOMPurify or a real XML reader.

> **Renumber note:** this ADR was authored as "Decision 20" on `feat/text-image-nodes`, which branched before `feat/todo-task-nodes` (also Decision 20) merged. Renumbered to 21 on merge — no design change.
