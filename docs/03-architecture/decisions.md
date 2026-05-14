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
**Status:** Accepted (superseded in part by Decision 22 — see below)
**Author:** architect

> **Update 2026-05-13:** Decision 22 adds `activeTaskId: string | null` to `PomoState`, canonicalises `PomoConfig` to `{ sessionMin, shortBreakMin, longBreakMin, longBreakEvery }`, and changes `pomoComplete` to branch break length on `(sessionsCompleted + 1) % longBreakEvery`. The FSM, transitions, and persistence rule below are otherwise unchanged.

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

## Decision 22 — Pomodoro v2: gear settings, active-task mode, per-task time tracking

**Status:** Accepted — 2026-05-13
**Closes:** Pomodoro feature spec (this PR)
**Related:** Decision 9 (PomoNode v1 FSM), Decision 20 (Todo/Task linkage)

### Context

The v1 PomoNode (Decision 9) is a global, label-driven timer with no concept of which task it is for. Configuration values exist on `PomoConfig` but have no UI to edit them — and the seed in `seedBoard()` writes a *different* config shape (`{ shortBreakMin, longBreakMin, sessionsUntilLongBreak }`) than `defaultPomoConfig()` produces (`{ defaultDurationMin, defaultBreakMin, longBreakEvery, longBreakMin }`). Long-break branching is also missing: `pomoComplete` ignores `longBreakEvery` and always uses `breakMin`.

The user wants three things:

1. A **gear settings panel** on the PomoNode for editing session length, short break, long break, and long-break cadence.
2. **Per-task pomodoro mode**: when a task is clicked, the PomoNode adopts that task's `plannedMin`, derives the session count from `ceil(plannedMin / sessionMin)`, and visualises the relationship via a circular highlight on the active task plus a corner timer showing time-on-task.
3. A **default mode** when no task is active — same node, same FSM, just no `activeTaskId` and no derived plan.

### Decision

#### 1. Single `PomoConfig` schema (canonical)

```typescript
export interface PomoConfig {
  sessionMin: number;       // length of one focus session (default 25)
  shortBreakMin: number;    // default 5
  longBreakMin: number;     // default 15
  longBreakEvery: number;   // long break after every N completed sessions (default 4)
}
```

`board.ts` `CONFIG_DEFAULTS['pomo']` is added so older boards (with either the seed shape or the v1 `defaultPomoConfig` shape) are healed at load:

- `shortBreakMin ← shortBreakMin ?? defaultBreakMin ?? 5`
- `longBreakMin ← longBreakMin ?? 15`
- `longBreakEvery ← longBreakEvery ?? sessionsUntilLongBreak ?? 4`
- `sessionMin ← sessionMin ?? defaultDurationMin ?? 25`

The legacy field names are not re-written on save (Decision 5 lossless round-trip), but they are *also* not consulted at runtime once the canonical fields are present.

#### 2. `PomoState` adds one field

```typescript
export interface PomoState {
  status: 'idle' | 'running' | 'break' | 'done';
  startedAt: string | null;
  durationMin: number;             // length of the *current* session; written on start
  breakMin: number;                // length of the *current* break; written on complete
  label: string;
  sessionsCompleted: number;
  activeTaskId: string | null;     // NEW — which task this session belongs to (null = default mode)
  history: PomoSessionRecord[];
}
```

`activeTaskId` is the **only** new persisted field on PomoState. It lives on PomoState (not on boardStore) because the pomo node is the sole consumer and storing it elsewhere creates stale-reference bugs across reloads.

#### 3. `TaskState` adds two fields

```typescript
export interface TaskState {
  // ...existing fields...
  plannedMin: number;              // NEW — total minutes the user budgeted for this task
  secondsAccumulated: number;      // NEW — total seconds spent on this task across sessions (persisted)
}
```

`durationMin` already exists on TaskState; it now means "default per-session minutes used when this task is loaded into the pomo." On task creation it is initialised from `pomoConfig.sessionMin`. `plannedMin` is parsed from the user's input (see §6) or defaulted to `sessionMin`.

`pomoSessionsCompleted` (Decision 20) remains and is incremented only when a session for this task completes.

#### 4. Derived (NOT stored) values

- `plannedSessions = max(1, ceil(plannedMin / sessionMin))`  — recomputed at render time. Survives gear-setting changes with no migration.
- `nextBreakIsLong = (sessionsCompleted + 1) % longBreakEvery === 0` — drives which break length `pomoComplete` writes into `state.breakMin`.

#### 5. Activation flow (clicking a task)

Click on a task (body click) or on a linked todo row dispatches `task.startPomo` / `todo.startPomoForItem`. The dispatcher follows this state-change order:

1. If `pomoState.activeTaskId !== null` and `pomoState.status === 'running'`, **commit elapsed** to the old active task's `secondsAccumulated`. The old session is recorded in `history` as cancelled.
2. Set `pomoState.activeTaskId = newTaskId`.
3. Load task settings into pomo: `label = task.text`, `durationMin = task.durationMin`, `breakMin = pomoConfig.shortBreakMin`.
4. If the caller is a *click-to-activate* (no `--start` flag), pomo goes to `status: 'idle'` with the task loaded — user still has to press START. If the caller is `task.startPomo` (body click on task), it goes straight to `running`.
5. Pomo node header updates to show task label and `session N/M` where M = `plannedSessions`.

Clicking the gear icon or the pomo background clears `activeTaskId` to `null` ("default mode").

#### 6. Time input on task creation

The TodoNode add-task row gains a small minutes input adjacent to the text input:

```
[ task text...... ] [  m ]  ↵
```

The minutes input defaults to `pomoConfig.sessionMin`. On `Enter`, the dispatcher passes `{ text, plannedMin }` to `todo.add`, and `commandDispatch` spawns the TaskNode with that `plannedMin`. As a fallback, free-form text matching `/,\s*time:\s*(\d+)\s*(min|m|minutes)?/i` is also parsed (so the user can type `"homework, time: 40"` in the text-only field). The structured input takes precedence.

#### 7. Long-break branching in `pomoComplete`

When `pomoComplete` fires:

- `sessionsCompleted++`
- If `sessionsCompleted % longBreakEvery === 0`, write `breakMin = longBreakMin`. Otherwise `breakMin = shortBreakMin`.
- If `activeTaskId !== null`, the task's `secondsAccumulated += durationMin * 60` and `pomoSessionsCompleted++`.

#### 8. UI affordances

- **Gear icon**: top-left of the PomoNode header, opens an inline panel inside the node body (replacing the vapor tube while open). Panel fields: session, short break, long break, long-break-every. Save persists via `pomo.setConfig`. Cancel restores.
- **Active-task circular highlight**: when `pomoState.activeTaskId === task.id`, the TaskNode root gains `class="active"`, which renders an animated 1.5px acid-coloured ring (`box-shadow: 0 0 0 2px var(--acid), 0 0 24px var(--acid-glow)`).
- **Corner timer**: top-left of TaskNode body. Shows `formatHMS(secondsAccumulated + liveDelta)` where `liveDelta` is `(now - pomo.startedAt) / 1000` when this task is the active running one, else `0`. One `setInterval` lives inside the TaskNode (only mounted when active or has accumulated time > 0); the rest of the time it's a static derived value.

### Consequences

- **Enables**: editable gear settings, automatic long breaks, per-task time accounting, dynamic pomo refresh on task click, derived session count without state writes.
- **Forecloses**: a global "pause" state (pause is still cancel-and-resume).
- **Migration**: covered by `STATE_DEFAULTS['pomo']` (adds `activeTaskId: null` if absent), `CONFIG_DEFAULTS['pomo']` (unifies the config shape), and `STATE_DEFAULTS['todo.task']` (adds `plannedMin` defaulted to `durationMin`, and `secondsAccumulated: 0`).
- **Tick rule preserved**: pomo state is still derived from `now - startedAt`. The corner timer adds *one* `setInterval` per active task — bounded by `activeTaskId === 1` invariant.
- **R9 (lossless restart) preserved**: a running session restored from disk re-derives the timer and the active task label as before. `secondsAccumulated` is committed on cancel/complete only, so a crash mid-session loses only the in-flight delta — same as v1.

