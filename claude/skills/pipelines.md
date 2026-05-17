# Skill: Multi-step pipelines (the right order to build complex plans)

Use this when the user describes a plan with several pieces — "set up my morning routine", "block out the day", "build a project Alpha workspace", "schedule three habits and a meeting" — rather than a single mutation.

The trick to a pipeline is not the commands, it's the **order**. Some operations depend on others existing first. This skill collects the canonical orderings.

---

## The general recipe

1. **Read the board** — `krnl info --json` for counts + mother ids; `krnl board show --json` if you need full state. Don't skip this; it tells you whether the mothers exist and what's already there.
2. **Create the parents/anchors first** — habits, the first task in a chain, the frame that will hold everything.
3. **Create the dependents** — successor tasks, pinned lanes, child text/image nodes.
4. **Configure** — set kinds, durations, schedules, tints, notes.
5. **Wire / chain** — `task chain`, `edge add`. Most edges are visual today; tell the user honestly.
6. **Anchor in time** — `task schedule`, `habit schedule`. Schedules cascade; setting the first anchor propagates to all downstream tasks in the chain.
7. **Verify** — `cal show`, `clock show`, `frame contents`, `analytics totals`, `log tail`. A short read at the end catches misorderings before the human notices.

Skip steps that don't apply. Don't reorder. The reasons:

- Habits / frames must exist before tasks reference them.
- A task chain has to be authored in head-to-tail order so each `addNext` has a source.
- Scheduling cascades **after** chain authoring, not during.
- Pinning a habit requires the habit; framing nodes requires the nodes.

---

## Pipeline 1 — Morning routine (habit + lane + chained tasks + frame + schedule)

User: "Set up my morning routine: meditate at 7, then 30 min writing, then 15 min email triage, all framed together."

```bash
# 0. Bootstrap context
krnl info --json

# 1. Anchor: the habit. Make sure it exists, configured, scheduled, and pinned.
krnl habit add "meditation"            # idempotent fail if exists — check `habit list` first
krnl habit color meditation cyan
krnl habit icon meditation 🧘
krnl habit schedule meditation --daily --at 07:00 --duration 15
krnl habit pin meditation              # creates habit.lane node — needs renderer (exit 2 if not)

# 2. Build the task chain head-to-tail. Both are `focus` (default kind).
krnl task add "writing block" --duration 30
krnl task list --json                  # capture writing id prefix
krnl task addNext <writing> "email triage" --duration 15

# 3. Configure — kinds & notes
# (already focus by default — only flip if user said meeting/event)
krnl task note <writing> "thesis chapter 3"

# 4. Wire — chain edges are auto-added by task add / addNext; nothing to do.

# 5. Anchor in wall-clock — first task in the chain anchors the rest via cascade.
krnl task schedule <writing> --at 2026-05-18T07:15

# 6. Frame the cluster. With --near and no --w/--h, the frame auto-sizes
#    to contain the writing task + 40 px padding. The triage task lands
#    inside the frame's bounds when the renderer recomputes containment.
krnl node list --kind task --json
krnl frame add --label "Morning" --tint cyan --near <writing>

# 7. Snap the frame around the WHOLE chain (writing + triage), with padding.
krnl frame fit <frame-ref>

# 8. Verify
krnl cal show --from 2026-05-18 --to 2026-05-18 --json
krnl frame contents <frame-ref> --json
```

**Reply:** "Morning routine set up — meditation pinned at 7, writing at 7:15, email triage at 7:45, framed in cyan."

---

## Pipeline 2 — Deep-work block (4 pomodoros + breaks)

User: "Plan a 2-hour deep-work block on the spec."

```bash
# 1. Tune the pomo cadence once for the board (skip if already configured).
krnl pomo config --session 25 --short 5 --long 15 --every 4

# 2. Author the chain. Each task add auto-chains to the previous (`task.next → task.activate`).
krnl task add "Pomodoro 1: spec" --duration 25
krnl task add "Short break"      --duration 5
krnl task add "Pomodoro 2: spec" --duration 25
krnl task add "Short break"      --duration 5
krnl task add "Pomodoro 3: spec" --duration 25
krnl task add "Short break"      --duration 5
krnl task add "Pomodoro 4: spec" --duration 25
krnl task add "Long break"       --duration 15

# 3. Start the first pomodoro.
krnl task list --json
krnl task pomo <pomodoro-1-prefix>
```

Both `Short break` and `Long break` tasks are kind `focus` by default. That's fine — they show up on the calendar as scheduled blocks. Don't flip them to `event`; "break" is conceptually focus-style.

See `skills/plan-session.md` for more variations.

---

## Pipeline 3 — Three parallel tasks under one mother

User: "I'm going to work on three things at once — spec, design, tests."

