# krnl0 — Test Coverage Map

*Maps functional requirements R1–R10 (from `docs/06-requirements/functional-requirements.md`) to test files, coverage status, and acceptance criterion status.*

*Test suite baseline: 271 passing, 1 todo (as of 2026-05-10, post-PR-#53).*

---

## Coverage Summary Table

| Req | Description | Test Files | Status | Acceptance Criterion |
|---|---|---|---|---|
| R1 | Create, edit, complete todos via GUI | `TodoNode.scenarios.test.ts`, `TodoNode.commands.test.ts`, `TaskNode.scenarios.test.ts` | Partial | Commands fully tested; GUI render path partially tested (scenarios cover add/toggle/sort but not inline edit interaction) |
| R2 | Pomodoro with intent persistence | `PomoNode.scenarios.test.ts`, `PomoNode.commands.test.ts` | Partial | FSM transitions fully tested; restart-resume (close + reopen with mid-session state) not covered by integration test |
| R3 | Track habits across days | `HabitNode.scenarios.test.ts`, `HabitNode.commands.test.ts` | Partial | 7-day grid derivation, streak math, toggleDay, and archive fully tested; cross-day boundary behaviour tested via fixed date helpers; no end-to-end GUI test |
| R4 | All GUI actions reachable via `sys` CLI | `tests/unit/sys/parser.test.ts` | Partial | CLI command parsing tested for `board`, `pomo`, `todo` sub-commands; no spec test verifying parity between GUI actions and CLI surface |
| R5 | Two nodes wired with an edge | None | Not tested | Edge creation via drag not tested; pomo→habit event propagation not tested |
| R6 | Voice control (push-to-talk, ≤3s) | None | Not tested | No STT/TTS integration tests exist; voice pipeline not yet implemented |
| R7 | Assistant narrates actions | None | Not tested | TTS narration not yet implemented |
| R8 | Multi-step plan from assistant | None | Not tested | Multi-step planner not yet implemented |
| R9 | Board persists losslessly across restarts | `tests/integration/board/roundtrip.test.ts` | Partial | Save/load round-trip tested with empty board and Zod schema validation; mid-session pomo state (running timer) round-trip not explicitly asserted |
| R10 | Operable without mouse OR keyboard | None | Not tested | Voice-only and keyboard-only flows not automated; inclusive design surfaces (reduced motion, high contrast, font scaling) not tested |

---

## Per-Requirement Detail

### R1 — Todos via GUI

**Files:**
- `tests/unit/renderer/TodoNode.commands.test.ts` — pure command coverage: `todo.add`, `todo.toggle`, `todo.edit`, `todo.remove`, `todo.clearDone`, `visibleItems` render-sort.
- `tests/unit/renderer/TodoNode.scenarios.test.ts` — Gherkin scenarios: add button renders item, toggle sets `done + strikethrough`, undone-first sort, `completedAt` tracking.
- `tests/unit/renderer/TaskNode.scenarios.test.ts` — Child task rendering: sequence number, layer, tag, eta, done state, `createNodeAdapter` handle presence.

**Status: Partial.** Command logic is thoroughly covered. The "edit" GUI interaction (click to open inline editor, type, blur to save) is not covered by a render test. `TaskNode` covers child node rendering but not the parent-to-child creation flow.

**Acceptance criterion gap:** "Click checkbox → strikethrough, dim" is tested via scenario. "Add via button → todo appears" is tested. Inline edit is not.

---

### R2 — Pomodoro with intent persistence

**Files:**
- `tests/unit/renderer/PomoNode.commands.test.ts` — FSM: `pomo.start`, `pomo.cancel`, `pomo.complete`, `pomo.skipBreak`, `pomo.endBreak`, `pomo.setLabel`, `pomo.setDuration`. All guard conditions tested.
- `tests/unit/renderer/PomoNode.scenarios.test.ts` — Derived UI: `calcRemainingPct`, `primaryButtonLabel`, `pipState` per FSM status. `createNodeAdapter` handle presence.

**Status: Partial.** The FSM state machine is fully covered. The acceptance criterion "Close + reopen — timer continues from correct elapsed time" requires an integration test that saves a running `PomoState` to disk, reloads it, and checks that `startedAt` produces correct remaining time. No such test exists.

---

### R3 — Habit tracking across days

**Files:**
- `tests/unit/renderer/HabitNode.commands.test.ts` — All six commands: `habit.add`, `habit.toggleDay`, `habit.markDone`, `habit.rename`, `habit.archive`, `habit.remove`. Streak calculation (`calcStreak`). Week helpers (`getMondayOf`, `getWeekDays`, `toYMD`, `prevDay`).
- `tests/unit/renderer/HabitNode.scenarios.test.ts` — Gherkin: ISO week helper, day-label ordering (Mon first), streak safe-from-yesterday rule, toggle idempotency.

**Status: Partial.** Core logic coverage is strong. No GUI render test exists. Cross-midnight/week-boundary behaviour is tested via fixed-date helpers but not end-to-end.

---

### R4 — sys CLI parity with GUI

**Files:**
- `tests/unit/sys/parser.test.ts` — `SysParser.parse()` correctness for `board show/save/load`, `pomo start/cancel/complete`, `todo add/toggle/remove` sub-commands.

**Status: Partial.** The parser layer is tested. There is no spec test that enumerates all GUI actions and asserts each has a CLI equivalent, as the acceptance criterion requires.

---

### R5 — Edge wiring

**Files:** None.

**Status: Not tested.** Edge drag-to-create, the `pomo:onComplete → habit:markDone` event propagation, and the resulting habit cell fill are all untested. React Flow's built-in edge rendering is not exercised by any test.

---

### R6 — Voice control

**Files:** None.

**Status: Not tested.** The voice pipeline (push-to-talk orb, STT, intent routing, canvas update) is not yet implemented in Phase 5. No tests exist or are applicable.

---

### R7 — Assistant narration

**Files:** None.

**Status: Not tested.** TTS narration is deferred (see Decision 6 — ElevenLabs deferred to v1.1; Piper is the planned local alternative). Not implemented.

---

### R8 — Multi-step planning

**Files:** None.

**Status: Not tested.** The multi-step session planner (spawn Pomodoro children + edges from a natural-language prompt) is not yet implemented.

---

### R9 — Board persistence round-trip

**Files:**
- `tests/integration/board/roundtrip.test.ts` — Save and reload `board.json` via `writeFileSync` / `readFileSync`. Validates with `BoardSchema` (Zod). Tests: empty board identity, Zod rejection of bad `version`, viewport round-trip.

**Status: Partial.** Structural round-trip is confirmed. Mid-session pomo state (a node with `status: "running"` and a `startedAt`) is not included as a fixture, so the restart-resume requirement (R2's acceptance criterion) is not integration-tested.

---

### R10 — Inclusive design / modality parity

**Files:** None.

**Status: Not tested.** The three modalities (voice-only, keyboard-only, CLI-only) require manual or end-to-end flows. None are automated. Inclusive design surfaces (reduced motion, high contrast, font scaling, color-is-never-the-only-signal) are CSS/visual properties not covered by any existing test.

---

## Infrastructure Coverage (not mapped to R1–R10)

| Test File | What it covers | Decision |
|---|---|---|
| `tests/unit/renderer/nodeRegistry.test.ts` | `NODE_REGISTRY` maps all four mother kinds; `resolveNodeComponent` falls back to `UnknownNode` | Decision 8 |
| `tests/unit/renderer/boardStore.viewport.test.ts` | Initial viewport, `panBy` screen-pixel math, `setViewport` zoom clamp, `zoomAt` focal-point invariant | Decision 7 |
| `tests/unit/renderer/AppChrome.scenarios.test.ts` | F1–F8 chrome panel Gherkin scenarios: TopBar content, StatusBar counts, Dock button callbacks, theme toggle + localStorage persistence, FIT button → `fitView()` | Phase 5 chrome |
| `tests/unit/main/handlers.pty.test.ts` | IPC-level coverage for node-pty migration (Issue #67 / Decision 12 / Decision 18): `pty:create` spawns proc + returns sessionId, `pty:write` routes to `proc.write`, `pty:resize` calls `proc.resize` (F13 no-op removed), `pty:kill` calls `proc.kill` and removes session, unknown sessionId paths are all silent no-ops. Covers **F4, F5, F13, F15** at the main-process IPC boundary. F9–F12 (live TTY echo, backspace, enter, arrow keys) remain manually verified — they require a compiled `node-pty` binary. | Decision 12, Decision 18 |

---

## TerminalNode IPC-level coverage (Issue #67)

**File:** `tests/unit/main/handlers.pty.test.ts` (13 tests, added 2026-05-10)

| F# | Criterion | Covered? | Notes |
|---|---|---|---|
| F4 | `pty:create` spawns PTY, returns sessionId, forwards `pty:data:*` / `pty:exit:*` | Yes | IPC handler test |
| F5 | `pty:write` routes to `proc.write(data)` | Yes | IPC handler test |
| F13 | `pty:resize` calls `proc.resize(cols, rows)` — no longer a no-op | Yes | IPC handler test |
| F15 | `pty:kill` calls `proc.kill()`, removes session from map | Yes | IPC handler test |
| F9 | Typed characters echo (real TTY echo from PTY) | Manual only | Requires compiled native binary |
| F10 | Backspace deletes previous character | Manual only | Requires compiled native binary |
| F11 | Enter submits line; shell executes command | Manual only | Requires compiled native binary |
| F12 | Arrow keys navigate history / cursor | Manual only | Requires compiled native binary |
| NF5 | `npm install` produces working terminal (postinstall hook) | Structural check | `package.json` postinstall script verified in audit |
| NF6 | Electron version switch triggers node-pty rebuild | Structural check | `@electron/rebuild` in devDeps; postinstall targets `node-pty` |

---

*Last updated: 2026-05-10*
