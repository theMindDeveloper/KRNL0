# Skill: Wire Two Nodes with an Edge

Use this when the user says something like:
- "When I finish a Pomodoro, mark deep-work done"
- "Connect my pomo to my habit tracker"
- "Wire the timer to the todos so it checks the first task"

---

## Steps

### 1. Read the board
```bash
sys board show --json
```
You need the real node IDs and the valid event/command names for each node.

### 2. Identify the source node and event
Find the node the user is referring to as the **trigger** (the `from` side).

Common events:
| Node | Events |
|---|---|
| `pomo` | `onComplete`, `onStart`, `onBreak` |
| `todo` | `onCheck`, `onAdd` |
| `habit` | `onToggle` |

### 3. Identify the target node and command
Find the node the user wants to **react** (the `to` side).

Common commands:
| Node | Commands |
|---|---|
| `habit` | `markDone`, `markUndone` |
| `todo` | `check`, `add` |
| `pomo` | `start`, `stop` |

### 4. Validate both exist
If you can't find the node or event/command in the board JSON, **don't guess**. Say:
> "I couldn't find a habit called 'meditation'. Do you want me to create it first?"

### 5. Create the edge
```bash
sys edge add \
  --from <sourceNodeId>:<eventName> \
  --to <targetNodeId>:<commandName> \
  [--args key=value]
```

Example:
```bash
sys edge add \
  --from pomo-mother-01:onComplete \
  --to habit-mother-01:markDone \
  --args habit=deep-work
```

### 6. Confirm
```bash
sys edge list --json
```
Verify the new edge appears in the list.

### 7. Reply
> "Done. Now every time you complete a Pomodoro, the 'deep-work' habit will be marked as done for today."

---

## Notes
- Edges are stored in `board.json` as data. They are not code.
- An edge fires when the source node emits the event. The kernel dispatches it.
- You can wire the same event to multiple targets (run `sys edge add` multiple times).
- Edges can be disabled without deleting: `sys edge remove <id>` or use the GUI toggle.
