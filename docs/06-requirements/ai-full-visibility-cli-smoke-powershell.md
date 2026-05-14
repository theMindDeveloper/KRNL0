# AI Full-Visibility CLI — PowerShell Test Guide

Companion to [ai-full-visibility-cli-smoke.md](ai-full-visibility-cli-smoke.md). Same user stories, but the commands work on **Windows PowerShell** with **no external tools** (no `jq`, no `head`, no `<placeholder>` syntax that PowerShell rejects).

## Two PowerShell gotchas

1. **`<` and `>` are PowerShell redirection operators.** Anywhere the Unix guide says `<task-prefix>`, you must either substitute the actual id **or** quote it (e.g. `"<task-prefix>"`). In this guide, placeholders use `$varName` syntax instead.

2. **No `jq`** — use `ConvertFrom-Json` and `Select-Object` instead. Examples below.

## Helpful aliases (paste once)

```powershell
# parse `krnl ... --json` output into a real PS object
function k-json { param([Parameter(ValueFromRemainingArguments=$true)]$cmd)
  (& krnl @cmd --json) | ConvertFrom-Json
}

# get the 8-char id of the first todo item
function first-todo-id { (k-json todo list)[0].id }

# get the 8-char id of the Nth todo item (0-indexed)
function todo-id ([int]$n) { (k-json todo list)[$n].id }

# get the Nth task id
function task-id ([int]$n) { (k-json task list)[$n].id }

# get the first edge id
function first-edge-id { (k-json edge list)[0].id }
```

After pasting those once into your session, the test cases below become copy-paste.

---

## US-1 — Bootstrap

```powershell
krnl info
krnl info --json
(k-json info)
(k-json info).motherIds
(k-json info).byKind
```

**Expected:** human output, then bare JSON, then a parsed object. `.motherIds` lists every mother. `.byKind` is a `{ pomo: 1, todo: 1, ... }`-style map.

---

## US-2 — Parse every list with `--json`

```powershell
(k-json board show).nodes.Count
(k-json node list | Where-Object { -not $_.isMother }).Count
(k-json todo list).Count
(k-json task list).Count
(k-json habit list).Count
(k-json edge list).Count
```

**Expected:** integers, no errors.

---

## US-3 — 3-task workflow with prefix refs

```powershell
krnl task add "Outline design" --duration 30
$tasks = k-json task list
$outlineId = ($tasks | Where-Object { $_.text -eq "Outline design" }).id
$outlinePrefix = $outlineId.Substring(0, 12)   # "task-XXXXXXX"

krnl task subtask $outlinePrefix "Draft section 1"
krnl task subtask $outlinePrefix "Draft section 2"
krnl task list
```

**Expected:** 3 tasks, parent at L0, two children at L1. **No "No task node" errors.**

---

## US-4 — Verbatim issue #117 §8 scenario (the critical one)

```powershell
# 1. habits
krnl habit add "Daily ML Study"
krnl habit add "Math Drill"
krnl habit add "Reading"
krnl habit color "Daily ML Study" acid
krnl habit color "Math Drill" cyan
krnl habit color "Reading" rust

# 2. weekly todos (each auto-creates a paired TaskNode)
krnl todo add "Week 1: Python & Math Foundations" --tag ml
krnl todo add "Week 2: Classical ML" --tag ml
krnl todo add "Week 3: Neural Networks" --tag ml
krnl todo add "Week 4: Capstone Project" --tag ml

# 3. inspect — get the Week 1 prefix
$week1 = (k-json todo list) | Where-Object { $_.text -like "Week 1:*" }
$week1Prefix = $week1.id.Substring(0, 8)
"Week 1 prefix: $week1Prefix"

# 4. add tasks under Week 1 via prefix — this was the verbatim #117 failure
krnl task add "Linear algebra review" --todo $week1Prefix --duration 60
krnl task add "Probability primer"    --todo $week1Prefix --duration 60

# 5. chain the two new tasks
$newTasks = k-json task list | Where-Object {
  $_.text -in @("Linear algebra review", "Probability primer")
}
$a = $newTasks[0].id.Substring(0, 12)
$b = $newTasks[1].id.Substring(0, 12)
krnl task chain $a $b

# 6. see the result
krnl edge list
```

**Expected:**
- Every command succeeds. **Especially step 4** — that was the verbatim issue #117 failure (`No todo node with id "c27bc74b"`). It now resolves the TodoItem prefix to its parent TodoNode and adds the task there.
- `krnl edge list` at the end shows the chain edges automatically created by `todo add` (Week1→Week2→Week3→Week4 task chain) **plus** your manual `task chain` edge between "Linear algebra review" and "Probability primer".

### If any habit name is "Ambiguous"

That means you ran this block twice without resetting the board, so there are two habits with that name. The fix:
```powershell
krnl habit list
# find the id you want; then use the 8-char prefix instead of the name:
krnl habit color hhhh1111 cyan   # substitute your actual prefix
```

This is **the safety rail working** — the resolver refuses to silently pick one of two same-named habits.

---

## US-5 — Inspect a single node

