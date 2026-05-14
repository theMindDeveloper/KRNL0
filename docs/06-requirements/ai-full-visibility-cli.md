# AI Full-Visibility CLI — Requirements

**Status:** Draft, 2026-05-14
**Scope:** Fixes for [#117](https://github.com/theMindDeveloper/KRNL0/issues/117) **plus** the wider mandate "AI should see and operate on everything a user can see and do, and more, through `sys` / `krnl` commands."
**Audience:** in-terminal Claude running inside a TerminalNode (PR #108 surface), and any external operator script.

---

## 0. Motivation

Field-test of PR #108 found that in-terminal Claude cannot chain multi-node workflows. Root causes:

1. `krnl todo list` emits 8-char short IDs that downstream flags reject.
2. `krnl board show` is a stub — no machine-readable view of board state.
3. `krnl node list` is a stub.
4. `krnl todo add` documented as creating "TodoItem + linked TaskNode", but actually only creates a bare TodoItem (Decision 20 invariant 1 violated for the CLI path).
5. No `--json` flag for any read command — Claude cannot parse output.

The wider mandate goes further: **every piece of state visible in the UI must be readable by sys**, and **every mutation the user can perform must be writable by sys**, plus operations no user gesture covers (bulk, scripted, cross-cutting).

---

## 1. Vocabulary

- **sys / krnl CLI** — the command surface this doc specifies. `sys` is the internal facade (`SysFacade.ts`), `krnl` is the user-visible binary.
- **Board** — the JSON document at `~/Documents/krnl0/board.json` (configurable via `KRNL0_BOARD_PATH`).
- **Mother nodes** — fixed-slot kinds: `todo`, `pomo`, `habit`, `term`, `calendar`. There is at most one of each (`isMother: true`).
- **Child nodes** — free-floating kinds: `todo.task`, `pomo.session`, `habit.day`, `text`, `image`, `clock`.
- **Edge** — `{ id, from: { nodeId, event }, to: { nodeId, command }, enabled }`.
- **Ref** — a string used to identify a node, todo item, habit, or edge in a CLI argument. May be a full UUID, an 8+ character UUID prefix, or (for habits/todos/tasks) a unique text/name match.

---

## 2. ID resolution — the global rule

**Every command that accepts an `<id>`-shaped argument must accept a `Ref`** as defined above. Resolution algorithm (shared helper, used everywhere):

```
resolveRef(board, ref, kind?) → { ok: true, id } | { ok: false, reason }
```

1. **Exact UUID match** — if `ref` exactly equals an existing id, return it.
2. **Prefix match** — if `ref` is at least 4 characters and exactly one id of the requested kind starts with `ref`, return that id.
   - If 0 matches → `{ ok: false, reason: 'no match' }`
   - If >1 matches → `{ ok: false, reason: 'ambiguous: <list of full ids>' }`
3. **Text/name fallback** (only where natural-language identification is unambiguous: habit names, todo item text, task text) — if exactly one node has a `state.name`/`state.text`/`items[i].text` equal to `ref` (case-insensitive), return its id.

This rule covers issue #117 §1 (`task add --todo <prefix>`), the existing habit name fallback (already done), edges (issue #117 "What did not get tested" section), and any future ID-taking command. **No command may bypass `resolveRef`.**

**Exit code on ambiguous ref:** 1 (user error), with message listing the matches.

---

## 3. Output format — the JSON-or-human rule

Every read command must support **two output modes**:

- **Default (human):** existing pretty format — multi-line, fits a terminal, no JSON.
- **`--json`:** the command writes **bare JSON to stdout, nothing else**. Status messages, log lines, banners, and the `[stub] parsed: ...` placeholder MUST NOT appear. Errors still go to stderr with exit code 1.

Commands required to support `--json`:

- `board show`
- `node list`, `node read <ref>`
- `todo list`
- `task list`
- `habit list`
- `edge list`
- `clock show`, `calendar show`, `term show`, `pomo show`

Commands that already return useful data but emit human output today (`task list`, `todo list`, `habit list`) gain the flag without changing default behavior.

---

## 4. Issue #117 fix matrix

| # | Fix | Specifically |
|---|---|---|
| 1 | `task add --todo <ref>` accepts prefix | Route `--todo` through `resolveRef`. Same applies to every other ref-taking flag (`--from`, `--to`, `--id`, all positional ids). |
| 2 | `board show` emits bare JSON | Default form prints a human summary (count of nodes by kind + count of edges). `--json` prints `JSON.stringify(board)` and nothing else. |
| 3 | `node list` is real | Default: `<id8>  <kind>  <short-summary>` per line. `--json`: array of `{ id, kind, isMother, position, summary }`. |
| 4 | `todo add` creates pair | The shared dispatch gains a `createTodoTaskPair` pure function. `sys/commands/todo.todoAdd` is rewritten to route through it. After this change, Decision 20 invariant 1 holds for the CLI path; the renderer path (`commandDispatch.ts:985–1117`) still uses its own inline implementation. **Follow-up:** swap the renderer to call `createTodoTaskPair` for full parity per ADR-0014 §11 — out of scope for this PR because the renderer's inline logic is several layers deep (text-suffix parsing, store wiring, IPC save) and re-plumbing it through the pure helper deserves its own diff. |
| 5 | `--json` recommendation in CLAUDE.md | After the flags ship, `claude/CLAUDE.md` is updated: read paths recommend `--json`. Rule 1 stays ("never write board.json directly") but is reworded — reading is fine, writing requires `krnl`. |

---

## 5. Full visibility — what every command must expose

The CLI must let a Claude operator answer all of the following without reading `board.json` directly:

### 5.1 Whole-board snapshot

- `krnl board show [--json]` — full board (every node + every edge + viewport + theme).
- `krnl board summary` — counts (`5 nodes (3 mother, 2 child) · 4 edges · theme: dark`).
- `krnl board stats` — per-kind counts.

### 5.2 Nodes (generic)

- `krnl node list [--kind <k>] [--mother] [--child] [--json]` — list every node.
- `krnl node read <ref> [--json]` — full state + config + position + edges incident.
- `krnl node add <kind> [--at x,y] [--mother]` — create any allowed kind (already partial; complete it).
- `krnl node remove <ref>` — remove a node (cascade-safe: for `todo.task` use `deleteTaskCascade`; for mother nodes refuse unless `--force`).
- `krnl node move <ref> --to x,y` — move (already exists, only resolveRef change).

### 5.3 Edges / connections

- `krnl edge list [--json]` — every edge in the board.
- `krnl edge add --from <ref:event> --to <ref:command>` — both refs resolved via `resolveRef`. Event/command names are validated against the node's event/command surface (e.g. `task.next`, `task.activate`, `pomo.start`). Unknown event/command → exit 1 with hint listing valid names.
- `krnl edge remove <ref>` — remove by edge id (prefix-matched).
- `krnl edge disable <ref>` / `krnl edge enable <ref>` — flip `enabled` flag.

### 5.4 Per-kind read commands (full visibility into mother-node state)

Each mother kind gets a `show` sub that prints its UI-visible state in a structured form. Default human, `--json` machine.

- `krnl todo show [--json]` — mother TodoNode state: items, tags, view filter.
- `krnl habit show [--json]` — habits list, color, view, schedule, log entries.
- `krnl pomo show [--json]` — status, activeTaskId, startedAt, durationMin, elapsedSec.
- `krnl term show [--json]` — TerminalNode title, fontSize, shell, sessionId.
- `krnl calendar show [--json]` — selectedDate, anchorDate, view, hourRange.
- `krnl clock show [--json]` — linkedTodoId, viewWindow.

These are read-only views — they do not mutate.

### 5.5 History / undo / redo

- `krnl history list [--json]` — recent undo entries (count, ages). Backed by the renderer's history stack; requires open renderer (exit 2 otherwise) — but `--json` returns `{ undoCount, redoCount }` from board metadata if available.
- `krnl undo`, `krnl redo` — already exist, renderer-coupled.

### 5.6 Settings / theme / viewport

- `krnl settings show [--json]` — `{ theme, viewport: {x, y, zoom}, boardPath, version }`.
- `krnl theme show` — current theme.
- `krnl viewport show [--json]` — current viewport.
- All set commands (`theme set`, `viewport pan`, `viewport zoom`) already exist.

### 5.7 Self-introspection (for AI)

- `krnl info` — single-page summary: counts, mother-node ids, recent edits, theme. Designed for Claude's "where am I?" first call.
- `krnl whoami` — already exists (RPC socket, pid).

---

## 6. Full mutation — beyond what the UI exposes

Per the user's mandate ("Claude should be able to add, delete, edit nodes and connections that a user can — and even more"):

### 6.1 Bulk and scripted operations

- `krnl task bulk-add --todo <ref> --json '[ { "text": "...", "durationMin": 60 }, ... ]'` — chain-create N tasks under one todo, returning all new IDs as a JSON array.
- `krnl edge bulk-add --json '[ { "from": "...:done", "to": "...:start" }, ... ]'` — chain-wire N edges.
- `krnl task chain <ref1> <ref2> [<ref3> ...]` — convenience: wire `task.next → task.activate` edges between consecutive refs in left-to-right order.

### 6.2 Cross-cutting edits unavailable in UI

- `krnl node set-position <ref> --x N --y N` — direct position write (the user's drag-gesture peer; useful for layouts).
- `krnl node set-state <ref> --json '{ ... }'` — direct, schema-validated state write. Validates against the node-kind's Zod schema if defined; refuses on validation failure with the Zod issue path. **This is the "and even more" surface — it is the lowest-level mutation, intended for AI orchestration, not for routine use.**
- `krnl node set-config <ref> --json '{ ... }'` — same for config.

### 6.3 Atomic multi-mutation

- `krnl batch --json '[ { "cmd": "task add", "args": [...] }, ... ]'` — run a sequence of CLI commands atomically. The board is loaded once, every command mutates in memory, and the result is saved once on success. If any command fails, the whole batch aborts and the file is not rewritten. (Implementation note: re-entrant call into `SysFacade.run` with a shared in-memory board; this is the right place for cross-cutting mutation invariants because `saveBoard` only fires at the end.)

The "30-day ML plan" scenario in issue #117 becomes a single `krnl batch` call.

---

## 7. Safety rails

- **Mother-node refuse-by-default:** `node remove` on a mother node returns exit 1 with `--force` hint. Reason: there's typically one of each, and removing one breaks the UI semantics. With `--force`, allow it, but cascade the children.
- **Read-only fields:** `id`, `kind`, `isMother`, `createdAt` cannot be changed via `node set-state`. The writer ignores them with a stderr warning.
- **Schema validation:** when a node-kind has a Zod state schema, `set-state` must pass before save.
- **No partial writes:** every mutation either completes (saveBoard runs once) or returns exit 1 without touching disk.

---

## 8. Acceptance — the field-test scenario

After this work ships, this exact transcript succeeds without any "can't find ID" errors and without Claude reading `board.json` directly:

> **User:** "create a whole workflow with habits and tasks to learn ML in 30 days"

> **Claude flow:**
> 1. `krnl habit add "Daily ML Study"` × 3
> 2. `krnl habit color "Daily ML Study" acid` etc. (name resolution)
> 3. `krnl todo add "Week 1: Python & Math Foundations" --tag ml` × 4 — each call returns `{ todoItemId, taskNodeId }` and the canvas shows the linked pair
> 4. `krnl todo list --json` → parsed; Claude reads first 4 ids
> 5. `krnl task add "Linear algebra review" --todo week1 --duration 60` — `week1` matches prefix or text
> 6. `krnl edge add --from week1:done --to week2:start` — both prefix-matched
> 7. (Optional) `krnl batch` rolling all of the above into one call
> 8. Reply: "Built the 30-day plan — 3 habits, 4 weekly milestones, N tasks. Take a look."

---

## 9. Test coverage delta

New `tests/unit/sys/` files:

- `board.commands.test.ts` — `board show`, `board show --json`, summary, stats.
- `node.commands.test.ts` — `node list`, `node read`, `node remove` cascade, `node set-state` validation.
- `edge.commands.test.ts` — `edge add` with prefix refs, event/command validation, list, remove, enable/disable.
- `todo.pair.test.ts` — `todo add` creates pair, items linked bidirectionally (Decision 20).
- `resolveRef.test.ts` — exact, prefix, name fallback, ambiguous reporting.
- `batch.test.ts` — atomic success and atomic abort.

Existing `parser.test.ts` extended with new flag/sub cases.

---

## 10. Non-goals (out of scope for this issue)

- Streaming/incremental board updates (still one-shot load/save).
- Permissioning per command (RPC token gate stays as-is).
- A different on-disk format (board.json shape is unchanged).
- New node kinds.

### 10.1 Descoped from §6 — deferred to a follow-up

After advisor review, the following from "Full mutation — beyond what the UI exposes" are deferred:

- **`node set-state --json`** — direct state write bypasses every node-kind FSM and the Zod schemas that exist precisely because Decision 20 invariants depend on routing through them. Not worth a back door.
- **`node remove --force` on mothers** — the UI renders nothing without the mother of each kind. Refuse without `--force` is fine; the escape hatch isn't needed.
- **`krnl batch`** — atomic re-entrant `SysFacade.run` is a real refactor (every command does its own `loadBoard`/`saveBoard`). `task chain` + prefix-match resolves the field-test scenario without it.
- **Per-kind `show` commands** (`todo show`, `pomo show`, …) — redundant with `node read <ref> --json` once that exists, since each is a one-node subset of `board show --json`. The `<kind>.show` pattern can be revisited if a real ergonomic gap emerges.

---

## 11. References

- Issue [#117](https://github.com/theMindDeveloper/KRNL0/issues/117)
- ADR-0014 §11 — shared-dispatch contract
- Decision 20 — bidirectional link + cascade invariants
- `claude/CLAUDE.md` — in-terminal Claude instructions (updates land alongside this work)
