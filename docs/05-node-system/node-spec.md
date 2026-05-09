# THE SYSTEM — Node System Specification

*Extracted from PRD v0.6.0 §7*

---

## 7.1 Mother and child

**Mother nodes** are anchored at fixed canvas coordinates. Cannot be dragged or deleted. The user pans past them but can always recenter (`Home` key).

| Mother | `kind` | Position | Role |
|---|---|---|---|
| Pomodoro | `pomo` | `(0, 0)` | Focus timer + session log |
| Todos | `todo` | `(-480, 0)` | Active task list |
| Habits | `habit` | `(480, 0)` | 7-day grid + streaks |
| Terminal | `term` | `(0, 320)` | `sys` CLI host |

Camera centers on `(0, 160)` at startup so all four are visible.

**Child nodes** are spawned by mothers, by the user, or by the assistant. Free to drag, delete, connect. Examples: `pomo.session` (one focus block), `todo.task` (one task), `habit.day` (one completion record).

---

## 7.2 The Node contract

Every node — mother or child — is the same shape:

```typescript
interface Node<TState = unknown, TConfig = unknown> {
  id: string;                          // ULID
  kind: string;                        // "pomo", "todo.task", ...
  position: { x: number; y: number };
  state: TState;                       // serializable JSON
  config: TConfig;                     // user-editable settings
  isMother: boolean;
}

interface NodeKind<TState, TConfig> {
  kind: string;
  defaultState: () => TState;
  defaultConfig: () => TConfig;
  render: (props: RenderProps<TState, TConfig>) => ReactElement; // pure
  commands: Record<string, CommandHandler<TState>>;
  events: readonly string[];
  schema: ZodSchema<TState>;
}
```

### Six rules, none of which bend

1. **State is JSON-serializable.** No functions, no class instances, no DOM references, no closures.
2. **Render is pure.** Same state + config → same UI. Side effects belong in command handlers.
3. **Commands mutate state.** Every state change goes through a named command. No direct `setState`.
4. **Events are typed strings the node emits.** They're the connection points for edges.
5. **Cross-node logic only through edges.** No two node modules import each other. Ever.
6. **No node has privileged access.** Mothers use the same APIs as children. "Anchored, can't delete" is enforced by the kernel, not by the mother nodes.

---

## 7.3 Edges

```typescript
interface Edge {
  id: string;
  from: { nodeId: string; event: string };
  to:   { nodeId: string; command: string };
  args?: Record<string, unknown>;
  enabled: boolean;
}
```

Edges are data, stored in `board.json`. The kernel maintains an edge table. When a node emits an event, the kernel dispatches matching edges. Active edges glow acid-green for ~600ms, then fade.

### Three ways to create an edge

1. **Drag** from output port `●` to target node.
2. **Voice:** *"when I finish a Pomodoro, mark deep-work done"*
3. **CLI:** `sys edge add --from pomo:onComplete --to habit:markDone --args habit=deep-work`

---

## 7.4 Persistence rule — persist intent, derive presentation

A running Pomodoro is not saved tick-by-tick. Saved:

```json
{
  "kind": "pomo",
  "state": {
    "currentSession": {
      "id": "01HX...",
      "startedAt": "2026-05-09T14:32:00Z",
      "durationMin": 25,
      "label": "thesis writing",
      "status": "running"
    },
    "history": []
  }
}
```

The countdown is computed every render from `now() - startedAt`. Close the app for 5 minutes, reopen — timer correctly shows the right elapsed value.

Same rule for habits (store completion log, derive "is today done") and edges (store wiring, derive activity).

**Never save UI-derived state. Only save intent.**

---

## 7.5 Board file format

User data folder:
```
~/Documents/the-system/
├── board.json
└── notes/                     ← markdown sidecars (Journal v1.5)
    └── journal-2026-05-09.md
```

`board.json` schema:
```json
{
  "version": 1,
  "schemaVersion": 1,
  "savedAt": "2026-05-09T15:00:00Z",
  "viewport": { "x": 0, "y": 160, "zoom": 1 },
  "nodes": [],
  "edges": []
}
```

**Round-trip contract:** `load → save → byte-identical` (modulo `savedAt`). This is tested.

---

## 7.6 Codebase structure (source, not user data)

```
/krnl0/                        ← git repo
├── src/                       ← TypeScript code
├── claude/
│   ├── CLAUDE.md              ← instructions Claude Code reads on every turn
│   └── skills/
│       ├── plan-session.md
│       └── wire-edge.md
└── package.json
```

`CLAUDE.md` and `skills/*.md` ship inside the codebase and are committed to git. The Brain layer points at them by absolute path when spawning Claude Code. They are not user config — they are part of the system.
