# Skill: Task kind (focus vs event) + Pomo configuration

Use this when the user says something like:
- "Make that block a pomodoro" / "Make that a meeting"
- "Switch it to focus mode" / "Switch it to event mode"
- "Change my pomo to 50/10/20"
- "Show me what's running on the pomo"
- "Why is my 2pm task showing as a meeting instead of a pomodoro?"

---

## Mental model — locked by Decision 28

Every TaskNode has a `kind` discriminator: `'focus' | 'event'`.

- **`focus`** is the default. The task is pomodoro-compatible. When activated (double-click on canvas, or `krnl task pomo <id>`) it loads into the **mother PomoNode** and the canvas runs the pomodoro cycle: work → short break → work → short break → … → long break (every Nth session). The cycle parameters live on the PomoNode, **not on the task**.
- **`event`** is a single solid block of time. No breaks, no pomo split. Used for meetings, appointments, and any "this is one continuous chunk" use case. The calendar renders these as solid blocks.

### Why "focus" and not "pomo"?

A `focus` task is the *intent* to do focused work on that thing; the pomo is the *device* that drives the focused work. One mother PomoNode runs the cycles for whichever `focus` task is currently active. Per-task per-pomo configuration is intentionally foreclosed (Decision 28 §1) — there is one shared cadence per board.

### Per-task vs board-wide

| Setting              | Scope     | Command                                                |
| -------------------- | --------- | ------------------------------------------------------ |
| Kind (focus/event)   | per task  | `krnl task kind <ref> <focus\|event>`                  |
| Task budget (mins)   | per task  | `krnl task duration <ref> <minutes>` (writes `plannedMin`) |
| Work session length  | board-wide | `krnl pomo config --session 25`                       |
| Short break length   | board-wide | `krnl pomo config --short 5`                          |
| Long break length    | board-wide | `krnl pomo config --long 15`                          |
| Long-break frequency | board-wide | `krnl pomo config --every 4`                          |
| Timer face           | board-wide | `krnl pomo config --face vapor\|lcd\|blocks\|ascii`   |

---

## Common operations

### Read the current kind of a task

```bash
krnl task list --json                       # shows kind alongside text + duration
krnl node read <ref> --json                 # full state including .kind
```

### Toggle a task

```bash
krnl task kind <ref> focus                  # → pomodoro task
krnl task kind <ref> event                  # → single-block task
```

### Inspect / change pomo cadence

```bash
krnl pomo config                            # no flags → prints current config (when implemented)
krnl pomo config --session 50 --short 10 --long 20 --every 4
krnl pomo config --face lcd
```

`pomo config` mutates the mother PomoNode's config object. It's headless-capable but takes effect on the live canvas if the renderer is attached.

### Activate a focus task

```bash
krnl task pomo <ref>                        # equivalent to double-clicking in UI
krnl pomo status                            # confirm it loaded
```

---

## The risky case — `focus → event` on the active pomo

If the user wants to convert their current focus task into a meeting block, the pomo timer is already running on that task. There are two paths:

1. **Renderer attached (app open):** the CLI dispatches `pomoCancel` first, then writes the new kind. The cycle stops cleanly.
2. **Renderer detached (headless):** the CLI **refuses** with exit 1: `"cannot toggle kind on active pomo task — open the app or stop pomo first"`. Do NOT try to bypass this — it would corrupt the FSM.

So the right sequence when you're not sure:

```bash
krnl pomo status                            # if "running" and activeTaskId matches your target ref:
krnl pomo stop                              # then
krnl task kind <ref> event
```

Or just open the app and let the renderer handle it.

---

## Double-click semantics (what the UI does that the CLI mirrors)

Double-clicking a TaskNode on the canvas is `task.loadIntoPomo` followed by `pomo.start`. The CLI equivalent is:

```bash
krnl task pomo <ref>
```

This writes `pomo.state.activeTaskId = <task-id>` and starts the work cycle. The PomoNode renders the visualization (whichever `face` is selected). When the user finishes a session, the timer auto-advances to a break, then back to work, etc. The cycle parameters come from `PomoConfig`.

---

## When to flip kind

| User intent                                   | Right kind |
| --------------------------------------------- | ---------- |
| "I want to deep-work on this for an hour"     | `focus`    |
| "This is a meeting at 2pm"                    | `event`    |
| "Block out time for the dentist"              | `event`    |
| "30 minutes of writing"                       | `focus`    |
| "Lunch with Sam"                              | `event`    |
| "Pomo session on the spec"                    | `focus`    |
| "Single block, no breaks"                     | `event`    |

When in doubt: if the user wants breaks → `focus`. If they want one continuous block → `event`.

---

## Anti-patterns

- ❌ Setting per-task pomo durations. Not supported — they're board-wide.
- ❌ Trying to toggle kind while pomo is running, in headless mode. The command will refuse.
- ❌ Promising the user "your event task will still get pomo breaks." It won't — events are explicitly the no-breaks kind.
- ❌ Using `krnl pomo start` and expecting it to activate a specific task. It doesn't — use `krnl task pomo <ref>`.

## Right patterns

- ✅ Default new tasks to `focus`; only flip to `event` when the user explicitly says "meeting", "appointment", "block", etc.
- ✅ Check `pomo status` before toggling kind on what might be the active task.
- ✅ Tune `pomo config` once for the user's whole board, not per task.
- ✅ Use `task duration` for per-task budget overrides; use `pomo config --session` for the work-period length.

---

## Reply templates

- "Switched to event — single block, no pomo split."
- "Set to focus — it'll run pomodoro cycles from the mother config."
- "Pomo updated: 50/10/20, long break every 4."
- "Can't toggle kind — the pomo is running on that task. Want me to stop it first?"
