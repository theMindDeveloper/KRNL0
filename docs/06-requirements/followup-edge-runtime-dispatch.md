# Issue spec — Runtime edge dispatch: make persisted edges actually fire

This file is the body of the follow-up GitHub issue. The next agent should be able to start work after reading only this document. It is the implementation half of what [PR #119](https://github.com/theMindDeveloper/KRNL0/pull/119) and issue [#117](https://github.com/theMindDeveloper/KRNL0/issues/117) deliberately did not touch.

---

## 1. Problem in one sentence

`board.json` stores edges as `{ from: {nodeId, event}, to: {nodeId, command}, enabled }` and the canvas draws them as lines, but **no code reads the edge list at runtime and dispatches the target command when a node emits the source event**. Edges are visual-only.

## 2. Evidence — verified by grep, not speculation

```
$ grep -rnE "edges|edge\." src/renderer/components/Canvas/commandDispatch.ts
13: *   - task.delete BFS-removes all descendant tasks + incident edges + linked TodoItem
322:/** Remove a set of node ids (and incident edges) from the store in one call. */
336:        edges: s.board.edges.filter(...)
378:  // Shallow-clone nodes/edges so deleteTaskCascade can mutate them safely.
384:    edges: [...storeState.board.edges],
409:        edges: workingBoard.edges,

$ grep -rnE "edge.*enabled|fire.*event|dispatch.*edge|edges\.filter.*event" src/renderer/
src/renderer/components/Canvas/CanvasFlow.tsx:124:  const active = (data as { edge?: { enabled?: boolean } } | undefined)?.edge?.enabled === true;
```

The only reference to `edge.enabled` at runtime is in the React Flow renderer, used to pick the line style. There is **no event-to-edge dispatch loop**. Confirmed in both the renderer's `commandDispatch.ts` and the shared `src/shared/dispatch/`.

## 3. What the design intent says

The runtime behavior is specified — it just wasn't implemented:

- [docs/05-node-system/node-spec.md:72](docs/05-node-system/node-spec.md#L72):
  > "Edges are data, stored in `board.json`. The kernel maintains an edge table. **When a node emits an event, the kernel dispatches matching edges.** Active edges glow acid-green for ~600ms, then fade."
- [docs/05-node-system/node-spec.md:145](docs/05-node-system/node-spec.md#L145) carves out `'link'` as the visual-only exception, implying every other event/command pair *should* be live.
- [docs/03-architecture/decisions.md Decision 8](docs/03-architecture/decisions.md) sets up `NodeKindSpec.events: readonly string[]` and `commands: Record<string, CommandHandler<TState>>`. The kernel was supposed to use these — it doesn't.

## 4. Context — what PR #119 did and did not do

[PR #119](https://github.com/theMindDeveloper/KRNL0/pull/119) closed issue #117. It made edges fully usable as **data**:

- New shared `src/shared/dispatch/resolveRef.ts` resolves node/edge refs by full id, ≥4-char prefix, or text.
- `src/sys/commands/edge.ts` is real: `edge add/remove/list/enable/disable` with prefix refs, `--json`.
- Parser, SysFacade, command registry all updated.
- `claude/CLAUDE.md` updated to recommend `--json` and document prefix resolution.
- `claude/skills/wire-edge.md` rewritten to **explicitly tell Claude that edges don't fire** today, with a section called "Important honesty up front." This is documentation honesty, not a fix.
- New shared `src/shared/dispatch/todo.ts:createTodoTaskPair` so CLI `todo add` creates the paired TaskNode (Decision 20 invariant 1). The renderer's inline pair creation in `commandDispatch.ts:985-1117` was not refactored to use this helper — a noted follow-up.
- `claude/skills/plan-session.md` rewritten to use `krnl` (was `sys`) and to stop calling stubbed commands.

Tests: 977 pass, including a verbatim issue #117 §8 scenario test. Typecheck clean.

What PR #119 deliberately did **not** do:

- Implement the runtime edge dispatch loop.
- Implement the "active edge glow ~600ms" UI feedback from node-spec.md:72.
- Add a CLI command to dry-run / test-fire an edge (`krnl edge fire <id>` is not in scope of #117).
- Refactor the renderer to call the shared `createTodoTaskPair` helper (ADR-0014 §11 full parity).

## 5. Spec — what runtime dispatch must do

When a node's `onCommand(eventOrCommand, args)` is invoked from the renderer (this is the bottleneck through which every mutation flows — see `src/renderer/components/Canvas/commandDispatch.ts:dispatchNodeCommand`):

1. Apply the command to the node (today's behavior, unchanged).
2. **NEW:** After the command applies, treat the just-applied command as **also an event emitted by that node** (e.g. `task.toggle` on TaskNode A emits a `task.toggle` event from A).
3. Find every edge where `from.nodeId === A.id && from.event === eventName && enabled !== false`.
4. For each matching edge, dispatch `to.command` with the original `args` (or a transformed subset — see §6.5) on `to.nodeId`. Recursively, so dispatched commands can themselves emit events that fire more edges.
5. Render an "active" pulse on the matching edges for ~600ms (node-spec.md:72), then fade.

The simplest mental model: **every command call is also an event emission with the same name.** This is consistent with how command names are namespaced today (`task.toggle`, `pomo.start`, `habit.toggleDay`) — they already read like events.

### Why command-name-as-event-name?

The alternative is a separate "emitted events" surface (e.g. PomoNode would emit `pomo.complete` distinctly from accepting `pomo.cancel`). That's cleaner long-term but doubles the surface and requires every node to declare its emitted events. The simpler "same name, both directions" rule:

- Lets edges work today without new per-node code.
- Matches user mental model: "when the pomo *completes*, mark the habit done" — wire `pomo:pomo.complete → habit:habit.toggleDay`.
- Is what [docs/05-node-system/node-spec.md:145](docs/05-node-system/node-spec.md#L145) implicitly uses in its example `pomo.onComplete → habit.markDone` (modulo old names).

Decision required: **command-name-as-event-name (recommended) OR separate emitted-events declaration.** Either way, document the rule.

## 6. Design decisions the next agent must make

### 6.1 Cycle protection

`task.toggle` fires edge → calls `task.toggle` on another task → fires its edge → … An infinite loop is possible.

**Options:**
- (a) Per-dispatch-tree depth limit (e.g. 32 levels).
- (b) Visited-edge set per top-level dispatch — each edge fires at most once per user action.
- (c) Both.

Recommend **(c)**: visited-edge set primary, depth limit as a belt-and-braces. Log a warning on hitting the limit; abort that branch but continue siblings.

### 6.2 Multi-target ordering

One event → N edges. What order do they fire?

**Options:**
- (a) Order in `board.edges` array (insertion order — predictable for users who add them in sequence).
- (b) Sorted by edge id (stable but unintuitive).
- (c) Parallel (Promise.all — but commands are sync in the current FSM).

Recommend **(a)**: insertion order. Matches user intuition and is observable in `krnl edge list`.

### 6.3 What about `args`?

When edge `pomo:pomo.complete → habit:habit.toggleDay` fires, the original `args` to `pomo.complete` are `{ sessionId, completedAt }`. The target `habit.toggleDay` expects `{ id, date }`. They don't match.

**Options:**
- (a) Pass original args through; target ignores keys it doesn't understand. Simple but limited — habit doesn't know which habit to toggle.
- (b) Allow edges to carry a static `args` payload that overrides/extends: `{ ..edge, args: { id: 'habit-xxx' } }`. The CLI would expose this as `krnl edge add --from ... --to ... --args '{"id":"habit-xxx"}'`.
- (c) Lookup table per (from.event, to.command) pair (hard-coded transforms).

Recommend **(b)** as the v1 — keeps edges as pure data, makes the wiring meaningful. The user's "wire pomo to habit X" intent maps directly to "edge with args.id = X habit's id". Note: `claude/skills/plan-session.md` originally tried this (`--args key=value` syntax) before the flag was removed — bringing it back is consistent with original design intent.

### 6.4 The `link` exception

[node-spec.md:145](docs/05-node-system/node-spec.md#L145) says edges drawn between non-mother nodes via Handle drag carry `from.event = 'link'`, `to.command = 'link'` and are **never dispatched**. The dispatch loop must short-circuit when `from.event === 'link'`.

This is the only event-name short-circuit. Document it.

### 6.5 Disabled edges

`enabled === false` edges must not fire. Already a field; dispatch must check it.

### 6.6 Active-edge glow

The 600ms acid-green pulse is a visual concern, not a behavior concern. It can be a separate sub-task after dispatch lands. Suggested implementation: dispatch loop emits a `useBoardStore` notification like `lastFiredEdgeId: { id, firedAt }`; React Flow edge component reads it and applies a CSS pulse class.

### 6.7 CLI surface additions

Once dispatch lands, the CLI should grow:

- `krnl edge fire <ref>` — test-fire an edge manually (dry-run with current args from the source node's recent state, or with `--args '{...}'`). Useful for Claude to verify wiring without manipulating the source.
- `krnl edge args <ref> --json '{...}'` — set the static args payload on an edge (decision 6.3).
- `krnl edge trace <fromRef>` — print the edge dispatch tree that would fire if the node emitted each of its commands.

Update `claude/skills/wire-edge.md` and `plan-session.md` to remove the "edges don't fire today" honesty disclaimers once shipped.

## 7. Concrete acceptance scenarios

Each scenario should pass end-to-end after this work ships.

### 7.1 Pomodoro completion auto-marks a habit

```
krnl habit add "Deep work"
$habitId = (k-json habit list)[0].id           # PowerShell-style for the example
krnl task add "thesis writing" --duration 25
$taskId  = (k-json task list)[0].id
krnl edge add --from "${taskId}:task.toggle" --to "${habitId}:habit.toggleDay" --args '{"id":"$habitId","date":"2026-05-14"}'
krnl task toggle $taskId
# Expected: the habit is now marked done for 2026-05-14
(k-json habit list)[0].logCount   # was 0, now 1
```

### 7.2 Task chain auto-advances

Given an existing `task.next` edge between siblings (auto-created by `task add`):

```
krnl task toggle <task-1-prefix>
# Expected: task.next event fires task.activate edge → next task in chain is now "active"
(k-json node read <task-2-prefix>).state.active   # true
```

(`task.activate` semantics need to be defined — likely sets a `loaded` or `active` flag on the task. Today there's no field; this needs adding to TaskState.)

### 7.3 Disabled edges don't fire

```
krnl edge disable <edge-prefix>
krnl task toggle <source-task-prefix>
# Expected: target node unchanged
```

### 7.4 `link` edges never fire

```
krnl edge add --from "${a}:link" --to "${b}:link"
krnl text set $a --text "x"   # would emit text.setText, not link
# Expected: no dispatch happens via the link edge; target unaffected
```

### 7.5 Cycle protection

```
krnl edge add --from "${a}:task.toggle" --to "${b}:task.toggle"
krnl edge add --from "${b}:task.toggle" --to "${a}:task.toggle"
krnl task toggle $a
# Expected: dispatch completes without stack overflow; visited-edge set prevents re-fire
```

## 8. File-level pointers

Where the next agent should start:

| File | What to change |
|---|---|
| `src/renderer/components/Canvas/commandDispatch.ts` | Add edge dispatch at the end of `dispatchNodeCommand` (after the command applies, after the store is updated, before the IPC save). |
| `src/shared/dispatch/edges.ts` (new) | Pure function `findEdgesForEvent(board, nodeId, event)` and a `dispatchEdges(board, eventOrigin, eventName, args, visited)` helper that returns a list of (nodeId, command, args) triples to apply. Keep it pure for testability. |
| `src/shared/types.ts` or `node-spec.ts` | Add optional `args` field to `AnyEdge` (Decision 6.3). |
| `src/sys/commands/edge.ts` | Add `edgeArgs` handler for `krnl edge args <ref> --json '...'`. Add `edgeFire` for `krnl edge fire <ref>`. |
| `src/sys/parser.ts` | New subs: `edge args`, `edge fire`, `edge trace`. |
| `src/shared/cli/commandRegistry.ts` | Help entries for the new subs. |
| `claude/CLAUDE.md` and `claude/skills/wire-edge.md` | Once shipped, remove "edges don't fire today" sections; document the real semantics. |
| `tests/unit/renderer/edgeDispatch.test.ts` (new) | Cover §6.1–§6.5 and §7.1–§7.5. |

## 9. Out of scope (deliberate)

- Per-event args transform DSL (Decision 6.3 option (c)).
- Async/Promise.all edge dispatch (everything stays sync; FSM contracts assume sync).
- Edge-firing throttle / rate limit.
- Edge-firing audit log persisted to board.json (could be a future feature).
- Renderer parity for `createTodoTaskPair` (separate PR #119 follow-up).

## 10. Acceptance — definition of done

- All 5 scenarios in §7 pass end-to-end via PowerShell-driven `krnl` calls.
- New unit tests in `tests/unit/renderer/edgeDispatch.test.ts` cover cycle, multi-target, disabled, link-exception, args-passing.
- `claude/CLAUDE.md` and `claude/skills/wire-edge.md` are rewritten to reflect that edges now fire.
- `npm run typecheck` clean, `npm test` passes (currently 977; this work will add ~10 tests).
- Active-edge glow (node-spec.md:72) is implemented OR explicitly deferred to a sub-issue.

## 11. Open questions for the user / architect

Before coding, the next agent should confirm with the project owner:

1. **Command-name-as-event-name or separate emitted-events surface?** (§5)
2. **Static args on edges or dynamic transform DSL?** (§6.3) — recommend static.
3. **Should `task.next → task.activate` chain edges actually auto-advance tasks?** Today they're decorative. If yes, `TaskState` needs an `active` boolean and TaskNode needs to render it.
4. **Active-edge glow in this PR or a follow-up?** (§6.6)

---

## Filing this as an issue

When ready, file via:

```bash
gh issue create --repo theMindDeveloper/KRNL0 \
  --title "Runtime edge dispatch — make persisted edges actually fire (Decision 8 / node-spec §7.2)" \
  --body-file docs/06-requirements/followup-edge-runtime-dispatch.md \
  --label enhancement
```

Or paste the body into the issue UI manually.
