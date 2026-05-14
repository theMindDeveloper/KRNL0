# AI Full-Visibility CLI — Manual Test Guide

Use cases + user stories for [PR #119](https://github.com/theMindDeveloper/KRNL0/pull/119).
Run from a TerminalNode on the canvas, or any shell where `krnl` is on the `PATH`.

**How to use this file:** copy a block, paste it into a terminal, check the actual output against the **Expected** section. ✅ each passing case in the box below as you go.

```
[ ] US-1   Bootstrap visibility
[ ] US-2   List + parse board state with --json
[ ] US-3   Build a 3-task workflow with prefix refs
[ ] US-4   Verbatim #117 §8 scenario — 30-day ML plan, single attempt
[ ] US-5   Inspect a single node (state + config + edges)
[ ] US-6   Wire and unwire edges between events / commands
[ ] US-7   Cascade-delete a task and verify pomo/TodoItem cleanup
[ ] US-8   Mother-node protections
[ ] US-9   Ambiguous-ref error message
[ ] US-10  Position write (child node only)
[ ] US-11  Live canvas update — mutations land without reload
[ ] US-12  Help is accurate and discoverable
```

---

## US-1 — Bootstrap visibility ("where am I?")

**As an AI agent**, I want one command that tells me the state of the world so I can plan the next mutation without scraping `board.json`.

### Steps

```bash
krnl info
krnl info --json
```

### Expected

The human form prints something like:

```
krnl0 v0.2.0
board: C:\Users\<you>\Documents\krnl0\board.json
theme: dark  · viewport: 0,220 @1x
5 nodes · 0 edges
by kind:
  calendar       1
  clock          1
  habit          1
  pomo           1
  todo           1
mother ids:
  pomo       mother-pomo
  todo       mother-todo
  habit      mother-habit
  calendar   mother-calendar
  clock      mother-clock
```

The `--json` form prints **bare JSON on one line** (no banner, no `[stub]` prefix). Pipe to `jq` if available:

```bash
krnl info --json | jq .
```

✅ if `jq` parses it without error and the `motherIds` map contains keys for every mother kind present on your board.

---

## US-2 — List + parse board state with `--json`

**As an AI agent**, I want every read command to support `--json` so I can parse the output.

### Steps

```bash
krnl board show --json | jq '.nodes | length'
krnl node list --json | jq '.[].kind' | sort -u
krnl todo list --json
krnl task list --json
krnl habit list --json
krnl edge list --json
```

### Expected

- `board show --json` outputs the entire board (nodes + edges + viewport + theme) on one line.
- `node list --json` outputs an array of `{ id, kind, isMother, position, summary }`.
- `todo list --json` outputs an array of `TodoItem`s.
- `task list --json` outputs an array of `{ id, ...TaskState }`.
- `habit list --json` outputs an array of `{ id, name, color, archived, streak, logCount }`.
- `edge list --json` outputs an array of `AnyEdge`.

**None** should contain a `[stub] parsed:` line. **None** should print banners on stdout. `jq` should accept every output.

---

## US-3 — Build a 3-task workflow with prefix refs

**As an AI agent**, I want to add a task, list to get its id, and then add a subtask using the **8-character prefix** — without errors.

### Steps

```bash
krnl task add "Outline design" --duration 30
krnl task list --json | jq '.[].id'   # note the 8-char prefix of your new task
# substitute the prefix into:
krnl task subtask <8-char-prefix> "Draft section 1"
krnl task subtask <8-char-prefix> "Draft section 2"
krnl task list
```

### Expected

- `task add` returns `ok: true` with `{ id: "task-…" }`.
- `task subtask <prefix>` succeeds **without** "No task node with id" errors (this was the issue #117 §1 failure).
- `task list` shows 3 tasks: the parent at `L0`, two children at `L1`.

### Negative check

```bash
krnl task subtask abc "should fail"
```

Should error: `No task node matching "abc"` (prefix too short — minimum is 4 chars).

---

## US-4 — Verbatim issue #117 §8 scenario

**As the field-test author**, I want the exact transcript from issue #117 §8 to run end-to-end without "can't find ID" errors and without Claude reading `board.json` directly.

### Steps

```bash
krnl habit add "Daily ML Study"
krnl habit add "Math Drill"
krnl habit add "Reading"
krnl habit color "Daily ML Study" acid
krnl habit color "Math Drill" cyan
krnl habit color "Reading" rust

krnl todo add "Week 1: Python & Math Foundations" --tag ml
krnl todo add "Week 2: Classical ML" --tag ml
krnl todo add "Week 3: Neural Networks" --tag ml
krnl todo add "Week 4: Capstone Project" --tag ml

krnl todo list --json | jq '.[] | "\(.id[0:8])  \(.text)"'
# pick the 8-char prefix of "Week 1: Python..." (call it WEEK1_PREFIX)

krnl task add "Linear algebra review" --todo WEEK1_PREFIX --duration 60
krnl task add "Probability primer" --todo WEEK1_PREFIX --duration 60
krnl task list --json | jq '.[].id'
# pick the 2 ids; pass them to:
krnl task chain <task1-prefix> <task2-prefix>
```

### Expected

- Every `habit color` call uses the habit's **name** (text fallback), not its UUID.
- Every `todo add` call returns `data` with both `todoItemId` and `taskNodeId` — proving the pair is created (Decision 20 invariant 1).
- `task add --todo WEEK1_PREFIX` succeeds — **this was the verbatim failure** in issue #117.
- `task chain <a> <b>` reports `Chained 2 tasks (1 new edge).`
- `krnl edge list` shows the chain edge.

If all six commands run cleanly, issue #117 is fully resolved by definition (the issue's own acceptance criterion).

---

## US-5 — Inspect a single node

**As an operator**, I want to read the full state, config, and incident edges of one node without scrolling through the entire board.

### Steps

```bash
krnl node list --json | jq '.[] | select(.kind == "todo.task") | .id' | head -1
# copy the id, then:
krnl node read <task-id>
krnl node read <task-id> --json | jq .
```

### Expected

The human form prints:
```
id    : task-…
kind  : todo.task
pos   : <x>,<y>
edges : <n>

state : { ... }
config: { ... }
```

The `--json` form returns `{ id, kind, isMother, position, state, config, incidentEdges }`. `incidentEdges` should include every edge with `from.nodeId == id` or `to.nodeId == id`.

### Try with a prefix

```bash
krnl node read mother
```

Should error with `Ambiguous` since multiple mother ids share that prefix. Try `mother-pomo` — works.

---

## US-6 — Wire and unwire edges

**As an AI agent**, I want to add a `task.next → task.activate` wire between two tasks I just created, using prefix refs on both endpoints.

### Steps

```bash
krnl task add "step A"
krnl task add "step B"
krnl task list --json | jq -r '.[].id' | head -2
# capture the two ids; substitute:
krnl edge add --from <prefixA>:task.next --to <prefixB>:task.activate
krnl edge list
krnl edge list --json | jq -r '.[].id' | head -1
# copy the new edge id (8-char prefix works):
krnl edge disable <edge-prefix>
krnl edge list   # see ✗ marker
krnl edge enable <edge-prefix>
krnl edge list   # ✓ again
krnl edge remove <edge-prefix>
krnl edge list   # gone
```

### Expected

- `edge add` succeeds; both endpoints resolved by prefix.
- `edge list` shows `<id8> ✓ <fromId8>:task.next → <toId8>:task.activate`.
- `disable` flips to `✗`; `enable` flips back; `remove` deletes.

### Negative check

```bash
krnl edge add --from mother-todo --to mother-pomo:foo
```

Should error: `--from must be "<nodeRef>:<event>"`. (Missing colon.)

---

## US-7 — Cascade-delete a task

**As an operator**, I want `task delete` to remove the task **and** clean up its TodoItem **and** cancel any active pomo on it (Decision 20 invariant 4 / T17).

### Steps

```bash
krnl task add "delete me" --duration 25
krnl task list --json | jq -r '.[] | select(.text=="delete me") | .id'
# capture the id, then:
krnl task pomo <task-prefix>        # start pomo on this task
krnl pomo status                     # (currently still stubbed — skip if you want)
krnl task delete <task-prefix>
krnl task list --json | jq '. | length'
krnl todo list --json | jq '.[].text'
```

### Expected

- After `task pomo`, the pomo mother node's `state.activeTaskId` matches the task id.
- `task delete` returns `Task and 0 descendant(s) deleted. (pomo session cancelled)` — the parenthetical only appears if the pomo was active.
- `task list` no longer shows "delete me".
- `todo list` no longer shows "delete me" in its items.

### Variant — task with descendants

```bash
krnl task add "parent"
krnl task list --json | jq -r '.[] | select(.text=="parent") | .id'
krnl task subtask <parent-prefix> "child A"
krnl task subtask <parent-prefix> "child B"
krnl task delete <parent-prefix>
krnl task list   # all three gone
```

`task delete` should report `Task and 2 descendant(s) deleted.`

---

## US-8 — Mother-node protections

**As a user**, I want the CLI to refuse to delete a mother node unless I explicitly pass `--force`.

### Steps

```bash
krnl node remove mother-todo
krnl node remove mother-todo --force    # don't actually run this!
```

### Expected

- Without `--force`: `Refusing to remove mother node "todo" — pass --force to override.`
- With `--force`: it would actually remove the node and break the canvas — **don't actually run** unless you intend to reset.

---

## US-9 — Ambiguous-ref error message

**As an AI agent**, when a prefix matches multiple nodes, I want the error to list the candidates so I can disambiguate.

### Steps

```bash
krnl task add "first"
krnl task add "second"
# Find a prefix that matches both. Both start with `task-`:
krnl node read task-
```

### Expected

```
Ambiguous node ref "task-" — matches: task-..., task-... (+0 more)
```

The error lists up to 5 candidate ids. Pick a longer prefix to retry.

---

## US-10 — Position write (child node only)

**As an operator**, I want to set a node's position directly, peer of the drag gesture.

### Steps

```bash
krnl task add "movable"
krnl task list --json | jq -r '.[] | select(.text=="movable") | .id'
krnl node set-position <task-prefix> --x 600 --y 600
krnl node read <task-prefix> --json | jq .position
```

### Expected

`.position` should be `{"x": 600, "y": 600}`.

### Mother-node caveat

`krnl node set-position mother-todo --x 100 --y 100` will report success, but on next read the position snaps back to the canonical mother slot. This is the documented behavior — mother positions are pinned by the migration layer.

---

## US-11 — Live canvas update

**As a user**, I want every mutation to reflect on the canvas immediately, with no reload required (RPC `onBoardChanged` wiring).

### Steps

With the app open and the canvas visible:

```bash
krnl task add "shows up live"
# watch the canvas — a new TaskNode should appear without any user action
krnl task delete shows-up-live   # text-fallback resolution
# watch the canvas — the node should disappear
```

### Expected

Both mutations produce a visible change on the canvas within ~1 second, with **no reload, no refresh button click**. If they don't, the issue is in the RPC notify path, not this PR.

---

## US-12 — Help is accurate and discoverable

**As an operator**, I want `krnl help` to be the source of truth for what the CLI can do.

### Steps

```bash
krnl help
krnl help task
krnl help task add
krnl help node
krnl help edge
krnl help info
```

### Expected

- `krnl help` lists every group, including new ones (`info`, `settings`).
- `krnl help task` includes `chain` and shows `task list [<todoId>] [--json]`.
- `krnl help node` lists `list`, `read`, `remove`, `set-position`, `move` — **not** `add` (deliberately removed since it's stubbed).
- `krnl help edge` lists `add/remove/enable/disable/list`.
- `krnl help info` shows the `info [--json]` usage.

If you see anything in the help that doesn't actually work, file an issue — that's a parity bug.

---

## Field-test loop

The fastest way to exercise everything: run [US-4](#us-4--verbatim-issue-117-8-scenario) end-to-end. If it succeeds without manual `cat ~/Documents/krnl0/board.json`, the issue is closed.

For a faster smoke loop:

```bash
krnl info --json | jq '.nodeCount, .edgeCount'
krnl todo add "Smoke test"
krnl todo list --json | jq '.[].text'
krnl task list --json | jq '.[].text'
krnl task delete "Smoke test"
krnl info --json | jq '.nodeCount, .edgeCount'   # back to baseline
```

If that round-trips cleanly, the four high-leverage paths (pair creation, JSON read, prefix delete, cascade) are all working.
