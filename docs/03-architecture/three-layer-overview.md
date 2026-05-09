# krnl0 — Three-Layer Architecture Overview

*Extracted from PRD v0.6.0 §4*

The system is three loosely coupled layers. Each layer talks to the next through an explicit interface. No layer reaches across.

---

## The layers

```
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 1 — VOICE I/O                                             │
│   SttProvider (Whisper)        TtsProvider (Piper)              │
│   audio in → text              text → audio out                 │
└────────┬─────────────────────────────────────▲──────────────────┘
         │ transcript                          │ reply text
         ▼                                     │
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 2 — BRAIN (Strategy)                                      │
│   BrainProvider interface                                       │
│     ├── ClaudeCodeProvider  (default — `claude -p` subprocess)  │
│     ├── ApiProvider         (fallback — HTTPS to api.anthropic) │
│     └── OllamaProvider      (offline — local LLM)               │
│   BrainFactory selects one at startup based on settings.        │
└────────┬─────────────────────────────────────▲──────────────────┘
         │ runs sys commands                   │ reads context
         ▼                                     │
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 3 — ACTION & STATE                                        │
│   sys CLI (Facade) ── writes ──▶ board.json (Singleton)         │
│                                       │                         │
│   File watcher (Observer) ◀── change ──┘                        │
│                  │                                              │
│                  ▼ notifies                                     │
│   Canvas (React) re-renders                                     │
│                                                                 │
│   Static instructions: CLAUDE.md, skills/*.md (in source)       │
└─────────────────────────────────────────────────────────────────┘
```

This is the spine. Every other architectural decision serves it.

---

## Layer 1 — Voice I/O

**What it owns:** the microphone, the speakers, and the text boundary.

**In:** raw audio buffer from the mic.
**Out:** plain text transcript (to Layer 2).

**In:** plain text reply from Layer 2.
**Out:** synthesized audio to speakers.

Both providers run as local subprocesses. No network, no API keys, no cost.

| Provider | Tech | Notes |
|---|---|---|
| `WhisperProvider` | `whisper.cpp` subprocess | ~300ms for 5s audio on CPU. ~140MB model. |
| `PiperProvider` | `piper` subprocess | Good quality. Free. Fully offline. |

---

## Layer 2 — Brain (Strategy)

**What it owns:** deciding what to do with a transcript.

**In:** transcript (text) + `BrainContext` (board snapshot + instruction paths).
**Out:** `BrainReply` (text response + commands run).

The Brain is swappable. `BrainFactory` creates one instance at startup based on user settings.

| Provider | When | How |
|---|---|---|
| `ClaudeCodeProvider` | Default | Spawns `claude -p` subprocess. Uses user's existing subscription. |
| `ApiProvider` | Fallback | HTTPS to `api.anthropic.com`. User brings their own API key. |
| `OllamaProvider` | Offline | Spawns `ollama run`. No network. Less reliable for fuzzy intent. |

---

## Layer 3 — Action & State

**What it owns:** the board, the canvas, and the only mutation path.

`sys` is the **only** way to change `board.json`. No component writes it directly. No Brain writes it directly. Everything goes through `sys`.

The file watcher connects persistence to UI with zero glue code:
1. `sys` writes `board.json`
2. File watcher fires
3. Canvas re-renders with new state

`CLAUDE.md` and `skills/*.md` live in the source folder. They ship with the app. `ClaudeCodeProvider` points at them by absolute path so Claude Code reads them on every turn.

---

## Why this shape?

**Testability.** Layer 2 can be tested with mock STT and TTS. Layer 3 can be tested with a real `sys` binary and a temp `board.json`. No layer needs the others to be real.

**Replaceability.** Swap the Brain by implementing `BrainProvider`. Swap the STT by implementing `SttProvider`. The rest of the app doesn't change.

**Debuggability.** Every state change goes through `sys` and is written to a JSON file. You can `cat board.json` at any point and see exactly what the system knows.
