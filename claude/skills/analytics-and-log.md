# Skill: Analytics + Event log (what queries to run, when)

Use this when the user says something like:
- "How many tasks did I complete this week?"
- "What's my longest streak?"
- "Show my focus minutes for the last month"
- "What just happened?" / "Did the last command actually do anything?"
- "Why didn't my pomo update?"
- "Show me my habits over the year"

---

## Two distinct data sources

KRNL0 has two read-only surfaces for "what happened" / "what's happening":

| Surface     | Scope                       | Headless?       | Persistence            | Use when…                                  |
| ----------- | --------------------------- | --------------- | ---------------------- | ------------------------------------------ |
| Analytics   | All-time, derived from board | Yes              | Persistent (board.json) | "How many?", "longest streak", aggregates  |
| EventLog    | Last 200 events             | **No**, exit 2   | In-memory ring buffer  | "What just happened?", debugging           |

**Trust analytics for historical facts. Trust the log for recent debugging only.**

---

## Analytics — `krnl analytics ...`

The AnalyticsNode renders four views computed by `buildAnalytics(board)` (pure function over `board.nodes`). The CLI reads the same engine — no React, no parallel storage. Headless-capable.

```bash
krnl analytics show [--view overview|calendar|patterns|sources] [--range 7|30|90|365] [--metric taskCount|habitCount|focusMin|sessions] [--json]
krnl analytics totals [--range N] [--json]
krnl analytics streaks [--json]
```

### `show`

The whole dashboard payload. Views:

- **overview** — totals + activity strip + dow/hour bars (default)
- **calendar** — heatmap by day, range N
- **patterns** — weekday / hour / month bars
- **sources** — registered data sources + per-source event counts

Metrics: `taskCount` (tasks done), `habitCount` (habit checkins), `focusMin` (focused minutes), `sessions` (pomodoro sessions completed).

Ranges: `7`, `30` (default), `90`, `365` days.

### `totals`

Just the counts. Concise output for the spoken reply:

```bash
krnl analytics totals --range 30 --json
# → { tasksDone, habitCheckins, focusMin, sessionsCompleted, rangeDays, ... }
```

### `streaks`

```bash
krnl analytics streaks --json
# → { longestHabitStreak: N, perHabit: [{habitId, label, streak}, ...] }
```

`perHabit` lists current streak per habit, descending.

---

## EventLog — `krnl log ...`

Ring buffer of 200 most recent renderer events. **Cleared on reload.** Renderer-only (exit 2 if app is closed).

```bash
krnl log tail [--limit N] [--json]     # last N entries
krnl log stats [--json]                # counts by kind
```

Event kinds you'll see:

```
task.created          task.completed     task.deleted   task.reordered   task.toggleKind
habit.checkin         habit.uncheck      habit.created  habit.deleted
pomo.start            pomo.complete      pomo.stop
node.added            node.removed       node.moved
mother.shown          mother.hidden      mother.swapped
frame.created         frame.resized
board.saved           board.loaded
sys.cmd               sys.error
```

Severity: `ok | info | warn | err`. Errors and warnings often explain why a command didn't have the expected effect.

---

## Pick the right read for the question

| User asks                                          | Right read                                              |
| -------------------------------------------------- | ------------------------------------------------------- |
| "How many tasks did I do this week?"               | `analytics totals --range 7 --json`                     |
| "What's my longest streak?"                        | `analytics streaks --json`                              |
| "Show focus minutes for the year"                  | `analytics show --view calendar --range 365 --metric focusMin --json` |
| "Did my pomo just complete?"                       | `log tail --limit 5 --json` (look for `pomo.complete`)  |
| "Why didn't the task get scheduled?"               | `log tail --limit 20 --json` (look for `sys.error`)     |
| "What did I do today?"                             | `analytics totals --range 1` + `log tail --limit 30`    |
| "How active was I last month?"                     | `analytics show --view calendar --range 30 --metric taskCount --json` |
| "Which weekday is my most productive?"             | `analytics show --view patterns --json` (read dow)      |

---

## Caveats — must surface to the user when relevant

1. **EventLog clears on reload.** Don't claim "the buffer says nothing happened" after the app restarted. Run `analytics totals --range 1` instead.
2. **Headless mutations don't emit EventLog entries.** If the user ran a CLI command while the app was closed, the log won't show it. Analytics will (next time the app opens and recomputes — which happens on board load).
3. **Analytics are derived, not stored separately.** They're recomputed from `board.nodes` every call. Trust them as the canonical historical view.
4. **`focusMin` counts work-time across pomo sessions**, not wall-clock duration. A `focus` task scheduled for 30 minutes but never started contributes 0 to `focusMin`.
5. **`sessions` is completed pomodoros**, not started. Paused/canceled sessions don't increment.

---

## Reading the JSON

`analytics totals --range 30 --json` returns something like:

```json
{
  "rangeDays": 30,
  "rangeStart": "2026-04-17",
  "rangeEnd":   "2026-05-17",
  "tasksDone": 47,
  "habitCheckins": 82,
  "focusMin": 1230,
  "sessionsCompleted": 38,
  "openTasks": 12
}
```

Summarize for the spoken reply:
- "47 tasks done, 82 habit check-ins, 20 hours of focus across 38 pomodoros."

`analytics streaks --json`:

```json
{
  "longestHabitStreak": 12,
  "perHabit": [
    { "habitId": "abc…", "label": "meditation", "streak": 12 },
    { "habitId": "def…", "label": "exercise",   "streak": 7 },
    ...
  ]
}
```

Spoken: "Longest streak is meditation at 12 days, then exercise at 7."

---

## Anti-patterns

- ❌ Asking the user to "check the app" when you can read the same data via `analytics`.
- ❌ Treating `log tail` as historical truth — it's transient.
- ❌ Long JSON dumps in the spoken reply. The user can't hear `{"...":...}`.
- ❌ Recomputing analytics yourself by reading `board.json` directly. Use the engine.
- ❌ Reading the log when the app is closed and not telling the user it's empty because the buffer cleared.

## Right patterns

- ✅ Use `analytics totals` for the single best one-line answer.
- ✅ Use `log tail` only for "did the last thing I just did actually work" — and only when the app is open.
- ✅ Combine: "Analytics shows 5 tasks completed today (totals). Last event is task.completed at 12:08 (log)."
- ✅ Honest about gaps: "The log cleared when you restarted — I'll use analytics for the historical view."
