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

One JSON file in `~/Documents/the-system/board.json`. No SQLite, no IndexedDB, no cloud.

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
