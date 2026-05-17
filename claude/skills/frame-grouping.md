# Skill: Frame grouping (create, label, resize, tint, contents)

Use this when the user says something like:
- "Group those tasks into a frame"
- "Put a label around the morning routine"
- "Make a green box around the project Alpha tasks"
- "What's inside that frame?"
- "Resize the frame to fit"

---

## Mental model

A `FrameNode` is a non-mother child node that visually contains other nodes. It is purely spatial — no edges, no commands wired to/from it. The grouping is "soft": a node belongs to a frame if its **center** sits inside the frame's bounds at rest, and the renderer recomputes this on drag-end / resize-end, persisting the result to `state.childIds`.

```ts
state:  { label: string; width: number; height: number; childIds: string[] }
config: { tint?: 'cyan' | 'spine' | 'rust' | 'plum' | 'neutral' }
```

Defaults: `width=360, height=240, label='', tint='neutral'`.

---

## Create a frame

```bash
# At a specific position with explicit size
krnl frame add --label "Morning" --at 200,100 --w 600 --h 320 --tint cyan

# At viewport center (default 360×240)
krnl frame add --label "Morning" --tint cyan

# Centered on an existing node — auto-sizes to fit source + padding,
# seeds source into childIds
krnl frame add --label "Morning" --tint cyan --near <task-ref>
```

**`--near <ref>` for frames is special.** The frame is positioned so the source node's center lies inside the frame bounds (`frame top-left = srcCenter - (w/2, h/2)`). When `--w` / `--h` aren't provided, the frame **auto-sizes** to `max(FRAME_MIN=320×200, source_size + 2×40 px padding)` — so the frame always actually contains the source. `state.childIds` is seeded with `[sourceId]` at creation; this is the only create-time seeding, further changes come from the renderer's spatial logic.

## Fit a frame to its contents — `krnl frame fit <ref>`

After spawning tasks into an existing frame, run:

```bash
krnl frame fit <frame-ref>              # 40 px padding (default)
krnl frame fit <frame-ref> --padding 80 # custom padding
```

`frame fit`:
1. Reads `state.childIds` (the persisted soft-group)
2. Looks up every child's position + size
3. Computes the bounding box of all children
4. Sets the frame's `position` and `width`/`height` so the box is wrapped with `padding` on every side
5. Floors at `FRAME_MIN_W = 320` and `FRAME_MIN_H = 200`

Use this whenever you've spawned content into a frame and the user is going to look at it. Without `fit`, the frame likely doesn't visually contain everything it logically owns.

**When `frame fit` refuses:**
- `"no childIds — nothing to fit"` — `state.childIds` is empty. Either the renderer hasn't recomputed yet (drag-end hasn't fired), or the nodes you want included haven't been moved into the frame's bounds. Re-read with `frame contents <ref> --json` and/or `node move <child-ref> --to x,y` to nudge.
- `"none of the N childId(s) resolve to live nodes"` — every persisted childId points to a node that no longer exists. The frame is stale; either remove it or rebuild the group.

---

## Modify a frame

```bash
krnl frame label  <ref> "Morning routine"
krnl frame resize <ref> --w 600 --h 360
krnl frame tint   <ref> cyan                 # cyan|spine|rust|plum|neutral
```

`tint` palette:

| Tint     | Vibe                       |
| -------- | -------------------------- |
| cyan     | active focus, energy       |
| spine    | structural / backbone      |
| rust     | deep work / heavy lifting  |
| plum     | reflection / planning      |
| neutral  | default / no semantics     |

---

## Inspect a frame

```bash
krnl frame list --json                       # all frames with size + childIds
krnl frame contents <ref> --json             # just the childIds for one frame
```

**`frame contents` reads persisted `childIds`.** It does NOT recompute spatial containment. If the user just dragged a node into the frame but the renderer hasn't flushed yet (or the app is closed), the contents listing won't reflect the move. Read commands read state — they never re-derive geometry.

---

## Putting a node into a frame

There is **no `krnl frame add-child` command** — and that's intentional. Membership is spatial. To add a node to an existing frame:

1. **Position the node so its center lies inside the frame.** Use `krnl node move <node-ref> --to x,y` or `krnl node set-position <node-ref> --x N --y N`.
2. **Or resize/move the frame to cover the node.** Use `krnl frame resize` / `krnl node move <frame-ref> --to x,y`.

Either way, the renderer recomputes `childIds` at drag-end / resize-end and persists. If you need the membership *immediately* and headlessly (e.g., scripting a pipeline), use `--near <ref>` at frame creation time to seed it.

---

## Common pipelines

### A. Frame three tasks you just created

```bash
krnl task list --json                        # find ids
krnl frame add --label "Project Alpha" --tint plum --near <first-task> --w 600 --h 280
# Move task 2 and task 3 so their centers land inside the frame.
krnl node move <task-2> --to <x,y inside frame>
krnl node move <task-3> --to <x,y inside frame>
krnl frame contents <frame-ref> --json       # verify
```

### B. Wrap a morning routine after the fact

```bash
krnl habit pin meditation                    # creates habit.lane node — needs renderer
krnl task list --json
krnl frame add --label "Morning" --tint cyan --w 700 --h 360 --near <writing-task-ref>
```

### C. Just visual organization, no membership tracking

```bash
krnl frame add --label "Inbox" --tint neutral --at 0,0 --w 800 --h 400
# Drag nodes in later; the renderer tracks membership on drop.
```

---

## What frames are NOT

- ❌ They are **not mother nodes.** They don't have a fixed slot or required uniqueness.
- ❌ They don't intercept commands. A node inside a frame still receives its own commands directly.
- ❌ They don't filter analytics. `analytics show` counts tasks regardless of frame membership.
- ❌ They don't enforce containment. A node can sit "inside" a frame visually without being a child (until next spatial recompute).

## What frames ARE

- ✅ A visual cluster for the human's eye.
- ✅ A semantic group for AI — "show me what's in the Morning frame" → `krnl frame contents <ref> --json` → operate on the children.
- ✅ A persisted memory of "these nodes belong together" — useful when the human revisits.

---

## Anti-patterns

- ❌ Trying to add a node to a frame without moving it. Membership is spatial.
- ❌ Calling `frame contents` and expecting it to recompute. It reads persisted state.
- ❌ Using a tint as a status indicator that the AI will read later. Tints are aesthetic; they have no semantic meaning the code respects.
- ❌ Creating frames inside frames. Technically allowed, but the renderer's containment doesn't handle nesting cleanly — keep frames flat.
- ❌ Spawning a multi-task chain inside a frame and then walking away **without `frame fit`**. The default frame size is conservative — without `fit` the frame won't visually wrap the chain you just built.

## Right patterns

- ✅ `--near <ref>` when you want one source node guaranteed inside the new frame.
- ✅ Resize the frame generously and let the user nudge in the rest by hand.
- ✅ Use tint for aesthetic grouping the human will recognize, not for logic.
- ✅ When asked "what's in that frame?", run `frame contents <ref> --json` and resolve each child id to its node (via `node read <id>`).

---

## Reply templates

- "Created — cyan tint, 600×320."
- "Resized to 700×360."
- "Frame holds three tasks: spec draft, design pass, test scaffold."
- "Renamed the frame label."
- "Move the task so its center is inside the frame — the renderer'll group it automatically."
