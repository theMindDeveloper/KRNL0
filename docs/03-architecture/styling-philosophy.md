# KRNL0 — Styling Philosophy and Color-Family Contract

**Status:** Active — first codified 2026-05-13, aligned with Decision 22.2.
**See also:** `docs/03-architecture/decisions.md` §Decision 22.2 "Styling philosophy (codified)" for the formal ADR rationale.

---

## Four-family color contract

KRNL0 uses four distinct semantic color families. Each family is tied to a **concept**, not a node kind. When in doubt about which token to use, identify the concept your affordance represents and pick the matching family.

---

### Blue / Cyan family — todo-family kinship

**Tokens:** `--cyan`, `--cyan-glow`

**Meaning:** "This element belongs to the todo plan."

**Surfaces:**
- TodoNode mother: MotherFrame border (`borderColor="var(--cyan-glow)"`), header bullet (`color: var(--cyan)`).
- TaskNode children: header bullet, selection ring, task-flow edges.
- CSS selection ring: `.krnl-kind-todo.selected`, `.krnl-kind-todo--task.selected` — `box-shadow: 0 0 0 2px var(--cyan), 0 0 16px rgba(78,168,176,0.35); border-radius: var(--radius-lg)`.
- Task-flow edges: `stroke: var(--cyan)`, `animated: true`, cyan drop-shadow `3px / 0.30` (hover: `9px / 0.85`).

**Rule:** Rounded corners + cyan ring = "this is part of the todo plan." No other node family uses cyan.

---

### Acid green family — active-focus signal

**Tokens:** `--acid` (plus glow values for shadows)

**Meaning:** "Something is running or requires your primary attention right now."

**Surfaces:**
- PomoNode active state (running ring, paused ring on TaskNode).
- Currently-running task ring (`isActiveRunning` / `isActivePaused`) — this is *not* a selection state, it is a "currently being timed" state; the two concepts are distinct.
- Default RF selection ring for all **non-todo** node kinds (Pomo, Habit, AI mothers and their children).
- Primary action CTAs: START button on TaskNode header (`color: var(--acid); border: 1px solid var(--acid)`).

---

### Rust family — danger / destructive / stop

**Tokens:** `--rust`, `--rust-deep`

**Meaning:** "This action is destructive or terminates something."

**Surfaces:**
- STOP button on TaskNode header (`color: var(--rust); border: 1px solid var(--rust)`).
- RESET button on PomoNode.
- Delete-button hover states across context menus.

**Rule:** Rust is only for stop, cancel, and delete. It must never appear on an element that merely navigates or configures.

---

### Spine family — identity / slot tags only

**Tokens:** `--spine`, `--spine-hot`

**Meaning:** "This is a positional or identity badge."

**Surfaces:**
- MotherFrame slot badge number (`01 / 04`).

**Rule:** Spine should never appear on interactive controls (buttons, inputs, toggles). It is reserved for read-only positional metadata.

---

## How to apply

When adding a new node kind, decide which family it belongs to and use those tokens exclusively. Cross-family colour leaks (e.g., a green "stop" button) erode the visual contract.

Checklist for a new node kind:
1. Determine whether the node is part of an existing semantic family (todo-plan, active-focus, etc.).
2. Use only that family's tokens for borders, bullets, selection rings, and primary CTAs.
3. If the node does not clearly belong to any existing family, treat that as a design signal to challenge the node's role — not as a reason to introduce a fifth hue.

---

## Rationale

The formal ADR is in `docs/03-architecture/decisions.md` at **Decision 22.2 — "Styling philosophy (codified)"** (2026-05-13). The short version: the four families give every element a legible conceptual role at a glance. A developer should be able to look at any affordance and immediately know whether it belongs to the todo plan (cyan), signals activity (acid), destroys something (rust), or identifies a slot (spine). That legibility degrades if the rules are not enforced consistently across all node kinds.
