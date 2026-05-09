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

### 2. Read the current board
```bash
sys board show --json
```
Note existing node IDs, especially the habit node if any habit should be auto-marked.

### 3. Calculate the session structure
Example for 2 hours:
- 4 × 25-min pomodoros
- 3 × 5-min short breaks
- 1 × 15-min long break after the last set

### 4. Start the first Pomodoro
```bash
sys pomo start --label "<label>" --minutes 25
```

### 5. Wire edges if the user has a related habit
If the user mentioned a habit (e.g., "mark deep-work done after each session"):
```bash
sys edge add --from <pomoMotherNodeId>:onComplete --to <habitNodeId>:markDone --args habit=deep-work
```

### 6. Announce the plan
Reply with a brief summary of what was set up:

> "All set. I've started a 25-minute focus session labeled 'thesis'. You have 4 sessions planned — about 2 hours total. I'll let you know when each one completes."

---

## Notes
- Never create more than one Pomodoro mother — it's anchored and unique.
- Child sessions (`pomo.session`) are spawned automatically by the Pomodoro node on completion.
- If the user didn't specify a label, use "focus session" as the default.
- Keep the spoken reply under 3 sentences.
