# THE SYSTEM — Functional Requirements

*Extracted from PRD v0.6.0 §13*
*Course: HTW Berlin · Natural User Interfaces · Inclusive Design*

Ten testable requirements with acceptance criteria. These are the ones demonstrated at the Jul 20 live demo.

---

## Requirements table

| # | Requirement | Acceptance criterion |
|---|---|---|
| R1 | User can create, edit, and complete todos via GUI | Add via button → todo appears in Todo mother. Click checkbox → strikethrough, dim. |
| R2 | User can run a Pomodoro with intent persistence | Start with label. Close + reopen — timer continues from correct elapsed time. |
| R3 | User can track habits across days | 7-day grid. Click cell → state toggles, streak updates. |
| R4 | All GUI actions are reachable via `sys` CLI | Every GUI action documented with CLI equivalent. Spec test verifies. |
| R5 | Two nodes can be wired with an edge | Drag from `pomo:onComplete` to `habit:markDone`. Complete a session — habit cell fills. |
| R6 | User can voice-control the app | Push-to-talk → speak → action executes. ≤3s end-to-end. |
| R7 | The assistant narrates its actions | Every successful turn produces audible reply summarizing change. |
| R8 | The assistant can plan a multi-step session | "Plan a 2-hour deep-work block" → spawns Pomodoro children + edges visibly. |
| R9 | Board persists losslessly across restarts | Save → close → open → byte-identical state, including mid-session. |
| R10 | App is fully operable without mouse OR without keyboard | Two flows: voice-only and keyboard-only, each completes a full session. |

---

## R10 — Inclusive design requirement (expanded)

R10 is the strongest answer to the course theme of Inclusive Design. Three modalities, one model:

### Modality 1 — Voice / low-vision / motor-limited
Full app control without keyboard or mouse. User presses orb (or Space), speaks intent, hears reply, sees canvas update. No pointing required.

**Test flow:** complete a full Pomodoro session — start, label it, wait for completion, hear the completion narration — without touching keyboard or mouse.

### Modality 2 — Keyboard / visual
Every action mapped to a shortcut. Tab order across all nodes. No mouse required.

**Test flow:** add a todo, check it off, start a Pomodoro, wire an edge — using keyboard only.

### Modality 3 — Power / CLI
Every GUI action reachable from the Terminal node via `sys`. If voice can do it, the CLI can do it. Same surface.

**Test flow:** replicate the full demo from R8 using only `sys` commands in the terminal.

---

## Inclusive design surfaces (R10 detail)

| Surface | Mechanism |
|---|---|
| Voice modality | Orb + STT + Brain + TTS |
| Keyboard modality | Global keybindings, Tab focus order, Space for orb |
| Visual (color) | Color is never the only signal — shape + text always accompanies color |
| Reduced motion | Setting disables orb breathing, edge pulses, spawn animation |
| High contrast | `--high-contrast` CSS variant — boosts ink/paper delta |
| Font scaling | All sizes via CSS variables |

---

## Evaluation mapping

| Course criterion | Points | Requirements |
|---|---|---|
| Interaction Design & Heuristic Evaluation | 20 | R1–R5, R10 surfaces |
| Fulfilled Requirements | 20 | R1–R10 all demonstrated |
| Concept & Design Process | 15 | This doc + `docs/01-concept/`, `docs/02-prd/` |
| Presentation & Delivery | 15 | Live demo Jul 20 |
| Documentation | 10 | This doc + README + TSDoc |
| Development Process | 10 | Git history + weekly self-review |
| System Diagram | 5 | `docs/03-architecture/diagrams/system-flowchart.md` |
| Research & References | 5 | `docs/07-roadmap/references.md` |
