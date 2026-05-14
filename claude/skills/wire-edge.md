# Skill: Wire Two Nodes with an Edge

Use this when the user says something like:
- "When I finish a Pomodoro, mark deep-work done"
- "Connect my pomo to my habit tracker"
- "Wire the timer to the todos so it checks the first task"

---

## Important honesty up front

**Edges in KRNL0 today are pure data, not reactive wires.** They are:
- Stored in `board.json` (`{ from: {nodeId, event}, to: {nodeId, command}, enabled }`)
- Drawn on the canvas as lines between nodes
- Listable / addable / removable / enableable via `krnl edge ...`

What edges do **NOT** do today:
- They do **not** automatically fire `to.command` on `to.nodeId` when `from.nodeId` emits `from.event`.
- The runtime edge-dispatch loop is in the architecture (Decision 8) but is not wired in the current renderer (grepped — no code reads `edges[]` and dispatches commands based on `from.event`).

So if the user asks "wire X to Y so Y fires when X does", you have two honest options:

1. **Tell them**: "I can draw the wire on the canvas, but the kernel won't actually fire the wired command yet — that's an architecture goal not in today's runtime. I can manually run the command for you after X happens."
2. **Just draw the wire** if they want it on the canvas for visual clarity, and offer to run the target command manually each time.

Do not promise the wire will fire automatically.

---

## What edges DO work today

- **`task.next → task.activate` chain edges** between sibling tasks are auto-created by `task add`, `task subtask`, and `task chain`. They render as lines showing chain order. They do not auto-advance.
- **Manual user-defined edges** can be added with any `event:command` strings. They render. They do not fire.

---

## Steps (for visual wires)

### 1. Read the board

```bash
krnl info --json          # mother ids + counts
krnl node list --json     # every node + summary
```

### 2. Resolve both endpoints

Both `--from` and `--to` accept **id-prefix (≥4 chars)** or unique text match:

```bash
krnl edge add --from "<fromRef>:<event>" --to "<toRef>:<command>"
```

PowerShell tip — quote the whole `nodeRef:event` string so the colon doesn't get eaten:

```powershell
krnl edge add --from "${fromPrefix}:task.next" --to "${toPrefix}:task.activate"
```

### 3. Inspect

```bash
krnl edge list                # human view with ✓/✗ enabled markers
krnl edge list --json         # bare JSON
```

### 4. Toggle / remove

```bash
krnl edge disable <edge-prefix>     # ✓ → ✗ (just flips the enabled flag)
krnl edge enable <edge-prefix>      # back to ✓
krnl edge remove <edge-prefix>      # deletes from board.json
```

### 5. Reply

For the verbatim user request "wire pomo to habit":

> "I've drawn a wire on the canvas from your pomo node to the meditation habit. Heads up — automatic edge firing isn't implemented yet, so I'll mark the habit done manually when you finish each pomo. Want me to start one now?"

---

## What events / commands actually exist

The commands node code receives (grep `onCommand(` in `src/renderer/components/nodes/`):

```
task.*      addSubtask, delete, edit, loadIntoPomo, pausePomo,
            setPlannedMin, startPomo, toggle
todo.*      add, clearDone, edit, loadTaskForItem, remove,
            startPomoForItem, toggle
pomo.*      cancel, clearActiveTask, complete, pause, resume,
            setConfig, skipBreak, start
habit.*     add, remove, rename, setColor, setIcon, setView,
            spawnLane, toggleDay
habit.lane.* removeHabit, rename, setColor, setIcon, toggleToday
calendar.*  activateTask, schedule, scheduleHabit, selectDate,
            setAnchor, setView
clock.*     linkTodo, setViewWindow
image.*     setAsset, setSize
text.*      setSize, setText
term.*      sessionEnd, sessionStart
```

These are the **commands** a node can receive. As **events** that actually appear on edges in the current codebase, only two strings show up: `task.next` (sibling chain) and `link` (visual link, doesn't fire). Anything else in the event slot is valid as data but no node code emits it.

So a "useful" edge today records the user's intent for when edge dispatch lands. Useless as automation until then.

---

## Anti-patterns

- ❌ Promising the user "the habit will be marked when the pomo finishes" — the edge won't fire.
- ❌ Using `onComplete`, `markDone`, etc. — those names don't exist in the current code (legacy spec). Use real namespaced commands above.
- ❌ Using `--args key=value` — that flag does not exist on `edge add`.

## Right pattern

- ✅ Tell the user honestly that the wire is visual today.
- ✅ Offer to do the cross-node action yourself (`krnl habit done X` after `krnl task pomo Y` completes).
- ✅ Use real namespaced command names (`task.toggle`, `pomo.start`, `habit.toggleDay`) if you do draw the wire.