```bash
krnl task add "spec draft" --duration 45
krnl task list --json
krnl task parallel <spec>                # fork a sibling; replicates incoming/outgoing task.next edges
krnl task edit <new-id> "design pass"
krnl task parallel <spec>                # fork another sibling
krnl task edit <new-id> "test scaffold"
```

All three render side-by-side on the canvas. `task parallel` is the canonical command (= `task sibling`). Use parallel branches sparingly — they make scheduling cascade tricky.

---

## Pipeline 4 — Convert a focus task to a meeting

User: "Make my 2pm focus block a meeting instead."

```bash
krnl pomo status                         # if running on that task, stop first
# If status.activeTaskId === target ref, run:
krnl pomo stop

krnl task list --json
krnl task kind <ref> event
```

In headless mode, toggling kind on the active pomo task is refused with exit 1. Tell the user honestly: "Can't toggle kind while the pomo is running — want me to stop it?"

---

## Pipeline 5 — Pin habit + visual link to a task

User: "Tie my exercise habit to my workout task."

```bash
krnl habit pin exercise                  # creates habit.lane node (renderer-required)
krnl habit list --json                   # find lane id (kind: habit.lane)
krnl task list --json
krnl edge add --from "<task>:task.complete" --to "<lane>:habit.toggleToday"
# Caveat: edges are visual today — they don't auto-fire. Tell the user you'll mark
# the habit manually when the task completes (see skills/wire-edge.md).
```

---

## Pipeline 6 — Calendar-view weekly check-in

User: "What's on the schedule this week?"

```bash
krnl cal show --from 2026-05-17 --to 2026-05-24 --json
krnl analytics totals --range 7 --json
krnl analytics streaks --json
```

Read-only. Summarize in 1–2 sentences for the spoken reply.

---

## Pipeline 7 — Build a project workspace from scratch

User: "Set up workspace for Project Alpha — spec, design, build, test."

```bash
# 1. Build the chain first — the CLI handles spacing (TASK_STEP_X = 300 px).
krnl task add "spec" --duration 60
krnl task list --json
krnl task addNext <spec> "design" --duration 90
krnl task list --json
krnl task addNext <design> "build" --duration 240
krnl task list --json
krnl task addNext <build> "test" --duration 120

# 2. Frame near the anchor (auto-sizes to fit the spec task + padding).
krnl frame add --label "Project Alpha" --tint plum --near <spec>

# 3. Snap the frame around the WHOLE chain.
krnl frame fit <frame-ref>

# 4. (Optional) anchor the chain in wall-clock time. Cascade does the rest.
krnl task schedule <spec> --at 2026-05-20T09:00
```

The whole chain cascades from `<spec>`'s anchor.

---

## Pipeline 8 — Mid-pipeline diagnostics

When a long pipeline runs and something feels off, these reads are cheap:

```bash
krnl log tail --limit 10 --json          # what happened recently (renderer-only)
krnl board summary                       # quick counts
krnl board stats                         # per-kind + per-event breakdown
krnl task list --json | jq '.[] | {id, text, kind, scheduledFor, plannedMin}'   # task overview
krnl edge list --json                    # what wires exist
```

Don't dump these to the user verbatim. Read them, summarize in one sentence.

---

## When the user is vague

If the user says "set up the morning thing" without specifying:
- duration
- which habits
- what tasks
- when it starts

Ask **one** focused question. Don't ask three at once. Don't guess silently.

Good: "What time should the routine start?"
Bad: "What time, which habits, what tasks, and which tint?" (too many at once)
Bad: assumes 7am, picks meditation + journaling without asking, frames in cyan.

---

## Anti-patterns

- ❌ Scheduling a task before authoring the chain. The cascade has no source.
- ❌ Authoring tasks before the habits exist if you're going to wire them together.
- ❌ Calling `frame contents` while the renderer is mid-drag — it reads stale state.
- ❌ Using `task addNext` against a non-existent source. The CLI exits 1; you waste a turn.
- ❌ Running a pipeline silently. Confirm at the end with `cal show` or `log tail`.
- ❌ Framing a chain and forgetting `frame fit` — the frame won't wrap everything you just built.
- ❌ Reading `src/`, `tests/`, `package.json`, or running `npm`/`git`/`find`/`grep`/`cat` to "understand" the app. You are the in-app assistant — those tools are off-limits. The only tools you need are listed in `krnl help`.

## Right patterns

- ✅ Habits & frames first. Tasks second. Schedules last.
- ✅ Spawn chain → frame near anchor → `frame fit` → schedule. The CLI does the spacing; `fit` does the wrapping.
- ✅ Capture ids with `--json` reads between steps — never reuse the same prefix across two unrelated mutations without re-checking.
- ✅ Verify with one cheap read at the end. "Calendar shows 3 blocks; analytics shows 3 new tasks today."
- ✅ Tell the user what's still manual (edges don't auto-fire, habit lanes need renderer, etc.).