---

## Decision 22.1 — Pomodoro v2 bug-fix pass (pause status + per-task checkpoint)

**Status:** Accepted — 2026-05-13
**Closes:** Follow-up to PR #90 (Decision 22). 9 user-reported bugs + 3 audit-discovered adjacencies.
**Related:** Decision 22 (Pomodoro v2 baseline), Decision 9 (PomoNode FSM).

### Context

PR #90 shipped Decision 22 (gear settings, active-task mode, per-task time tracking). The user ran `npm run dev` against the worktree and filed 9 bugs, all confirmed by audit, plus 3 adjacent defects bundled into the same pass. Most are corrected behaviour of features that shipped half-formed in Decision 22 — the task body click that auto-started instead of loading, the PAUSE button that cancelled instead of pausing, the pip count that overflowed, the ETA badge that was not editable, and the session-length that ignored the task's `plannedMin`. One defect (pause status) is genuinely new FSM territory: Decision 22 explicitly foreclosed a global pause state; this amendment reverses that decision by introducing `'paused'` as a first-class FSM status with `pausedAt` / `pausedElapsedMs` so the clock can freeze without writing a history record. The 4-agent team (FSM → dispatcher → UI → tester → pm-docs) executed the full pass on the same branch as PR #90. All 9 user-reported stories are now Gherkin scenarios in CI.

### Decision

1. **`PomoStatus` adds `'paused'`.** `PomoState` gains `pausedAt: string | null` and `pausedElapsedMs: number`. `pomoPause` snapshots elapsed; `pomoResume` offsets `startedAt` so the existing `now - startedAt` derivation continues to work without code change. `pomoCancel` accepts both `running` and `paused`; for paused, `endedAt` in the history record is `pausedAt` (truthful — moment activity stopped).
2. **`TaskState` adds `currentSessionElapsedSec: number`.** Per-task in-flight session checkpoint. Written when a task is swapped out (live elapsed → checkpoint). Restored when re-activating that task (checkpoint → pomo `pausedElapsedMs` and offset `startedAt`). Cleared on `pomo.cancel` / `pomo.complete` after the final commit to `secondsAccumulated` (the no-double-count invariant).
3. **New commands:** `pomo.pause`, `pomo.resume`, `task.loadIntoPomo` (no auto-start), `task.setCurrentSessionElapsedSec`, `task.clearCurrentSessionElapsedSec`.
4. **`loadTaskIntoPomo(taskId, { autoStart })`** in dispatcher unifies activation. `task.startPomo` / `task.spawnPomo` / `todo.startPomoForItem` use `autoStart: true`; the new `task.loadIntoPomo` (dispatched on TaskNode body-click) uses `autoStart: false`.
5. **Session-length clamp.** Per-session `durationMin = max(1, min(plannedMin - pomoSessionsCompleted * sessionMin, sessionMin))`. So `plannedMin=1, sessionMin=10` → one 1-min session; `plannedMin=35, sessionMin=10` after 3 sessions → 5-min final session.
6. **Cascades extended:** `task.toggle` cancels the active session when a running task is marked done AND commits the elapsed time inline into `secondsAccumulated` (the dispatcher branch that normally does this is bypassed when `pomoCancel` is called directly from the toggle path). `task.delete` clears `activeTaskId` and cancels pomo when the deleted task was active.
7. **UI:** Gear icon top-right and disabled while busy; PAUSE/RESUME wiring; pip count capped at 8 (with "+N more"); per-active-task session counter; TaskNode body-click loads without starting; double-click ETA opens inline `task.setPlannedMin` input.

### Consequences

- Restores the user's intuitive flow: click loads, START starts, PAUSE pauses (no data loss), task switches preserve per-task progress.
- Forecloses: auto-completing a paused session (must resume first).
- Migration: `STATE_DEFAULTS` extensions for `pomo` (`pausedAt: null, pausedElapsedMs: 0`) and `todo.task` (`currentSessionElapsedSec: 0`) — pre-v2.1 boards backfill via the existing `migrateNodeStates` spread.
- No double-counting invariant pinned by test: `start → run 60s → cancel` produces `secondsAccumulated === 60` and `currentSessionElapsedSec === 0`.

### Bug table (9 user-reported + 3 adjacencies)

| # | Bug | Root cause | Fix file |
|---|---|---|---|
| 1 | Gear icon top-left instead of top-right | Gear was the first flex child with no `marginLeft: auto` | `PomoNode/index.tsx` |
| 2 | Clicking a task auto-starts the pomo | Body click dispatched `task.startPomo` → `pomoStart()` with no "load only" path | `TaskNode/index.tsx`, `commandDispatch.ts` |
| 3 | Marking active running task done does not stop the timer | `task.toggle` cascade never inspected `pomo.activeTaskId` | `commandDispatch.ts` |
| 4 | PAUSE button resets instead of pausing | No `'paused'` FSM status; button dispatched `pomo.cancel` | `PomoNode/commands.ts`, `PomoNode/index.tsx` |
| 5 | `plannedMin` not editable after creation | `task.setPlannedMin` handler existed but no UI invoked it | `TaskNode/index.tsx` |
| 6 | State does not refresh on task click | Same root cause as #2 | `TaskNode/index.tsx`, `commandDispatch.ts` |
| 7 | 1-min task gets a 10-min session | `durationMin` hardcoded to `cfg.sessionMin`; activation never consulted `plannedMin` | `commandDispatch.ts` |
| 8 | Switching tasks resets the timer | No per-task in-flight checkpoint; clock always restarts from full `durationMin` | `PomoNode/types.ts`, `TaskNode/types.ts`, `commandDispatch.ts` |
| 9 | Pip overflow at high `pipCount` | No cap, no wrap; 40 pips rendered off-screen | `PomoNode/index.tsx` |
| A | `task.delete` does not clear `pomo.activeTaskId` | Delete cascade omitted the pomo clear step | `commandDispatch.ts` |
| F | Gear panel openable mid-session; saving corrupts in-flight derivation | No disable guard on the gear button | `PomoNode/index.tsx` |
| H | Session counter showed global `sessionsCompleted` instead of per-task | Counter read `state.sessionsCompleted` regardless of `activeTaskId` | `PomoNode/index.tsx` |

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

---

## Decision 22.2 — Todo-family theming, animated edges, per-task start/stop, subtask backfill (2026-05-13)

**Status:** Accepted — 2026-05-13
**Closes:** 6 follow-up reports on PR #90 after Decision 22 + 22.1 shipped.
**Related:** Decision 20 (Todo/Task linkage), Decision 22 (Pomodoro v2 baseline), Decision 22.1 (pause + per-task checkpoint).

### Context

PR #90 reached the user with the gear panel, pause/resume, per-task checkpoint, and clamp logic of 22 + 22.1 in place. Hands-on testing surfaced six issues — five UX, one missed cascade. None of them require new persisted fields: every fix sits on top of state shapes that 20 and 22.1 already locked in. This amendment is purely UI + dispatcher rewiring + one CSS pass on the selection ring and animated edge.

### Decision

**No schema changes.** Walked one-sentence-each, the 6 fixes consume only existing fields:

