# krnl0 — Product Description
*April 26, 2026 · Pre-architecture draft*

> **Historical draft.** Written before the architecture was locked in PRD v0.6.0. The v1 scope is narrower than this document originally implied — projects, journaling, and a plugin system were cut. Kept here for the design record.

---

## What is krnl0?

krnl0 is a single-canvas personal planning tool. Pomodoro, todos, and habits live as anchored widgets on an infinite whiteboard, alongside a terminal that exposes the full app surface as a CLI. An AI assistant operates the same surface through voice.

Influences:

- **Obsidian** — local-first, file-based, yours to own
- **Miro** — infinite canvas, spatial layout, visible connections
- **A terminal** — programmable and AI-driveable
- **Habit tracker / to-do / Pomodoro** — productivity primitives, treated as connectable nodes rather than separate apps

Every widget is a node. Nodes can be wired together: a finished Pomodoro can mark a habit done, complete a task, or trigger any other node's command. The same surface a power user types into the terminal is the surface the AI assistant operates.

---

## The problem it solves

A typical productivity stack is several apps: a task manager, a habit tracker, a Pomodoro timer, a notes tool, a calendar. They don't share state and they don't know about each other, so context-switching between them costs attention all day.

These things are not actually independent. A focus session relates to a task; a habit feeds a goal. The separation is an artifact of how the apps were built, not of how the work flows.

krnl0 puts them on one canvas and lets them talk to each other.

---

## Core principles

**One canvas, everything on it.**
There is no switching between apps. Your Pomodoro timer, your tasks, and
your habits all live on the same infinite whiteboard. Four anchored nodes —
Pomodoro, Todos, Habits, Terminal — are always present, always in view.

**Fixed mothers, free children.**
The four core nodes (mothers) are anchored at fixed positions and cannot be
moved or deleted — they are the skeleton of the canvas. Everything else is
a child node spawned by a mother or the assistant, free to drag, rearrange,
and delete. There is exactly one of each mother type; the canvas stays
legible without configuration.

**Connections are first-class.**
Nodes can be wired together. When your Pomodoro session ends, it can mark
a task done or increment a habit. These connections are visible on the
canvas — you can see your system, not just use it.

**The terminal is a peer, not a power-user escape hatch.**
The CLI is not a hidden feature for developers. It is a first-class
interface that every user can reach. It is how you talk to AI agents, run
automations, and configure the system programmatically. The terminal node
lives on the canvas alongside everything else.

**Style is yours.**
The visual language is opinionated but not locked. Themes can be swapped.
Colors, fonts, density, and layout can be configured.

---

## What the app contains

### The canvas
An infinite, pannable, zoomable whiteboard. Four mother nodes are anchored
at fixed positions on startup — Pomodoro at center, Todos to the left,
Habits to the right, Terminal below. They cannot be moved or deleted.
The user pans and zooms freely around them. Child nodes spawned by the
assistant or by the user are free to drag and arrange anywhere on the canvas.

Nodes can be connected with visible edges. Connections carry events and
data between nodes, making the workspace behave as a system rather than a
collection of isolated widgets.

### Built-in nodes (v1 scope)

**Pomodoro timer** — 25-minute focus timer. Emits `onStart`, `onComplete`, `onBreak`.

**Habit tracker** — Rolling 7-day grid. Click to toggle. Streaks tracked and displayed.

**Todo / task list** — Tags, completion states, strikethrough. Fast.

**Terminal** — Live shell. Run `sys` commands. Run `claude "..."` to drive the board by voice or text.

### CLI integration
The `sys` command-line interface exposes the full state of the application
to any shell. Create boards, add nodes, wire connections, query state.

### What makes it different

| | krnl0 | Notion | Obsidian | Miro |
|---|---|---|---|---|
| Infinite canvas | ✓ | — | — | ✓ |
| Native Pomodoro | ✓ | — | plugin | — |
| Native habit tracking | ✓ | — | plugin | — |
| Connected nodes (events) | ✓ | — | — | — |
| CLI / programmable | ✓ | API only | partial | — |
| AI agent integration | native | partial | plugin | — |
| Local-first / offline | ✓ | — | ✓ | — |

---

*One canvas. Everything connected. Yours to own.*
