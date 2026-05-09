# krnl0 — Product Description & Requirements
*April 26, 2026 · Pre-architecture draft*

---

## What is krnl0?

krnl0 is an all-in-one personal operating system for people who want to
manage their entire life — tasks, focus, habits, projects, journaling, and
automation — from a single, beautiful, spatial workspace.

It is best understood as the intersection of three products that have never
been properly combined:

- **Obsidian** — depth, local-first, extensible, yours to own
- **Miro** — infinite canvas, spatial thinking, visual organization
- **A terminal** — programmable, AI-native, automatable

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

**Open and extensible.**
krnl0 ships with a core set of nodes. Everything beyond that is a
plugin. The community can build and publish new node types — a finance
tracker, a reading list, a GitHub issue viewer, a sleep logger — and
anyone can install them. The system grows with its users.

**Style is yours.**
The visual language is opinionated but not locked. Themes can be swapped.
Colors, fonts, density, and layout can be configured. The community can
publish themes the same way it publishes plugins.

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

Boards are named workspaces. A user might have a `deep-work` board, a
`morning-routine` board, and a `project-alpha` board. Each is a separate
canvas with its own nodes and connections.

### Built-in nodes (v1 scope)

**Pomodoro timer**
A 25-minute focus timer with session tracking. Shows current session count,
progress bar, and elapsed time. Emits events when a session starts,
completes, or breaks — other nodes can react to these.

**Habit tracker**
A rolling grid showing habit completion across the past week. Habits are
user-defined. Each cell is tappable. Streaks are tracked and displayed.
Designed to be glanceable — one look tells you where you are.

**Todo / task list**
A simple, fast task list with tags and completion states. Tasks can be
tagged by context (work, life, home) and checked off directly on the
canvas. Multiple todo nodes can coexist — one for today, one for the
week, one per project.

**Project board**
A lightweight kanban-style board for tracking projects and milestones.
Columns, cards, and status — the minimal viable project tracker embedded
directly in the canvas.

**Journal**
A date-indexed prose writing node. Write daily entries, capture
reflections, log session notes. Indexed and searchable. Stays private and
local by default.

**Text note**
A free-form writing node for ideas, references, and inline documentation.
Renders as large, readable prose on the canvas.

**Image / media**
Embed images, screenshots, or ASCII art directly on the canvas. Supports
captions and linking to other nodes.

**Terminal**
A live shell session embedded as a node. Supports standard shell commands,
custom `sys` CLI commands for controlling the board, and direct AI agent
integration via `claude`, `codex`, or any compatible tool. The terminal
node is how power users drive everything.

### CLI integration
The `sys` command-line interface exposes the full state of the application
— boards, nodes, connections, settings — to any shell or script. Users
can create boards, add nodes, wire connections, and query state
programmatically.

The terminal node brings this CLI directly onto the canvas. Running
`claude "wire my Pomodoro to my habit tracker"` triggers an AI agent that
reads the current board state and executes the wiring. Claude Code, Codex,
and any OpenAI-compatible agent are supported. Local LLMs via Ollama are
on the roadmap.

This makes the entire workspace programmable. Automations, scripts,
morning routines triggered by a cron job, AI agents that update your
task list based on your calendar — all of this is possible through the
CLI layer.

### Plugin system
Beyond the built-in node library, krnl0 supports community-built
node types. A plugin is a self-contained node that installs from a
registry or a local file. The goal is that any tool a productive person
might want on their canvas can be built, shared, and installed without
touching the core application.

The plugin system is the primary mechanism for long-term growth. The core
team maintains the canvas, the CLI, and the built-in nodes. The community
extends everything else.

### Theming
The default visual language is Anthropic-warm meets cyberpunk terminal:
warm paper tones at rest, acid green and rust orange as accents, monospace
type throughout, block-character ASCII art as the signature aesthetic.

Both a light and dark theme ship out of the box. The full color and
typography system is token-based, meaning any theme can be applied by
swapping a single file. Community themes are installable the same way as
plugins.

---

## Who it is for

**Primary user:** The technical knowledge worker — an engineer, founder,
researcher, or maker — who thinks spatially, lives in the terminal, runs
their own productivity stack, and is frustrated by the fragmentation of
existing tools. They want one place, they want it programmable, and they
want to own their data.

**Secondary user:** The obsessive optimizer — not necessarily technical,
but someone who has tried every productivity app and found all of them
lacking in some dimension. They want depth, flexibility, and a system
that grows with them.

**Community contributor:** Developers who want to build and publish nodes
for their own workflows. The extensibility model is designed to make
contributing a new node type achievable in an afternoon.

---

## What makes it different

| | krnl0 | Notion | Obsidian | Miro | Linear |
|---|---|---|---|---|---|
| Infinite canvas | ✓ | — | — | ✓ | — |
| Native Pomodoro | ✓ | — | plugin | — | — |
| Native habit tracking | ✓ | — | plugin | — | — |
| Native journaling | ✓ | partial | ✓ | — | — |
| Connected nodes (events) | ✓ | — | — | — | — |
| CLI / programmable | ✓ | API only | partial | — | API only |
| AI agent integration | native | partial | plugin | — | partial |
| Open plugin system | ✓ | — | ✓ | — | — |
| Local-first / offline | ✓ | — | ✓ | — | — |
| Theming | ✓ | limited | ✓ | limited | — |

---

## Out of scope (v1)

- Calendar integration (v2)
- Mobile native app (companion web app only)
- Real-time multiplayer (single-user local-first first)
- Billing / subscription (open-source, self-hostable)
- Native desktop app (browser-based v1, Electron/Tauri v2)

---

*One canvas. Everything connected. Yours to own.*