1. Per-task Start/Stop uses `pomo.activeTaskId`, `task.startPomo`, and `pomo.cancel` — all extant.
2. "Click loads, does not start" is `task.loadIntoPomo` shipped in 22.1 — verification only.
3. Minutes parsing extends the existing `parseMinutesFromText` helper in `commandDispatch.ts:102`; the renderer minutes input keeps its existing state.
4. Subtask TodoItem backfill consumes `TodoItem.taskNodeId` and `TaskState.todoItemId` from Decision 20 — both already there.
5. Selection-ring CSS, MotherFrame `borderColor` prop, and TodoNode header bullet color are all rendering knobs.
6. Animated-edges flip is a single boolean in `rfAdapters.tsx` plus filter-strength tuning.

Backend-dev: do not add fields. If you reach for one, stop and re-read this paragraph.

#### Fix 1 — Per-task Start (green) / Stop (red) shortcut on TaskNode

**Problem.** The `+ POMO` button on the TaskNode header (TaskNode/index.tsx:307-330) currently dispatches `task.spawnPomo`, which routes through `loadTaskIntoPomo({ autoStart: true })` and starts the timer immediately. The user wants START/STOP to live only on the parent PomoNode for the global pause/reset semantics; the per-task button should be a *shortcut* into the pomo, not a hidden third controller.

**Decision.** Replace the single `+ POMO` button with a pair:
- **START** (green, `var(--acid)`): always visible when `!state.done`. Dispatches `task.startPomo` (existing — loads this task and auto-starts; routes through `loadTaskIntoPomo({ autoStart: true })`).
- **STOP** (red, `var(--rust)`): visible *only* when `pomo.activeTaskId === thisTaskId` (regardless of running/paused). Dispatches a **new** command `task.stopPomo`.

`task.stopPomo` is added so the verb matches the surface. Dispatcher routes it through `pomoCancel(pomoState)` + the elapsed-commit branch already used by `task.delete` when an active task is removed (commandDispatch.ts:481-489) + `pomoClearActiveTask`. Pause is **not** a verb on the TaskNode — pause stays on the PomoNode.

**Contract.**
- File: `src/renderer/components/nodes/TaskNode/index.tsx` — remove the `+ POMO` button block at lines 305-331; render a flex row with two buttons. START is hidden when `state.done`; STOP is hidden unless `isActive` (the existing variable at line 59).
- Styles: START — `color: var(--acid); border: 1px solid var(--acid)`; STOP — `color: var(--rust); border: 1px solid var(--rust)`. Same 8.5px uppercase mono as the existing button. Both `onMouseDown={(e) => e.stopPropagation()}` to stay drag-safe.
- New command: `task.stopPomo` in the `case 'todo.task'` block of `commandDispatch.applyCommand`. Branch sequence:
  1. Resolve the single pomo node (kind === 'pomo').
  2. If `pomo.activeTaskId !== thisTaskId`, no-op.
  3. If running: commit `floor((now - startedAt) / 1000 + currentSessionElapsedSec)` into this task's `secondsAccumulated`; call `pomoCancel` (history record gets the cancel marker).
  4. If paused: commit `pausedElapsedMs / 1000 + currentSessionElapsedSec` and call `pomoCancel`.
  5. Clear `task.currentSessionElapsedSec = 0`. Call `pomoClearActiveTask` so `activeTaskId` returns to `null`.
  6. Persist via the existing tail-save pattern.
- `task.spawnPomo` stays in the dispatcher (sys CLI still uses it); the UI just stops referencing it.

#### Fix 2 — Click task body = load only, no auto-start (verification)

**Problem.** Decision 22.1 introduced `task.loadIntoPomo` and the UI was meant to switch to it for body clicks. We need to confirm this is what shipped on PR #90 and document it.

**Decision.** Verification-only. Body-click handler in `TaskNode/index.tsx` must dispatch `task.loadIntoPomo` (not `task.startPomo` or `task.spawnPomo`). The drag-safe guard (mouseup delta < 4px) from Decision 20 invariant 7 stays.

**Contract.** Tester should add a Gherkin scenario: *"Given a task is not active, when I click its body, then pomo.activeTaskId becomes this task AND pomo.status remains 'idle'."* If the body-click handler currently calls `task.startPomo` instead of `task.loadIntoPomo`, flip it; that's the only code change.

#### Fix 3 — Trailing-suffix minutes parser + wider minutes input

**Problem.** Quick-add minutes is too click-heavy: the user has to tab from the text input into a 36px field that reads as a "small place." A power-user shortcut (`"groceries 25m"`) would let them never leave the text input.

**Decision.** Two complementary tweaks:

