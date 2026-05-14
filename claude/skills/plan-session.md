# Skill: Plan a Work Session

Use this when the user says something like:
- "Plan a 2-hour deep-work block"
- "Set up a focus session for the thesis"
- "I want to work for 90 minutes then take a break"

---

## Steps

### 1. Parse the intent

Extract:
- **Duration** — total time requested (e.g., 2 hours = 120 minutes)
- **Label** — what the work is about (e.g., "thesis", "deep-work")
- **Break preference** — default: 25-min pomodoros with 5-min breaks
- **Linked habit** — if the user said "and mark <habit> done after each", note the habit name

### 2. Read the board state

```bash
krnl info --json
```

`info` gives you mother-node ids (`motherIds.pomo`, `motherIds.habit`, …) and counts in one call. If you need full state, also `krnl board show --json`.

### 3. Build the task chain

A 2-hour block as a task chain (each `task add` auto-chains to the previous):

```bash
krnl task add "Pomodoro 1: <label>" --duration 25
krnl task add "Short break" --duration 5
krnl task add "Pomodoro 2: <label>" --duration 25
krnl task add "Short break" --duration 5
krnl task add "Pomodoro 3: <label>" --duration 25
krnl task add "Short break" --duration 5
krnl task add "Pomodoro 4: <label>" --duration 25
krnl task add "Long break" --duration 15
```

Every `task add` automatically creates a `task.next → task.activate` edge from the previous sibling to the new task, so the canvas shows them as a visual chain. **(See "Edges today" below.)**

### 4. Start the first pomodoro

```bash
krnl task list --json
# pick the 8-char prefix of the first "Pomodoro 1" task, then:
krnl task pomo <prefix>
```

`task pomo` sets `pomo.state.activeTaskId` and starts the canvas timer.

### 5. (Optional) Mark the habit

The canvas user marks habits by clicking. The CLI peer is:

```bash
krnl habit done "<habit name or id-prefix>"
```

Offer to run this after the last pomodoro. There is **no auto-firing edge today** (see step 6).

### 6. Reply

> "All set — 4 × 25-min pomodoros with breaks, ~2 hours. First pomodoro started on 'thesis'. I'll mark 'deep-work' done after the last one."

---

## Edges today — what works and what doesn't

- **Edges are visual.** `task.next` edges drawn by `task add` / `task chain` show the chain order on the canvas. They render as lines between nodes.
- **Edges do NOT auto-fire commands.** When pomodoro 1 finishes, pomodoro 2 does not start by itself; a `pomo:done → habit:markDone` edge does not mark the habit. The runtime edge-dispatch is in the architecture (Decision 8) but not in the current renderer — confirmed by `grep` of `src/renderer/components/Canvas/`.
- **What to do instead.** After each pomodoro, the user (or you, on user request) runs the next command explicitly: `krnl task pomo <next-id>` or `krnl habit done <name>`. When edge dispatch lands, this skill should switch back to `krnl edge add`.

---

## Notes

- Mother nodes (`mother-pomo`, `mother-todo`, `mother-habit`) are auto-injected by migrations — never create them.
- The standalone `krnl pomo start/stop/status` commands are still stubbed today. Use `krnl task pomo <ref>` for real pomo control — it routes through the PomoNode FSM.
- If the user didn't specify a label, use "focus session" as the default.
- Keep the spoken reply under 3 sentences.