```powershell
$taskId = (k-json task list)[0].id
krnl node read $taskId
krnl node read $taskId --json | ConvertFrom-Json | Format-List
```

**Expected:** state, config, position, incidentEdges. The `--json` form parses into a real PS object.

---

## US-6 — Edge CRUD with prefix refs

```powershell
krnl task add "step A"
krnl task add "step B"
$a = ((k-json task list) | Where-Object { $_.text -eq "step A" }).id.Substring(0, 12)
$b = ((k-json task list) | Where-Object { $_.text -eq "step B" }).id.Substring(0, 12)

krnl edge add --from "${a}:task.next" --to "${b}:task.activate"
krnl edge list

$edgeId = (k-json edge list)[-1].id.Substring(0, 12)
krnl edge disable $edgeId
krnl edge list        # look for ✗
krnl edge enable $edgeId
krnl edge list        # ✓ again
krnl edge remove $edgeId
krnl edge list        # gone
```

**Expected:** add succeeds with both endpoints resolved by prefix; disable flips ✓→✗; enable flips back; remove deletes.

**Note** — `"${a}:task.next"` uses PowerShell's `${var}` interpolation. The colon is fine inside double quotes; outside they confuse PowerShell.

---

## US-7 — Cascade delete

```powershell
krnl task add "delete me" --duration 25
$id = ((k-json task list) | Where-Object { $_.text -eq "delete me" }).id.Substring(0, 12)
krnl task pomo $id                 # start a pomo on this task (real handler)
krnl task delete $id               # should report "(pomo session cancelled)"
krnl task list                     # "delete me" is gone
krnl todo list                     # "delete me" item is also gone (cascade)
```

**Expected:** delete message includes `(pomo session cancelled)` because we started a pomo on it. The TodoItem is also removed (Decision 20 invariant 4).

**Note:** `krnl pomo status` is still a stub (known limitation, see report §4). `krnl task pomo` itself uses the real pomo FSM and works.

---

## US-8 — Mother-node protection

```powershell
krnl node remove mother-todo
# Do NOT run with --force unless you want to break your board
```

**Expected:** `Refusing to remove mother node "todo" — pass --force to override.`

---

## US-9 — Ambiguous-ref message

```powershell
krnl task add "first"
krnl task add "second"
# every task id starts with "task-", so this is ambiguous:
krnl node read task-
```

**Expected:** error message starting with `Ambiguous node ref "task-"` and listing up to 5 candidate ids. Pick a longer prefix.

---

## US-10 — Set position on a child node

```powershell
$id = (k-json task list)[0].id.Substring(0, 12)
krnl node set-position $id --x 600 --y 600
(k-json node read $id).position
```

**Expected:** `{ x = 600; y = 600 }`. (Mother nodes ignore this — their positions are pinned.)

---

## US-11 — Live canvas update

With the krnl0 app window open and visible:

```powershell
krnl task add "live test"
# look at the canvas — a new task node should appear immediately

$id = ((k-json task list) | Where-Object { $_.text -eq "live test" }).id.Substring(0, 12)
krnl task delete $id
# look at the canvas — it should vanish immediately
```

**Expected:** both changes reflect on the canvas with no reload. If they don't, the RPC notify path is broken (not this PR — that wiring is from PR #108).

---

## US-12 — Help is accurate

```powershell
krnl help
krnl help task
krnl help task chain    # the new chain subcommand
krnl help node
krnl help edge
krnl help info
```

**Expected:** `krnl help node` lists `read`, `remove`, `set-position`, `move`, `list` — **not** `add` (deliberately removed since it's stubbed). `krnl help task` includes `chain`. `krnl help info` shows `info [--json]`.

---

## Fast smoke loop

If you don't have time to walk through all 12, this is the minimum:

```powershell
# 1) bootstrap is real
(k-json info).nodeCount

# 2) pair creation works (Decision 20 invariant 1)
krnl todo add "smoke"
$item = ((k-json todo list) | Where-Object { $_.text -eq "smoke" })
$item.id            # has a value
$item.taskNodeId    # has a value, starts with "task-"

# 3) prefix resolution works
$prefix = $item.id.Substring(0, 8)
krnl todo check $prefix    # toggles done

# 4) cleanup
$taskId = $item.taskNodeId.Substring(0, 12)
krnl task delete $taskId
```

If steps 1–4 all succeed, the four high-leverage paths are working.

---

## If something doesn't work

1. **`The '<' operator is reserved`** — you have a literal `<placeholder>` in your command. Replace it with a `$variable` or paste the actual prefix.
2. **`jq : ... not recognized`** — you copied a Unix command. Use the `k-json` helper from the top of this file, or `| ConvertFrom-Json`.
3. **`Ambiguous habit "Foo"`** — there are two habits with that name. Use `krnl habit list` to find the id and pass an 8-char prefix instead.
4. **`No todo node or item matching "FOO"`** — you typed the literal placeholder. Substitute the actual prefix.
5. **`[stub] parsed: ...`** — that command is still stubbed. See [implementation report §4](ai-full-visibility-cli-report.md#4-known-limitations) for the list of known stubs (`pomo start/stop/status`, `board save/load`, `node add`).
