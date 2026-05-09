# krnl0 — Product Description & Requirements
*April 26, 2026 · Pre-architecture draft*

---

## What is krnl0?

krnl0 is an all-in-one personal operating system for people who want to
manage their entire life — tasks, focus, habits, projects, journaling, and
automation — from a single, beautiful, spatial workspace.

It is best understood as the intersection of products that have never
been properly combined:

- **Obsidian** — depth, local-first, extensible, yours to own
- **Miro** — infinite canvas, spatial thinking, visual organization
- **A terminal** — programmable, AI-native, automatable
- **Habit tracker** — rolling 7-day grid, streaks, momentum
- **To-do list** — fast, taggable, connected to other nodes
- **Pomodoro timer** — native, event-emitting, connectable to other nodes
- **AI agent** — a helpful assistant that can talk to all the nodes and operate the system by voice or text commands

The result is a whiteboard where every widget is a living tool, every tool
can talk to every other tool, and the whole thing can be driven by AI agents
through a native CLI integration.

It is not a note-taking app. It is not a project tracker. It is not a habit
app. It is the layer above all of them — one place where your work, your
routines, your focus sessions, and your thinking coexist and connect.

---

## The problem it solves

The average productive person runs 6 to 10 separate apps to manage their
life: a task manager, a habit tracker, a Pomodoro timer, a notes tool, a
project board, a journal, a calendar. None of these tools share state.
None of them know about each other. Switching between them costs time and
attention, every single day.

The deeper problem is that these things are not actually separate. Your
focus session is related to your task list. Your habits feed your project
momentum. Your journal reflects on your goals. Keeping them in separate
apps is an artificial constraint imposed by how software has been built,
not by how human productivity actually works.

krnl0 removes that constraint. Everything lives on one canvas.
Everything can connect to everything else.

---

## Core principles

**One canvas, everything on it.**
There is no switching between apps. Your Pomodoro timer, your tasks, your
habits, your journal, your project board — all of it lives on the same
infinite whiteboard. You arrange it the way your brain works, not the way
a product manager decided it should work.

**Modular by design.**
Every widget is a node. Every node is independent, configurable, and
replaceable. You can have one Pomodoro node or five. You can have a habit
tracker for fitness and a separate one for work. The canvas is yours to
compose as you see fit.

**Connections are first-class.**
Nodes can be wired together. When your Pomodoro session ends, it can mark
a task done, log a journal entry, or increment a habit. These connections
are visible on the canvas — you can see your system, not just use it.

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
An infinite, pannable, zoomable whiteboard. Nodes are placed freely. The
user arranges them in whatever spatial layout makes sense to them — a
daily dashboard, a project war room, a morning routine board, a weekly
review spread. There is no imposed structure.

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