(a) **Extend `parseMinutesFromText` in `commandDispatch.ts:102` to also match a trailing suffix.** New combined regex returns `{ plannedMin, strippedText }`:
- Trailing suffix: `/\s+(\d+)\s*(?:min|minutes?|m)\s*$/i` (whitespace-anchored, end-of-string).
- Existing inline `, time:`: `/,\s*time:\s*(\d+)\s*(?:min|m|minutes?)?/i` — kept for back-compat (Decision 22 §6).
- Precedence: trailing suffix > inline `, time:` > structured `plannedMin` argument from the UI. (Rationale: typing `"foo 25m"` is the user's explicit intent and should override a stale minutes input.)
- Signature change: `parseMinutesFromText(text) → { plannedMin: number | null, strippedText: string }`. Caller in `todo.add` uses `strippedText` as the saved task text.

(b) **Widen the minutes input.** TodoNode/index.tsx:402 — change `width: 36` to `width: 52`. No other layout changes.

**Tab from text → minutes already works** via the `data-testid="add-task-minutes"` onBlur guard at TodoNode/index.tsx:362-365. Do not refactor that guard. Document the behaviour in a code comment so future authors don't trip it.

**Contract.**
- File: `src/renderer/components/Canvas/commandDispatch.ts` — replace `parseMinutesFromText`; update the `todo.add` branch to use `strippedText` as the canonical text and resolve `plannedMin` with the precedence rule above.
- File: `src/renderer/components/nodes/TodoNode/index.tsx` — line 402 width change only. Renderer does **not** strip the suffix; it sends raw `text` and the dispatcher handles it. (Single source of truth for parsing.)
- Tester: cover `"foo 25m"` / `"foo 25 min"` / `"foo 25minutes"` / `"foo, time: 25"` / `"foo 25m, time: 40"` (trailing suffix wins → 25) / `"foo"` (no match → undefined).

#### Fix 4 — `task.addSubtask` must backfill a TodoItem on the parent TodoNode

**Problem.** At commandDispatch.ts:537 the new child TaskNode is spawned with `todoItemId: null`. That violates Decision 20 invariant 1 (bidirectional linkage) and means subtasks never appear in the parent TodoNode list. Right-click → Add subtask therefore looks like a silent failure to the user. Symmetric bug: `task.delete` cascade at commandDispatch.ts:471-507 only removes the **root** task's linked TodoItem — once subtasks have TodoItems, the cascade must remove every descendant's TodoItem too.

**Decision.** `task.addSubtask` appends a new TodoItem to the parent TodoNode (resolved via `parentTask.parentTodoId`) and writes the bidirectional links atomically in the same store transaction. Sub-subtasks (layer ≥ 3) keep appending to the *same* parent TodoNode — there is no per-task TodoNode. UI indentation of nested items on the parent TodoNode is **out of scope** for v2.2; it lands flat. The user has accepted this consequence ("UI indentation comes later").

`task.delete` cascade is extended: after `collectDescendants`, iterate every descendant whose state has `todoItemId !== null` and call `todoRemove` on the resolved parent TodoNode for each. One `updateNode` per descendant with a backlink is acceptable (the operation is bounded by tree depth × siblings, and avoids a more invasive batch API). Then `removeNodeSet` removes the task nodes themselves. The root removal already at line 491-503 stays as-is — but make sure it runs **after** the descendant pass so renumbering is correct.

**Contract.**
- File: `src/renderer/components/Canvas/commandDispatch.ts` — the `task.addSubtask` branch (lines 511-569):
  1. Build the child TaskNode as today, but **leave `todoItemId: null` only momentarily**.
  2. Resolve the parent TodoNode via `parentTask.parentTodoId`. (It always exists by invariant.)
  3. Generate a new TodoItem `id` (use the same id-shape as `TodoNode/commands.ts` already uses for items) with `text: childState.text`, `done: false`, `taskNodeId: childNode.id`.
  4. Update `childState.todoItemId = newItem.id`.
  5. Append the item to the parent TodoNode's state via the existing `todoLinkTask` + `todoAdd` (whichever maps cleanest — backend-dev may add a single `todoAttachTask({ text, taskNodeId, itemId? })` if neither composes cleanly; check `TodoNode/commands.ts` first).
  6. `addNode(childNode)`, `addEdge(edge)`, `updateNode(todoNode.id, { state: newTodoState })`, then one `boardSave`.
- File: same file — `task.delete` branch (lines 471-507):
  - After `collectDescendants` returns the list, before `removeNodeSet`, build a map of `parentTodoId → TodoItem.id[]` from descendants where `todoItemId !== null`, then for each parent TodoNode dispatch successive `todoRemove` calls (single `updateNode` per parent is fine — batch the items in one reducer pass if the existing `todoRemove` signature supports it; otherwise loop). Renumbering at line 504 still runs once at the end.
- Tester: Gherkin — *"Given a TaskNode with two subtasks each with one sub-subtask, when I delete the root, then the parent TodoNode has zero items linked to that subtree AND four task nodes are removed."*

#### Fix 5 — Todo-family selection ring is rounded + cyan (todo-family only)

**Problem.** RF's default selection ring (`reactflow-theme.css:48-53`) is `outline: 1px solid var(--acid)` — non-rounded, acid-green, applied globally. The user wants the todo family to be visibly cyan, with the selection ring rounded to match the card. Pomo/Habit/AI mothers should keep their acid-green selection (they are not in the todo family).

**Decision.** Scope the cyan ring to nodes that belong to the todo family — TodoNode mother, TaskNode children. Acid-green selection survives for everything else. Achieved via a class-scoped CSS rule, not by editing every node's inline style.

**Contract.**
- File: `src/renderer/styles/reactflow-theme.css` — keep the existing global rule (`var(--acid)` outline) as the default for non-todo nodes, but add a more specific rule that targets the todo family. Two approaches; pick the simpler one when wiring:
  - Add `data-node-kind` attribute on the wrapper that `rfAdapters.tsx` emits, then write `.react-flow__node[data-node-kind="todo"].selected, .react-flow__node[data-node-kind="todo.task"].selected { outline: none; box-shadow: 0 0 0 2px var(--cyan), 0 0 16px rgba(78,168,176,0.35); border-radius: var(--radius-lg); }`.
  - Or class-tag in the wrapper element directly (`className="krnl-node-todo"` etc.) and key off that.
- TodoNode (`src/renderer/components/nodes/TodoNode/index.tsx`): change the header bullet at line 145 from `var(--rust)` to `var(--cyan)`; pass `borderColor="var(--cyan-glow)"` to MotherFrame at line 127. MotherFrame already accepts `borderColor` (MotherFrame/index.tsx:16). No new prop.
- TaskNode header bullet at line 301 is **already** `--cyan`; do **not** touch it.
- TaskNode's active-ring (`isActiveRunning`/`isActivePaused` at lines 218-225) stays acid-green. "Currently being timed" is a different concept from "selected."

#### Fix 6 — Re-enable animated task-flow edges, softer cyan glow

**Problem.** The dash march keyframe (`reactflow-theme.css:32-37`) is wired and period-matched, but `rfAdapters.tsx:85` sets `animated: false` because the original cyan drop-shadow read as "noisy." With the softer values below, the march is back on.

**Decision.** Flip `animated: true` for `task-flow` edges and soften the BaseEdge cyan drop-shadow. Concrete values (not "soften"):

**Contract.**
- File: `src/renderer/components/Canvas/rfAdapters.tsx:85` — change `animated: false` to `animated: srcKind === 'todo.task' && tgtKind === 'todo.task'` (only task-flow edges march; default-typed edges stay still).
- File: `src/renderer/components/edges/TaskFlowEdge` (or wherever the BaseEdge style for task-flow is set — Grep for `drop-shadow` near `task-flow`): drop the blur from `5px` to `3px`, and the alpha from `0.45` to `0.30` in the cyan `rgba(...)`. Hover state at `reactflow-theme.css:39-41` retains its existing `9px / 0.85` punch.
- Tester: visual check in `npm run dev` with two TaskNodes linked. Confirm the dash march is visible but the glow does not bleed across other nodes.

### Styling philosophy (codified)

Re-stated here as the single source of truth for v2.2 onward. Backend-dev: when adding a new node or affordance, pick the color whose role matches your concept; do not invent new hues.

- **Blue (cyan family) — todo-family kinship.** Used by: TodoNode mother (header bullet, MotherFrame border via `--cyan-glow`), TaskNode children (header bullet), the *selection ring* on todo-family nodes (rounded box-shadow), task-flow edges, animated dash march on those edges. Tokens: `--cyan`, `--cyan-glow`.
- **Acid green — active-focus signal.** Used by: pomo running and paused rings on TaskNode, primary call-to-action buttons (e.g. the new START), the global RF selection ring on **non-todo** families (Pomo, Habit, AI mothers and their children). Token: `--acid` (+ glow values for shadow).
- **Rust — danger / cancel / destructive.** Used by: STOP button on TaskNode, RESET on PomoNode, hover-tinted delete affordances. Token: `--rust`.
- **Spine — identity / slot tags.** Used by: MotherFrame slot badges. Do not extend to other surfaces.

If a future affordance does not fit any of these four, that is a signal to challenge the affordance — not invent a fifth color.

### Consequences

- **Enables.** A clear per-task entry/exit pair (START/STOP); a power-user quick-add (`"foo 25m"`); honest todo-tree state (every subtask shows up on its TodoNode); a visually distinct todo family without per-component overrides; the animated edge the user originally specified, at a softer intensity.
- **Forecloses.** Sub-subtask items on the parent TodoNode are flat (no indentation in v2.2). Custom selection ring colors per non-todo node kind (everything non-todo is acid-green; intentional). A pause verb on the TaskNode (pause stays on the PomoNode, always).
- **No migration.** No schema additions; existing boards load and save unchanged. New `task.stopPomo` command is dispatcher-only and never persisted.
- **Cascade invariant pinned.** Decision 20 invariant 1 (bidirectional linkage at creation) and invariant 4 (delete cascade clears all linked TodoItems) are now enforced for subtasks as well, not only root tasks. Add a Gherkin scenario for the multi-level case.

---

## Decision 23.1 — ClockNode as Permanent 6th Mother (supersedes Decision 23)

**Date:** 2026-05-14
**Status:** Accepted
**Supersedes:** Decision 23 (PR #105 — clock as user-spawned 6th node-kind)
**Related:** ADR 0001 (CalendarNode), Decision 22 (TaskState plannedMin)

ClockNode becomes a permanent mother at **slot 6** (`mother-clock`, `x=1252, y=0`), seeded by `seedBoard()` and back-filled by a new idempotent `migrateAddClockMother` migration. `MOTHER_TOTAL` becomes **6**. The dock button and `C` keyboard shortcut from PR #105 are removed — clock is never user-spawnable.

**Role split with CalendarNode:** Calendar answers *when* at day-grain (multi-day view, owns `scheduledFor` write path). Clock answers *how it stacks* at minute-grain inside a single 12-hour window (sequential `plannedMin` arc layout, read-only in v1). Both share the same task data but render different projections.

**State:** `{ linkedTodoId: string | null; windowStartHour: number }` (defaults: `null`, `8`).
**Config:** `Record<string, never>` (empty — no `CONFIG_DEFAULTS` entry needed).
**Commands:** `clock.linkTodo` — links/unlinks a Todo node. `clock.setWindowStart` — sets window anchor hour (0–23, clamped). No cross-node router commands.

**Persistence changes:**
- `seedBoard` appends the clock node entry after `mother-calendar`.
- `NEW_MOTHER_POSITIONS` adds `'mother-clock': { x: 1252, y: 0 }`.
- `STATE_DEFAULTS['clock']` supplies backfill defaults.
- `migrateAddClockMother` injects the node into pre-23.1 boards (idempotent, runs before `migrateNodeStates`).

**v2 deferred:** An opt-in `clock.alignMode: 'sequential' | 'scheduled'` mode that reads `TaskState.scheduledFor` for arc placement. Requires a separate ADR.

---

## Decision 24 — Unified Task Timeline Selector + ClockNode Rewrite

**Date:** 2026-05-14
**Status:** Accepted
**Supersedes:** nothing (additive on top of Decision 23.1)
**Related:** Decision 22 (`plannedMin`), Decision 22.1 (per-task checkpoint), Decision 22.2 (animated chain), Decision 23.1 (Clock as permanent mother), ADR 0001 (Calendar)
**Plan file:** `C:\Users\momo\.claude\plans\just-improve-my-prompt-eager-dongarra.md`

### Context

Decision 23.1 introduced ClockNode v1 with a sequential `plannedMin` stack of root tasks sorted by `sequenceNumber`. Four requirements that v1 cannot address:

1. **Chain order, not numeric order.** Root tasks form a `task.next` graph; `sequenceNumber` sort breaks down on forks.
2. **Breaks are missing.** Pomo `shortBreakMin` / `longBreakMin` / `longBreakEvery` are first-class scheduled time; they must occupy the 12-hour ring.
3. **Reactivity.** Edits to tasks or Pomo config must repaint the clock without manual refresh.
4. **Calendar will eventually share the same data.** Two views on one derived Timeline.

### Decision

Replace the filter-and-loop in `ClockNode/index.tsx:42-74` with a single memoized selector: **`selectTimeline(board, todoId)`** in `src/renderer/store/timelineSelector.ts`. ClockNode is the v1 consumer; CalendarNode is v2 (deferred).

**Data model:** `TimelineSegment` discriminated union (`task | break`), `ParallelGroup`, `Timeline` (ordered by `startMin`, includes breaks). Full types in `timelineSelector.ts`.

**Memoization:** module-level reference-identity cache on `(board.nodes, board.edges, pomoConfig)`. Same pattern as `_lastEdges` / `selectTaskChain` in `boardStore.ts`. Invalidated automatically on every Zustand `set(...)` that touches nodes or edges. Pure, synchronous, no React hooks.

**Break algorithm:** one break per task or parallel group. `breakCounter % cfg.longBreakEvery === 0 → long`, else short. Trailing break emitted by selector; stripped by ClockNode at render time. Calendar (v2) may keep it.

**Parallel arcs:** same radius `R=108`, same `strokeWidth=18`, `mix-blend-mode: multiply` so overlapping colors compose visibly. Parallel group members share `startMin`; group `endMin = startMin + max(branch.plannedMin)`.

**Break arcs:** `strokeWidth=9`, `stroke="var(--paper-3)"`, opacity 0.6 (short) / 0.8 (long).

**Done tasks:** still consume their `plannedMin` slot; rendered at 0.4 opacity.

**No new persisted fields.** Timeline is derived from existing `TaskState.plannedMin`, `TaskState.done`, `task.next` edges, and `PomoConfig`. Existing boards load and save unchanged.

**Calendar integration (v1):** Calendar ignores Timeline. It continues to use `scheduledFor` directly per ADR 0001. A future ADR may bridge the two.

### Consequences

- `ClockNode` becomes a thin renderer: reads `selectTimeline`, renders segments as SVG arcs.
- The old `tasks` selector and manual `arcs` reduce loop in `ClockNode/index.tsx` are deleted.
- All future views wanting "the todo's plan as time" import `selectTimeline` from `timelineSelector.ts`. No copies, no parallel implementations.
- Tests: 12 selector unit tests + 6 component tests added; existing ClockNode.scenarios tests updated to account for break arcs in the segment count.

---

## Decision 24.1 — Color-token contract: selector palette MUST exist in tokens.css

**Date:** 2026-05-14
**Status:** Accepted — patch on Decision 24
**Author:** architect
**Plan file:** `C:\Users\momo\.claude\plans\just-improve-my-prompt-eager-dongarra.md` (full root-cause analysis at the bottom)

### Context

User reported only the first of 3 chained tasks rendered on the clock face. Tester verified all 18 unit tests passed including the 3-task chain case. Data on disk was correct, selector logic was correct, DOM structure was correct. The bug was paint, not data.

### Root cause

`timelineSelector.ts:16` defines `COLORS = ['rose', 'sky', 'mint', 'amber', 'violet']`. ClockNode renders each task arc with `stroke={`var(--${seg.colorToken})`}`. Three of the five tokens — `--sky`, `--mint`, `--violet` — **are not declared** in `src/renderer/styles/tokens.css`. When `var()` references an undefined custom property without a fallback, SVG `stroke` falls back to its initial value `none`. The `<circle>` elements exist in the DOM with correct geometry; they paint nothing.

For the user's 3-task chain: task1→rose (defined, paints), task2→sky (undefined, transparent), task3→mint (undefined, transparent). Exact match with the symptom.

### Decision (rule for backend-dev)

1. **Constrain the palette to defined tokens.** `COLORS` in `timelineSelector.ts` becomes `['rose', 'amber', 'teal', 'lilac', 'sand', 'moss']` (six warm/cool alternating tokens, all defined in tokens.css). Re-export `COLORS` for tests.
2. **Add a CSS fallback in the stroke prop.** ClockNode line 248: `stroke={`var(--${seg.colorToken}, #c87080)`}` so a future palette regression cannot paint transparent.
3. **Brighten break arcs.** Replace `var(--paper-3)` with `var(--ink-4)` for break arc stroke; keep 0.6 / 0.8 opacity for short / long.
4. **Add a contract test** at `tests/unit/renderer/timelineSelector.colorTokens.test.ts` that reads `tokens.css` and asserts every entry in `COLORS` has a `--<name>:` declaration in light + dark + noir variants.
5. **Add a fixture-replay test** at `tests/unit/renderer/ClockNode.userBoard.fixture.test.tsx` that mirrors the user's exact failing board (3 tasks 120/80/30, 2 chain edges, mother-todo link) and asserts (a) 3 task arc circles in the rendered SVG and (b) every rendered `stroke` references a `var(--<token>)` whose name is in the imported `COLORS` set. Catches both selector-emit regressions and palette-drift regressions for this specific board.
6. **Update existing color-rotation test.** `tests/unit/renderer/timelineSelector.test.ts:147-163` currently asserts `rose / sky / mint`; change to `rose / amber / teal` to match the new palette. (One existing test affected; all 17 others continue to pass.)
7. **Add a runtime diagnostic** in `selectTimelines` that on first call checks `getComputedStyle(document.documentElement)` for each token in `COLORS` and `console.warn`s once if any resolve empty. Catches future drift in production, not jsdom.
8. **Add a dev-only debug overlay** in ClockNode behind `import.meta.env.DEV && import.meta.env.VITE_CLOCK_DEBUG === '1'` showing segment count, totals, and first 6 segment summaries. Off by default; available for future debug sessions of the same class.

### Consequences

- New invariant: every name in the selector palette must have a matching CSS custom property in tokens.css across light / dark / noir variants. Enforced by the contract test.
- jsdom tests confirm DOM shape; the contract test confirms CSS variable existence; the runtime diagnostic confirms resolution under the live theme. Three layers cover the gap that this bug exploited.

### Test gap acknowledgment

Decision 24's 18 tests covered selector correctness and component DOM structure. None tested the contract between code constants and the stylesheet. **jsdom does not paint** — assertions on `getAttribute('stroke')` checked the literal string `"var(--sky)"` was set, not that `--sky` resolves to a color. The new contract test is the missing test class.

---

## Decision 24.2 — Visible breaks (dark-theme contrast) + 12h view toggle

**Date:** 2026-05-14
**Status:** Accepted
**Supersedes:** Decision 24.1's break stroke (`var(--ink-4)`) and Decision 23.1's `windowStartHour` UI / state field / command (`clock.setWindowStart`).
**Plan file:** `.claude/plans/just-improve-my-prompt-eager-dongarra.md`

### Problem

Three issues reported by user after Decision 24.1:

1. **Break arcs invisible in dark theme.** Decision 24.1 changed break stroke from `var(--paper-3)` to `var(--ink-4)`. In dark theme `--ink-4 = #5a5244` over `--paper-2 = #1a1814` is a luminance delta of ~22 — below human perceptual threshold for thin strokes. The fix moved the bug from light to dark theme.

2. **Pomo settings not visualized.** Breaks exist in the DOM but are not visible, so the user cannot see that Pomo config affects the timeline.

3. **Window-start control is the wrong model.** `windowStartHour: 0–23` with +/- buttons anchored arcs to wall-clock time, which is dishonest — Timeline `startMin` is "minutes from plan start," not clock time. User mental model is "let me page through 12-hour halves of my plan."

### Decisions

**Q1 — Break visibility:** `var(--ink-3)` at `strokeWidth=6` for short breaks; `var(--ink-2)` at `strokeWidth=10` for long breaks. Both at `opacity=1.0`. Drops the opacity-based differentiation from 24.1. `--ink-3` and `--ink-2` pass contrast checks against `--paper-2` in both light and dark themes (ΔL ≈ 40 and 70 respectively).

**Q2 — No legend.** The width/ink hierarchy IS the visualization. SVG `<title>` children on each break arc provide accessible hover-tooltips (e.g. `"short break · 5m"`).

**Q3 — 12h view toggle.** Replace `windowStartHour: number` state with `viewWindow: 0 | 1`. Single button UI: `→ 12h–24h` (window 0) or `← 0h–12h` (window 1). Hour labels read `0..11` or `12..23`. Toggle disabled when `totalMin ≤ 720`. Overflow badge threshold moved to 1440 min (24h). Defensive clamp: if plan fits in window 0, `effectiveWindow` is forced to 0 without mutating persisted state.

**Q4 — Migration:** New `migrateClockState` strips `windowStartHour` and ensures `viewWindow: 0` exists. Idempotent. Runs BEFORE `migrateNodeStates` in the load pipeline. `STATE_DEFAULTS['clock']` and `migrateAddClockMother` seed updated to use `viewWindow: 0`.

**Q5 — Command dispatcher:** `clock.setWindowStart` removed entirely. `clock.setViewWindow({ window: 0 | 1 })` added. No backward-compat alias (commands are not persisted).

**Q7 — Token contract:** `BREAK_TOKENS = ['ink-2', 'ink-3'] as const` exported from `ClockNode/index.tsx`. Contract test extends `timelineSelector.colorTokens.test.ts` to assert both tokens have `--<name>:` declarations in tokens.css.

### Test delta

- **Deleted:** 8 `clock.setWindowStart` tests in `ClockNode.commands.test.ts`.
- **Updated:** 4 fixture `windowStartHour` → `viewWindow` replacements; 4 stroke-width/color assertion updates; AC7 overflow threshold updated to 1440.
- **New:** 5 migration tests (`board.decision24_2-migration.test.ts`) + 8 viewWindow render tests (`ClockNode.viewWindow.test.tsx`) + 3 break visibility tests + 1 break-token contract test = **17 new cases**.

### Consequences

- Timeline labels now read `0..23` as plan-hours, not wall-clock time. Wall-clock anchoring foreclosed; a future ADR may add a "plan start time" picker.
- Plans > 24h (>1440 min) show overflow badge only; no third window. Multi-window support is a separate ADR.
- `viewWindow: 0 | 1` is a strict union — extending to N windows requires deliberate migration.
- The automated break-token contract test (`BREAK_TOKENS` vs tokens.css) closes the same regression class that caused Decision 24.1's bug.
## Decision 23 — Terminal CLI Bridge: `krnl` Inside the PTY

**Date:** 2026-05-14
**Status:** Accepted
**Author:** architect
**ADR:** [adr-0014-terminal-cli-bridge.md](./adr-0014-terminal-cli-bridge.md)
**Numbering note:** The existing log uses "Decision 14" twice (HabitNode v2 at line 897, Native Module Rebuild Flow at line 765 / also tagged 18). The next free slot is 23 (after 22.2).

### Context

The TerminalNode hosts a real PTY (Decision 12), and Decision 3 commits us to "Claude Code drives the app via a CLI." But the existing `sys` CLI is a renderer-to-main IPC (`sys:run`) — it cannot be invoked from inside the PTY's actual shell, which is a separate OS process with no `ipcRenderer`. There is no `krnl` binary on PATH. And the renderer's `commandDispatch.ts` holds cascade semantics (active-pomo cancel on task delete, todo↔task mirror, sibling renumber, marquee cascade) that `SysFacade` does not fully replicate — a CLI that mutates board.json directly today silently desyncs the running app.

### Decision

Three load-bearing calls:

1. **Shared dispatch.** Cascade logic moves to `src/shared/dispatch/` as pure functions. Both renderer (`commandDispatch.ts`) and main (`SysFacade`) call the same module. No more "renderer truth, CLI approximation."
2. **Named-pipe / Unix-socket RPC.** Main hosts a `net.createServer` listening on `${os.tmpdir()}/krnl0-${pid}.sock` (POSIX) or `\\.\pipe\krnl0-${pid}` (Windows). Per-launch path; per-launch 256-bit token in `KRNL0_RPC_TOKEN`. Wire format is line-delimited JSON: one request frame `{ v:1, token, id, argv }`, multiple response frames `{ v:1, id, kind:'stdout'|'stderr'|'exit', data|code }`. Token mismatch → single `exit` frame with code 126.
3. **`krnl` binary distributed via per-launch temp dir.** App startup writes `bin/krnl.js` + POSIX shim `krnl` + Windows shim `krnl.cmd` into `${app.getPath('userData')}/cli-bin/` and prepends that path to the PTY child's PATH at `pty:create` time. The existing `sys` binary stays as a deprecation alias (one stderr note, then `exec`s the same `krnl.js`). The `sys:run` IPC channel is **not** renamed — only the binary name is.

The MOTD banner moves from renderer (current `BOOT_LINE_ASCII` write in `session.ts`) to main, runs immediately after PTY spawn, reads version from `package.json` dynamically, and includes the ASCII KRNL0 logo + tagline + dim separator + "type 'help'" prompt. Compact one-line form for `cols < 50`. Opt-out via `KRNL0_NO_MOTD=1`.

The `term.*` FSM (`setShell`, `setFontSize`, `setTitle`, `clear`) plus a `case 'term':` branch in `commandDispatch.ts` close the gap where `term.sessionStart` / `term.sessionEnd` events were emitted but never dispatched. Help is generated from a single command registry at `src/shared/cli/commandRegistry.ts`; the hand-maintained `HELP_TEXT` constant in `SysFacade.ts` is deleted.

### Contract

See ADR-0014 §11 for the full file-by-file contract. Key invariants backend-dev must hold:

- Wire format: line-delimited JSON with `v: 1` on every frame; `exit` frame is always last.
- Token check: first thing the server does on every request; mismatch → `exit code 126`, close.
- Env injection: `pty:create` is **extended**, not forked. The existing `env: process.env` line spreads `KRNL0_RPC_SOCKET`, `KRNL0_RPC_TOKEN`, and the prepended `PATH`.
- Cascade parity (T19 in `terminal-finish.md`): CLI mutations and UI mutations on the same board produce structurally identical output.
- `BOOT_LINE_ASCII` is removed from the renderer; main writes the banner.

### Phasing

| Phase | Scope | Effort | Status |
|---|---|---|---|
| 1 | RPC server + `krnl` binary + MOTD + help + `term.*` FSM + shared dispatch for Phase-1 cascade commands (`task.delete`, `todo.remove`, etc.) | ~1 day | Shipped in PR #108 |
| 2 | UI-parity surface: `node.move/resize`, `viewport.*`, `undo/redo`, `marquee.*`, `edge.*`, `board.*`, `theme.*`; adds `cli:dispatch` IPC for renderer-coupled commands | ~1 day | Shipped in PR #108 |
| 3 | ANSI color in `krnl` output, `krnl init zsh` / `krnl init pwsh` shell-init snippets | ~½ day | Deferred — tracked in #109 |
| 4 | Streaming commands, autocomplete generation | defer-OK | Deferred — tracked in #110 |

Open questions OQ2, OQ4, OQ5, OQ6 tracked in #111.

### Consequences

- **Enables.** Claude Code inside the PTY mutates the app with no orphan state. `krnl` reaches UI parity for every operation in ADR-0014 §5. The banner makes the terminal feel like a real shell. Generated help auto-documents new commands.
- **Forecloses.** Phase 2's `cli:dispatch` IPC couples a few commands (undo, viewport) to a live renderer — headless invocations cannot pan or undo. `KRNL0_RPC_TOKEN` is env-injected; any descendant of the PTY's shell has it (same trust boundary as access to `~/Documents/krnl0/board.json`).
- **Cost.** ~2 dev days for Phase 1+2. One new teardown surface: the named-pipe server must close on `app.on('before-quit')` alongside the existing PTY cleanup.

---

## Decision 24 — CalendarNode Slice 3: WeekView + NowLine + drop-to-schedule (2026-05-14)

**Date:** 2026-05-14
**Status:** Accepted
**Author:** architect
**Cross-reference:** ADR 0001 (Calendar mother node). Follows Slice 1 (data + migration) and Slice 2 (MonthView, PR #113 / 507545c).

### Context

Slice 3 of the Calendar mother is the demo-defining slice. Three new mechanics land together: the WeekView hour grid, a live NowLine, and the drag-to-schedule interaction that turns a Todo row or unscheduled TaskNode into a `scheduledFor` mutation routed through `task.setSchedule` (already wired in Slice 1). ADR 0001 §5 locked the MIME (`application/krnl-task`) and §9 locked the payload shape; ADR 0001 §12 locked the NowLine perf rule (local `setInterval`, never the store). This decision resolves the ten implementation questions that were still open and pins which interactions ship in Slice 3 vs. which defer to Slice 5.

### Decision

Slice 3 ships: WeekView grid, NowLine, drop-from-TodoNode-row, drop-from-TaskNode-body, and reschedule-by-dragging-existing-blocks. It does **not** ship: bottom-edge resize handles, cosmetic edge creation, multi-day spans, in-cell sub-hour grid lines. The TodoNode drag-source change ships in the same PR as the WeekView drop target — splitting them produces two unverifiable halves.

#### Answers (binding)

**Q1 — Drag API: HTML5 native.** No new dependency. ADR 0001 §9 already locked the MIME contract for native `dataTransfer`; React-DnD / Pragmatic-dnd would require re-deriving the payload contract. The ghost-image quirk is handled by calling `e.dataTransfer.setDragImage(rowEl, 0, rowEl.offsetHeight / 2)` inside `onDragStart`.

**Q2 — Snap granularity: hour-snap in Slice 3.** Drop on the 14:00 cell ⇒ `scheduledFor = "{day}T14:00"`. 15-min refinement is a Slice 5 follow-up; the contract for `scheduledFor` is already ISO local datetime so the upgrade is non-breaking.

**Q3 — Cosmetic edge on drop: defer to Slice 5.** Slice 3 only sets `scheduledFor` via `task.setSchedule`. The edge creation logic lives in the cross-cutting slice alongside TodoNode↔Calendar sync, per ADR 0001's recommended slice ordering. The cosmetic-edge dedup rule from ADR 0001 §8 stays unchanged.

**Q4 — Click vs drag disambiguation: pointer-event drag-threshold, 4px.** Same threshold already proven on TaskNode body-click (Decision 20 invariant 7, Decision 22.1). Use `onPointerDown` to record start coords; on `onPointerMove` if delta > 4px set a `dragging` flag and call `setDragImage` (HTML5 dragstart) via a programmatic `draggable` activation; on `onPointerUp` with no drag flag, dispatch `task.activate`. **Implementation note:** because HTML5 native drag fires `dragstart` independently of pointer threshold, the cleanest path is to leave `draggable={true}` always, capture click intent on `onClick` (which only fires when no drag occurred), and dispatch `task.activate` from there. The 4px threshold is enforced by the browser's drag-initiation heuristic; do not re-implement it.

**Q5 — Resize handles: defer to Slice 5.** Slice 3 ships drop + reschedule-by-drag only. Duration is mutated via TodoNode quick-add (`"foo 25m"`, Decision 22.2 Fix 3) or the existing TaskNode minutes field. Block height in Slice 3 derives from `scheduledDurationMin` read-only.

**Q6 — NowLine perf: confirmed — local `setInterval(60_000)` + local `useState`, unmount-cleanup.** This is ADR 0001 §12 verbatim. PomoNode/index.tsx:79 is the reference. The NowLine MUST NOT subscribe to the Zustand store and MUST NOT use the canvas-tick or any 60fps loop. Backend-dev: if you reach for a store selector or RAF, stop and re-read this paragraph.

**Q7 — Out-of-range tasks: render at row 0 with a small "↑" badge.** Zero data loss. The badge is a 9px acid caret in the top-left of the block. Symmetrically, tasks scheduled after `hourRange.end` render at the bottom row with a "↓" badge. Both badges are decorative — clicking the block still fires `task.activate`.

**Q8 — Multi-day spans: confirmed clipped at column bottom.** A task at 23:30 with 60-min duration renders as a block from 23:30 to the bottom of `hourRange.end` (or 24:00 if `hourRange.end >= 23` — the trailing edge is the row's bottom edge, not the next-row top). No cross-midnight rendering. ADR 0001 "Forecloses" already covers this.

**Q9 — Empty state: faint hint when zero tasks scheduled all week.** Single line, `9px mono ink-3`, centered horizontally above the now-line (or at 50% column height if today is off-screen): `"DRAG A TASK ONTO THE GRID"`. Hides as soon as any scheduled task is visible in the current week. Do not animate.

**Q10 — Scope: bundle TodoNode drag-source with WeekView drop-target.** Drag source and drop target are useless apart; splitting forces stubbed `dataTransfer` tests that don't catch integration bugs. The PR diff stays small because TodoNode's change is ~15 lines (`onDragStart` + `draggable={true}` on the row).

### Contract

#### New files

- `src/renderer/components/nodes/CalendarNode/WeekView.tsx`
- `src/renderer/components/nodes/CalendarNode/NowLine.tsx`

#### WeekView component shape

```ts
interface WeekViewProps {
  state: CalendarState;
  config: CalendarConfig;
  onCommand: (cmd: string, args: Record<string, unknown>) => void;
}
```

Internal layout:
- 7 day-columns (Mon-Sun), derived from `state.anchorDate` and `weekStartsOn`.
- N hour-rows where N = `config.hourRange.end - config.hourRange.start + 1`. Default 17 (rows 06..22 inclusive — clarifying: `end: 23` in ADR 0001 means "show through 23:00", so the last row's top is 23:00 and its bottom is 24:00; row count = `end - start + 1 = 18`). **Pin this:** `rowCount = config.hourRange.end - config.hourRange.start + 1`; do not off-by-one.
- Row height: derive from available body height (after sub-header + time gutter) so the grid fills the MotherFrame. Min row height 28px; if `rowCount * 28 > availableHeight`, content scrolls vertically (`overflow-y: auto`).
- Sub-header: `[←] Week of {Month D} [→]` — arrows dispatch `calendar.setAnchor` with `addDays(state.anchorDate, ±7)`.
- Time gutter: 36px wide, `9px mono ink-3`, label = `"HH"` (zero-padded), aligned to row top.
- Today's column: faint `var(--acid)` tint (8% alpha) on the column background; header text pulses via the existing keyframe used by HabitNode's "today" cell (re-use, do not duplicate).

#### Task block

Scheduled tasks render as positioned divs inside their day-column:
```ts
{
  position: 'absolute',
  top: `${hoursFromStart * rowHeight}px`,
  height: `${Math.max(18, (durationMin / 60) * rowHeight)}px`,
  background: 'var(--acid-faint)',     // ~8% alpha acid
  border: '1px solid var(--acid)',
  borderRadius: 4,
  cursor: 'grab',
  draggable: true,
}
```
- `onPointerUp` with no drag flag ⇒ `onCommand('task.activate', { taskId })`.
- `onDragStart` ⇒ `dataTransfer.setData('application/krnl-task', JSON.stringify({ taskId, durationMin }))`.
- `onDrop` (on the new cell) reuses the same handler as the from-Todo drop path. No special case.

#### Drop target (hour cell)

```ts
function onDragOver(e: DragEvent) {
  if (!e.dataTransfer.types.includes('application/krnl-task')) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  cell.setAttribute('data-drop-target', 'true');
}
function onDragLeave(e: DragEvent) { cell.removeAttribute('data-drop-target'); }
function onDrop(e: DragEvent) {
  e.preventDefault();
  const raw = e.dataTransfer.getData('application/krnl-task');
  if (!raw) return;
  const { taskId, itemId, durationMin } = JSON.parse(raw);
  const scheduledFor = `${cellDate}T${String(cellHour).padStart(2, '0')}:00`;
  onCommand('task.setSchedule', { taskId, itemId, scheduledFor, scheduledDurationMin: durationMin });
  // Slice 3 does NOT create a cosmetic edge here — that lands in Slice 5.
  flashCell(cell, 240);
  cell.removeAttribute('data-drop-target');
}
```

The `task.setSchedule` command shape — including the `taskId | itemId` either-branch — is already locked in ADR 0001 §6. The dispatcher routes to `'todo.task'` when `taskId` is present, and to the parent `'todo'` when only `itemId` is present. Slice 3 does not modify the dispatcher.

**CSS rule (one new selector in `reactflow-theme.css`):**
```css
.krnl-calendar-cell[data-drop-target="true"] {
  background: rgba(166, 255, 0, 0.10);
  box-shadow: inset 0 0 0 1px var(--acid);
  transform: scale(0.98);
  transition: transform 80ms ease, background 80ms ease;
}
```

#### NowLine component shape

```ts
interface NowLineProps {
  weekStartDate: string;        // YYYY-MM-DD (Mon)
  hourRange: { start: number; end: number };
  rowHeight: number;
  columnWidth: number;
  gutterWidth: number;
}
```
- Returns `null` if `now` is not within `[weekStartDate, weekStartDate + 7 days)`.
- Returns `null` if `now.getHours() < hourRange.start` or `> hourRange.end`. (Out-of-view nows do not render; they are not clipped to the edge — the line is informational, the badges are for tasks.)
- 1px `var(--acid)` line spanning all 7 day-columns; 4px acid dot at the intersection with today's column.
- Tick contract: `setInterval(() => setTick(t => t + 1), 60_000)` in `useEffect`, cleared on unmount. No Zustand subscription. No RAF.

#### TodoNode row — drag source addition

`src/renderer/components/nodes/TodoNode/index.tsx`:
- Row element gains `draggable={true}` and an `onDragStart` that:
  1. Reads `item.taskNodeId` and `item.id`.
  2. If `taskNodeId` exists ⇒ payload `{ taskId: taskNodeId, durationMin: linkedTask.plannedMin ?? 25 }`.
  3. Else ⇒ payload `{ itemId: item.id, durationMin: 25 }`.
  4. `e.dataTransfer.setData('application/krnl-task', JSON.stringify(payload))`.
  5. `e.dataTransfer.effectAllowed = 'move'`.
  6. `e.dataTransfer.setDragImage(e.currentTarget as HTMLElement, 0, 12)`.
- **Drag-safe guards stay.** The existing 4px click-vs-drag threshold (Decision 20 invariant 7) still gates click dispatching. The HTML5 `draggable={true}` does not interfere because dragstart only fires after the browser's own drag threshold, which is also ~4px.

#### CalendarNode index.tsx wiring

Replace the week-view placeholder branch with `<WeekView state={node.state} config={config} onCommand={onCommand} />`. No other changes to `index.tsx`.

#### Files affected (binding)

**New:**
- `src/renderer/components/nodes/CalendarNode/WeekView.tsx`
- `src/renderer/components/nodes/CalendarNode/NowLine.tsx`

**Modified:**
- `src/renderer/components/nodes/CalendarNode/index.tsx` — week branch wires `WeekView`.
- `src/renderer/components/nodes/TodoNode/index.tsx` — row gains `draggable` + `onDragStart`.
- `src/renderer/styles/reactflow-theme.css` — add `.krnl-calendar-cell[data-drop-target="true"]` rule.

**Not modified in this slice:**
- `commandDispatch.ts` — `task.setSchedule` already exists (Slice 1).
- `rfAdapters.tsx` — cosmetic edge override deferred to Slice 5.
- Schema files — no shape changes.

### Consequences

**Enables:**
- The live "drop a task onto Tuesday 2pm" demo interaction.
- A reusable HTML5 drop-target idiom for future calendar surfaces (MonthView day-cell drop in Slice 5 reuses the exact same handler shape; only the `scheduledFor` computation differs).
- Rescheduling without leaving the canvas: drag an existing block to a new hour ⇒ same dispatch path, no special UI.

**Forecloses (this slice only — revisited in Slice 5):**
- Sub-hour snap granularity.
- Cosmetic edge auto-creation on drop.
- Bottom-edge resize handles for duration mutation.
- Multi-day / cross-midnight task spans (ADR 0001 already forecloses these in v1 globally).

**Risks accepted:**
- Hour-snap may feel coarse for users who think in 15-min blocks. Mitigated: Slice 5 upgrade is non-breaking because `scheduledFor` is already ISO datetime, and the wire payload's `durationMin` carries the necessary precision today.
- Out-of-range badges add a small icon vocabulary (↑ / ↓) the user must learn. Mitigated: the badge is decorative; the block still occupies a real position so the user sees the scheduling intent.
- `draggable={true}` on TodoNode rows could in principle interfere with React Flow node-drag if the row ever became a node body. It cannot, because rows live inside TodoNode's body and React Flow's drag handler is on the wrapper. Verified against existing TodoNode structure.

### Backend-dev — start signal

You are unblocked. Implement against the contract above. Two reminders:

1. NowLine MUST own its own `setInterval`. No store subscription. If you find yourself writing `useBoardStore` inside NowLine, stop.
2. Do not create the cosmetic edge in the drop handler. That belongs to Slice 5. If the diff grows past the four files listed, you are out of scope.

---
