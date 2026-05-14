# AI Full-Visibility CLI — Implementation Report

Companion to [ai-full-visibility-cli.md](ai-full-visibility-cli.md). Documents what landed in [PR #119](https://github.com/theMindDeveloper/KRNL0/pull/119), the design choices behind it, and what was deliberately deferred.

---

## 0. TL;DR

- Solved all 5 blockers from issue #117.
- Added 6 new commands (`board show/summary/stats`, `node list/read/remove/set-position`, `edge add/remove/list/enable/disable`, `info`, `settings show`, `viewport show`, `task chain`).
- Added `--json` to every read command.
- Added shared `resolveRef` so every `<ref>`-shaped argument accepts full UUID, ≥4-char prefix (git-style), or unique text/name match.
- Added shared `createTodoTaskPair` so the CLI honors Decision 20 invariant 1 (TodoItem + TaskNode bidirectional pair at creation).
- 977 tests pass, typecheck clean.

---

## 1. New files

| File | Purpose |
|---|---|
| `src/shared/dispatch/resolveRef.ts` | One rule for `<ref>` resolution: full id, prefix (≥4 chars), or text/name match. Exports `resolveNodeRef`, `resolveTodoItemRef`, `resolveHabitRef`, `resolveEdgeRef`, `resolutionError`. |
| `src/shared/dispatch/todo.ts` | Pure `createTodoTaskPair(board, args, ctx)` that creates the TodoItem + TaskNode pair, sets the bidirectional link, positions the new task by sequence, and chains the previous sibling. |
| `src/sys/commands/node.ts` | Real `node list`, `node read`, `node remove` (cascades for tasks; refuses mothers without `--force`), `node set-position`. |
| `src/sys/commands/info.ts` | `info`, `settings show`, `viewport show` — single-call snapshots for AI bootstrapping. |
| `tests/unit/sys/resolveRef.test.ts` | Exact, prefix, ambiguous, name-fallback coverage for the resolver. |
| `tests/unit/sys/todo.pair.test.ts` | `todo add` creates pair; verbatim issue #117 §8 step 5 scenario. |
| `tests/unit/sys/board.node.edge.test.ts` | board show JSON parsability + node CRUD + edge CRUD. |
| `docs/06-requirements/ai-full-visibility-cli.md` | The requirements doc, written before code, scoped against advisor review. |

## 2. Modified files

| File | Change |
|---|---|
| `src/sys/parser.ts` | New `SysCommand` variants (`info`, `settings`, `board.summary`/`stats`, `node.read`/`set-position`, `edge.enable`/`disable`, `task.chain`, `viewport.show`) + `--json` flag on every list. Added `hasFlag` helper. |
| `src/sys/SysFacade.ts` | New dispatch blocks for `board`, `node`, `edge`, `info`, `settings`, `viewport.show`. Plumbed `--json` through `task.list`/`todo.list`/`habit.list`. |
| `src/sys/commands/board.ts` | Stubs → real `boardShow`/`Summary`/`Stats` reading via `loadBoardFrom`. |
| `src/sys/commands/edge.ts` | Stubs → real CRUD using `resolveNodeRef` for endpoints and `resolveEdgeRef` for the edge id. |
| `src/sys/commands/todo.ts` | `todoAdd` rewritten to call `createTodoTaskPair` instead of bare `fsmTodoAdd`. `todoCheck` accepts prefix / text via `resolveTodoItemRef`. `todoList` gained `--json`. |
| `src/sys/commands/task.ts` | `findTaskNode` upgraded to use `resolveNodeRef`. Every handler reassigns `taskId = taskNode.id` after lookup so downstream writes use the full id. `taskAdd`'s `--todo` accepts both TodoNode and TodoItem refs (the verbatim #117 case). Added `taskChain`. `taskList` gained `--json`. |
| `src/sys/commands/habit.ts` | `cliList` gained `--json`. |
| `src/shared/cli/commandRegistry.ts` | Help text updated for every new/changed command. Removed dead `node add` entry. |
| `claude/CLAUDE.md` | Updated to recommend `--json` for reads and document prefix/text resolution. |
| `tests/unit/sys/parser.test.ts` | Updated 6 existing tests to include the new `json` field. Added a `board show --json` and `todo list --json` test. |
| `tests/unit/sys/task.commands.test.ts` | `task list nonexistent-todo` now errors loudly instead of returning empty — updated test to assert the new contract. |

---

## 3. Design choices

### 3.1 Why a single `resolveRef` shared helper

Issue #117 §1 lists prefix-match as one of three possible fixes. I chose it because:
- Habit lookup already uses a name-fallback pattern (`habit done meditation`). Generalizing it across all ref-taking flags keeps one rule, not ten.
- Git's SHA-prefix UX is widely understood. Min length of 4 keeps short references readable without false positives in practice.
- Centralizing resolution means future ID-taking commands don't have to re-invent it.

The resolver does **not** silently pick the first match on ambiguity. It returns the list of matching IDs in the error message so the operator can disambiguate. Same convention as `git checkout <ambiguous-sha>`.

### 3.2 Why `--json` is a flag, not a separate `show-json` subcommand

The issue gave three options for fixing `board show`: bare JSON by default, `--json` flag, or `board show --json`. I picked `--json` everywhere because:
- A flag is uniform across `board show`, `node list`, `todo list`, `task list`, `habit list`, `edge list` — one rule.
- Defaulting to JSON would break the human use case of `krnl board show` (operator at a terminal expects to read it).
- A `*-json` suffix subcommand for every list would double the help surface.

The `--json` contract is strict: bare JSON to stdout, no banner, no `[stub]` prefix, no trailing newline garbage. Errors still go to stderr at exit 1. This is what makes `krnl board show --json | jq .` viable.

### 3.3 Why `--todo <ref>` accepts a TodoItem ref, not just a TodoNode ref

The verbatim issue #117 scenario shows the user typing `--todo c27bc74b` where `c27bc74b` is the 8-char prefix of a **TodoItem** id (returned by `todo list`), not a TodoNode. Two ways to read this:
- (a) Author conflated TodoNode/TodoItem; the right command was `task subtask`.
- (b) `--todo` should accept either.

I went with (b). The semantics are clean — a TodoItem ref unambiguously identifies its parent TodoNode — and it matches the verbatim transcript the issue says must succeed end-to-end. The implementation tries `resolveNodeRef(_, 'todo')` first; if that misses, falls back to `resolveTodoItemRef`. If both miss, errors out with the union message.

### 3.4 Why I refactored the CLI side of `todo.add` but not the renderer side

The renderer's `commandDispatch.ts:985–1117` does much more than the new shared helper:
- text-suffix parsing (`"thing 25m"` → `plannedMin: 25`)
- Zustand store wiring (`addNode`, `addEdge`)
- IPC save (`window.krnl?.boardSave`)
- store-mutation ordering (add task, then `todoLinkTask`, then chain edge — sequential because `useBoardStore.getState().board` between calls reflects the prior write)

Extracting `createTodoTaskPair` and wiring the renderer through it is the correct ADR-0014 §11 parity fix, but it's a **separate refactor** that touches store internals. Doing it in this PR would either bloat the diff or risk subtle ordering changes in the React render path. The requirements doc and PR description both call this out as the explicit follow-up.

The CLI side, which is what was broken, **does** go through the helper.

### 3.5 Why I kept `node add` stubbed and removed it from help

The advisor flagged that `node add` was advertised but stubbed. Options were:
- Implement it for all 11 node kinds (each has different defaults; not trivial)
- Implement it as "always errors with: use the kind-specific command"
- Remove it from CLAUDE.md and the registry

I picked removal. Reasons:
- Mother nodes are auto-injected by the persistence migration layer (`migrateAddCalendarMother`, `migrateAddClockMother`, etc.). The user doesn't create them.
- Child nodes (`task`, `text`, `image`, `todo.task`, `habit.day`) all have kind-specific create commands that already handle the kind's defaults correctly (`task add`, `text add`, `image add`).
- A documented dead command is worse than no command.

If a future need for a generic `node add` emerges (e.g. for AI to create unusual node types), this can be revisited with explicit semantics.

### 3.6 Why `node set-position` only works on child nodes

Mother-node positions are pinned by `migrateMotherPositions` on every `loadBoardFrom` call. Writing a new position to a mother node "succeeds" — the write hits disk — but the next read snaps it back to the canonical layout. This is by design (the UI assumes fixed mother slots) and not something the CLI should fight.

I documented this in the `node set-position` test (`writes a new position to a child task node`) so the constraint is obvious to the next reader. If a future need to move mother nodes via CLI emerges, it would need to also disable the migration — a much larger change.

### 3.7 What got cut after advisor review (and why)

The original requirements doc §6 included three "+ more" features the user asked for ("AND EVEN MORE!"). The advisor pushed back on all three; I accepted the cuts because they were dangerous, redundant, or a real refactor:

- **`node set-state --json`** — a direct state-write back door. Every FSM in the codebase (TodoNode, TaskNode, PomoNode, HabitNode) exists specifically to enforce Decision 20 invariants on mutation. A `set-state` that bypasses them re-opens the exact class of bug Decision 20 closes. **Cut.** If a Claude operator needs surgical state edits, they can compose existing FSM-routed commands.
- **`node remove --force` on mother nodes** — the canvas can't render a board with no mother of a given kind. Mothers are infrastructure, not user content. The current refuse-without-`--force` for non-mother nodes stays; the mother variant is just a UI-break waiting to happen. **Cut.**
- **`krnl batch`** — atomic re-entrant `SysFacade.run` with shared in-memory board is a real refactor (every command currently does its own `loadBoard`/`saveBoard`). Worth doing, but worth doing right. **Cut from this PR.** `task chain` + prefix-match resolves the field-test scenario without it.

Also cut after the advisor pointed out it was redundant:
- **Per-kind `show` commands** (`todo show`, `pomo show`, `clock show`, …) — each is a one-node subset of `board show --json` or `node read <ref> --json`. Adding 6 commands that all wrap the same logic is help-text bloat.

These cuts are listed in `docs/06-requirements/ai-full-visibility-cli.md` §10.1.

### 3.8 Issue scenario as a test, not just a manual check

I added `it('issue #117 §8 verification scenario — verbatim step 5', ...)` in `tests/unit/sys/todo.pair.test.ts`. It reproduces exactly the failing transcript:

```text
krnl todo add "Week 1: Python & Math Foundations" --tag ml
krnl task add "Linear algebra review" --todo <8-char-prefix> --duration 60
```

If a future change regresses prefix resolution on `--todo`, this test goes red. The verbatim scenario is now a regression test, not just a target.

---

## 4. Known limitations

- **Renderer parity for `todo.add`** is incomplete — see §3.4. Renderer still uses inline pair creation.
- **`board save` and `board load` remain stubs.** Autosave-on-every-mutation is the actual behavior, so explicit save is mostly redundant; load would need persistence-layer support for swapping the active board.
- **`node add` is stubbed and removed from help** — see §3.5.
- **`pomo start`/`stop`/`status`** still emit `[stub] parsed: …`. The pomo FSM exists (used by `task pomo <id>`), but a CLI-driven `pomo start` without a task arg wasn't part of issue #117 and is unblocked by `task pomo` for any real workflow.
- **Mother positions can't be set via `node set-position`** — see §3.6.

---

## 5. What an operator needs to know

For Claude or any operator script driving the canvas:

1. **First call: `krnl info --json`** — gives node count, edge count, mother-node ids, theme, viewport. One call to bootstrap context.
2. **For reads, append `--json`.** Every list/show command supports it. Output is bare JSON, parseable by `jq` or `JSON.parse`.
3. **For mutations, use prefix refs.** 8 chars is usually enough. If ambiguous, the error message lists the candidates.
4. **For multi-task chains, use `task chain <ref1> <ref2> …`** instead of writing N `edge add` calls.
5. **`todo add` already creates the linked TaskNode.** No second call needed. Return data has both `todoItemId` and `taskNodeId`.

The full operator manual lives in [claude/CLAUDE.md](../../claude/CLAUDE.md).

---

## 6. Test results

```
Test Files: 62 passed (62)
     Tests: 977 passed | 1 todo (978)
typecheck: clean (tsconfig.main + tsconfig.renderer)
```

New tests added: 32 (across 4 new files). No existing tests deleted; 6 existing parser tests updated for new `json` field on list-command variants, 1 task test updated to reflect the new error-on-unknown-ref contract.
