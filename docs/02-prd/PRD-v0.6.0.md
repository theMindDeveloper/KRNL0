# PRD v0.6.0 — Summary

*May 9, 2026 · Architecture locked · Ready for build*

> Short index of v0.6.0. The full canonical document lives at the repo root: [`krnl0-PRD-v0.6.0.md`](../../krnl0-PRD-v0.6.0.md). This file is the at-a-glance map.

---

## What changed from v0.4.2

| Decision | v0.4.2 | v0.6.0 (locked) |
|---|---|---|
| Plugin architecture | Core feature | **Cut.** Built-in nodes only. |
| Node types in v1 | 6+ | **3 anchored mothers + Terminal.** |
| Node placement | Free | **Mothers anchored. Children free.** |
| Desktop app | "v2 / browser-first" | **v1. Electron.** |
| Tech stack | Open | **Electron + TypeScript (strict) + React + Zustand + Zod.** |
| AI | Vague "Claude Code" | **Three-layer: Voice I/O + Brain (Strategy) + Action (`sys`).** |
| Brain | Single | **Swappable via BrainProvider. Default: Claude Code. Fallback: API. Offline: Ollama.** |
| Voice | Not in scope | **Whisper STT + Piper TTS, both local.** |
| Source of truth | Vague | **`board.json` — singleton, watched by file observer.** |
| Sync / multiplayer / mobile | In or out | **All cut.** |

---

## What it is

**krnl0** is a voice-driven canvas for personal planning. Four anchored mother nodes — Pomodoro, Todos, Habits, Terminal — sit at fixed positions on a paper-toned canvas. A floating orb is the AI assistant.

You can click and type — or press the orb and talk:

> *"Plan a two-hour deep-work block on the thesis, then a walk."*

The assistant transcribes your speech, runs commands against the same `sys` CLI a power user would type by hand, and reads back what it did. The canvas redraws in real time.

> **One canvas. Talk to it. Yours to own.**

---

## Three convictions

1. **Visible systems beat invisible ones.** Connections between nodes are rendered. Your setup is on the canvas, not buried in settings.
2. **The terminal is a peer, not an escape hatch.** Every GUI capability is reachable through `sys`. Same surface, different mouth.
3. **AI wires, it does not replace.** The assistant operates the same surface a user has — `sys` commands, `board.json`, `CLAUDE.md`. No backdoor.

---

## Academic context

HTW Berlin · *Natural User Interfaces* · Inclusive Design

### Inclusive design framing

Three modalities, one model:

| Modality | User group | Mechanism |
|---|---|---|
| Voice | Low-vision, motor-limited | Orb → Whisper → Brain → Piper |
| Visual / mouse | Standard | Canvas interactions |
| Keyboard / CLI | Power users | `sys` in Terminal node |

All three converge on the same `sys` surface, the same `board.json`, the same canvas.

---

## Architecture — three layers

See [`docs/03-architecture/`](../03-architecture/) for the full breakdown.

```
LAYER 1 — VOICE I/O   (SttProvider + TtsProvider)
LAYER 2 — BRAIN       (BrainProvider interface + BrainFactory)
LAYER 3 — ACTION      (sys CLI + board.json + File Watcher + Canvas)
```

---

## The node system

Four mother nodes, anchored:

| Mother | Position | Role |
|---|---|---|
| Pomodoro (`pomo`) | `(0, 0)` | Focus timer + session log |
| Todos (`todo`) | `(-480, 0)` | Active task list |
| Habits (`habit`) | `(480, 0)` | 7-day grid + streaks |
| Terminal (`term`) | `(0, 320)` | `sys` CLI host |

**Node contract:** every node has `id`, `kind`, `position`, `state` (JSON), `config`, `isMother`. Six rules: state is JSON-serializable, render is pure, commands mutate state, events are typed strings, no cross-node imports, no privileged access.

**Edges:** `{ id, from: { nodeId, event }, to: { nodeId, command }, args, enabled }` — stored in `board.json`, dispatched by kernel.

**Persistence rule:** persist intent, derive presentation. A running Pomodoro stores `startedAt`. The countdown is computed every render. Never save UI-derived state.

---

## Tech stack (locked)

| Concern | Choice |
|---|---|
| Desktop | Electron |
| Language | TypeScript strict |
| UI | React |
| State | Zustand |
| Validation | Zod |
| STT | Whisper (local) |
| TTS | Piper (local) |
| Brain (default) | Claude Code subprocess |
| Brain (fallback) | Anthropic API (BYOK) |
| Brain (offline) | Ollama |
| Testing | Vitest + React Testing Library |

---

## Ten functional requirements

See [`docs/06-requirements/functional-requirements.md`](../06-requirements/functional-requirements.md) for the full table with acceptance criteria.

| # | Requirement |
|---|---|
| R1 | Create, edit, complete todos via GUI |
| R2 | Pomodoro with intent persistence |
| R3 | Habit tracking across days |
| R4 | All GUI actions reachable via `sys` CLI |
| R5 | Two nodes can be wired with an edge |
| R6 | Voice-control the app |
| R7 | Assistant narrates its actions |
| R8 | Assistant plans multi-step sessions |
| R9 | Board persists losslessly across restarts |
| R10 | Fully operable without mouse OR without keyboard |

R10 is the inclusive-design requirement.

---

## 10-week roadmap

See [`docs/07-roadmap/build-roadmap.md`](../07-roadmap/build-roadmap.md).

Live demo: **July 20, 2026**.

---

*Architecture locked. Build starts week 1.*
