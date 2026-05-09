# krnl0

> *One canvas. Talk to it. Yours to own.*

**krnl0** is a voice-driven personal planning canvas. Four anchored mother nodes — Pomodoro, Todos, Habits, Terminal — sit at fixed positions on a paper-toned infinite canvas. A floating orb is the AI assistant.

You can click and type, or press the orb and talk.

*"Plan a two-hour deep-work block on the thesis, then a walk."*

The assistant transcribes your speech, decides what to do, runs commands against the same `sys` CLI a power user would type by hand, and reads back what it did. The canvas redraws in real time.

---

## The design idea

| Modality | How |
|---|---|
| Voice / low-vision | Speak to the orb (Whisper STT → Brain → Piper TTS) |
| Visual / mouse | Click, drag, connect nodes on the canvas |
| Power / keyboard | Type `sys` commands in the Terminal node |

All three converge on the same `sys` surface, the same `board.json`, the same canvas. That convergence is the inclusive-design story.

---

## Principles

- **Visible systems.** Connections between nodes are rendered on the canvas. Your setup is something you can see, not something buried in settings.
- **Terminal as peer.** Every GUI action is reachable through `sys`. If `sys` can't do it, voice can't either.
- **AI uses the same surface.** The assistant runs `sys` commands like a user would. No privileged API, no backdoor.

---

## Architecture — three layers

```
┌─────────────────────────────────────────────────────────────┐
│ LAYER 1 — VOICE I/O                                         │
│   SttProvider (Whisper)      TtsProvider (Piper)            │
│   audio in → text            text → audio out               │
└────────┬─────────────────────────────────────▲──────────────┘
         │ transcript                          │ reply text
         ▼                                     │
┌─────────────────────────────────────────────────────────────┐
│ LAYER 2 — BRAIN (Strategy)                                  │
│   BrainProvider interface                                   │
│     ├── ClaudeCodeProvider  (default · subprocess)          │
│     ├── ApiProvider         (fallback · HTTPS)              │
│     └── OllamaProvider      (offline · local LLM)          │
└────────┬─────────────────────────────────────▲──────────────┘
         │ runs sys commands                   │ reads context
         ▼                                     │
┌─────────────────────────────────────────────────────────────┐
│ LAYER 3 — ACTION & STATE                                    │
│   sys CLI (Facade) ──writes──▶ board.json (Singleton)       │
│   File watcher (Observer) ◀─change─┘                        │
│   Canvas (React) re-renders on every change                 │
└─────────────────────────────────────────────────────────────┘
```

See [`docs/03-architecture/`](docs/03-architecture/) for the full design patterns map and the Mermaid flowchart.

---

## Design documentation

The `docs/` folder tells the full design story — from first concept to locked architecture:

| Folder | Contents |
|---|---|
| [`01-concept/`](docs/01-concept/) | Original product description — the "what" before the "how" |
| [`02-prd/`](docs/02-prd/) | PRD history: v0.4.2 (Apr 26) → v0.6.0 (May 9, canonical) |
| [`03-architecture/`](docs/03-architecture/) | Architecture decisions, design patterns, system diagram |
| [`04-visual-system/`](docs/04-visual-system/) | Color tokens, typography, layout principles |
| [`05-node-system/`](docs/05-node-system/) | Node contract, edge model, persistence rules |
| [`06-requirements/`](docs/06-requirements/) | 10 functional requirements with acceptance criteria |
| [`07-roadmap/`](docs/07-roadmap/) | 10-week build plan + research references |

---

## Tech stack (locked)

| Concern | Choice |
|---|---|
| Desktop shell | Electron |
| Language | TypeScript strict |
| UI | React |
| State | Zustand |
| Validation | Zod |
| STT | Whisper (local, whisper.cpp) |
| TTS | Piper (local) |
| Brain (default) | Claude Code subprocess |
| Brain (fallback) | Anthropic API (BYOK) |
| Brain (offline) | Ollama |
| Testing | Vitest + React Testing Library |

---

## `sys` CLI reference

```
sys pomo start [--label "..."] [--minutes 25]
sys pomo stop / status

sys todo add "..." [--tag work]
sys todo check <id>
sys todo list

sys habit add "<name>"
sys habit done <name> [--date YYYY-MM-DD]
sys habit streak <name>

sys edge add --from <node:event> --to <node:command>
sys edge list / remove <id>

sys board show / save / load <path>

sys say "..."     # speak via TTS
sys hear          # one-shot STT transcription
```

Every command supports `--json` for machine-readable output.

---

## Project setup (Week 1)

```bash
npm install
npm run dev       # Electron + Vite dev server
npm test          # Vitest
npm run typecheck # tsc --noEmit
```

---

## Deadlines

| Date | Deliverable |
|---|---|
| 06 Jun 2026 | 5-min progress presentation |
| 02 Jul 2026 | 5-min progress presentation |
| **20 Jul 2026** | **15-min final presentation + live demo** |
| 03 Aug 2026 | Written documentation submission |

---
## License

THE SYSTEM is licensed under the [Functional Source License v1.1](LICENSE.md), with an Apache 2.0 future grant.

- Free to use, fork, modify, self-host, contribute to
- Free to build plugins and themes for
- Not free to sell as a competing commercial product
- Each release becomes Apache 2.0 two years after publication

