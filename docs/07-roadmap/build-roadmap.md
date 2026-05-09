# krnl0 — 10-Week Build Roadmap

*Extracted from PRD v0.6.0 §14*
*Solo build. Learning TypeScript. Scope sized for that reality.*

---

## Deadlines

| Date | Deliverable |
|---|---|
| 06 Jun 2026 | 5-min progress presentation |
| 02 Jul 2026 | 5-min progress presentation |
| **20 Jul 2026** | **15-min final presentation + live demo** |
| 03 Aug 2026 | Written documentation submission |

≈10 weeks to the live demo from May 9.

---

## Week 1 (May 9–15) · Setup + kernel

- Electron + React + TypeScript scaffold
- Token system, fonts, light/dark toggle
- Zustand store with `Node` and `Edge` types
- `Persistence.save/load` with round-trip test
- One placeholder node renders on canvas

**Demo:** open app, see paper canvas with one square, toggle theme, save & reload.

---

## Week 2 (May 16–22) · Canvas + mother nodes

- DOM-based pan + zoom canvas
- Four mother nodes anchored at fixed positions
- Pomodoro working (with persistence rule — `startedAt`, derive countdown)
- Todo: add / check / delete
- Habit: 7-day grid, tap to toggle

**Demo:** all four mothers functional. No edges yet.

---

## Week 3 (May 23–29) · Edges + child nodes

- Edge data model + SVG rendering
- Edge dispatcher in kernel
- Drag-to-connect
- Child node spawning + active-edge pulse (acid-green, ~600ms)

**Demo:** start Pomodoro → child session appears → drag edge to habit → complete → habit fills.

---

## Week 4 (May 30 – Jun 5) · Terminal + sys CLI

- Terminal node (xterm.js) with acid-green styling
- Full `sys` CLI from §9
- IPC plumbing (main ↔ renderer)
- Parser unit tests

**Demo at Jun 6:** every GUI action also doable from terminal.

---

## Week 5 (Jun 6–12) · Voice STT + brain

- `WhisperProvider` via `whisper.cpp`
- Push-to-talk on orb (Space)
- `BrainProvider` interface + `ClaudeCodeProvider`
- `BrainFactory` + settings UI (which brain to use)
- `CLAUDE.md` + initial `skills/`

**Demo:** press orb, say *"add a todo to call mom"* → todo appears.

---

## Week 6 (Jun 13–19) · Voice TTS + reply

- `PiperProvider`
- Reply narration above orb + TTS playback
- Error handling: API failure, mic denied, empty transcription

---

## Week 7 (Jun 20–26) · Plan-a-session demo

- Multi-step assistant turns: *"plan a 2-hour deep-work session"* → multiple child nodes + edges
- Visual feedback as nodes appear sequentially

**Demo at Jul 2:** the Iron Man moment.

---

## Week 8 (Jun 27 – Jul 3) · Inclusive design + a11y

- Reduced-motion setting
- High-contrast variant
- Keyboard navigation throughout (Tab order, all actions keymapped)
- Lo-fi heuristic evaluation with 3 testers (course requirement)

---

## Week 9 (Jul 4–10) · Polish + bug bash

- Visual polish on every node
- Loading, empty, error states
- ASCII boot screen on terminal
- Performance: confirm 60fps with 50+ nodes

---

## Week 10 (Jul 11–17) · Demo prep

- Slides for Jul 20
- Live demo script, rehearsed end-to-end
- README + inline TSDoc on public APIs
- Backup video in case live demo fails

---

## Buffer (Jul 18 – Aug 3) · Documentation

- Written submission
- Clean system diagram (export of Mermaid)
- Research & references doc
- User journey map
- Heuristic evaluation report

---

> This schedule has no slack. Every slipped week eats polish. Cut features early — three polished mothers beats four broken ones.

---

## What was explicitly cut

So we don't drift back:

- Plugin system, manifest, sandbox, registry
- Multiple boards (one in v1)
- Cloud sync, multiplayer
- Mobile companion
- Project board node, image node, additional node types
- Local LLM as default (it's an option, not the default)
- Real-time voice models (OpenAI Realtime, Sesame)
- MCP server (v1.1 polish)
- ElevenLabs (v1.1 opt-in)
- Background tray app
- Custom themes (token system supports them; we don't ship more than light + dark)
- Web/browser version
