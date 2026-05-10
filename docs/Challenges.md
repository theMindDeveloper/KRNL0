# KRNL0 — Challenges & Solutions Journal

Detailed write-ups of the hard bugs and design problems we've solved. Each entry is written in plain language so anyone — not just the engineer who solved it — can read it later and learn from it.

**When to add an entry:** every time a non-trivial problem has been solved **and** the user has personally verified the fix works. Don't journal here for trivial fixes or anything still being debugged.

**Entry template:**

```
## YYYY-MM-DD — One-line title of the problem

### The symptom (what the user saw)
What was broken from the user's point of view, in plain language.

### What we thought was wrong (and why we were wrong)
The wrong guesses, so future-us doesn't waste time on them again.

### What was actually wrong
The real root cause, explained simply with an analogy if it helps.

### The fix
The actual change that made it work. Files and line counts.

### The lesson
The general principle to remember. One or two sentences.
```

---

## 2026-05-10 — Backspace, arrows, and Tab silently dead in the terminal node

### The symptom (what the user saw)

In the terminal node:
- Pressing Backspace did nothing — the cursor stayed put, characters were not erased.
- Arrow keys did nothing — no history recall, no cursor movement within the line.
- Tab completion did nothing.
- Regular characters (letters, digits, punctuation) **did** work — typing produced visible text.

The terminal showed the PowerShell prompt and accepted typed commands, but you could never correct a typo.

### What we thought was wrong (and why we were wrong)

Two wrong guesses cost us roughly two debugging cycles before we found the real cause.

**Guess 1 — "PowerShell expects a different byte for Backspace."**
History: an earlier PR (#70) had translated the byte xterm.js sends for Backspace (`0x7f`, the POSIX DEL convention) into the older `0x08` (BS) to keep cmd.exe happy. After we switched the default shell to PowerShell (#71), we removed that translation, thinking PowerShell wanted `0x7f` natively. Backspace still didn't work. We then suspected PowerShell + ConPTY required some special VT escape sequence and started researching workarounds. **This was a dead end — the bytes were never reaching PowerShell in the first place.**

**Guess 2 — "Maybe the dev server has a stale build / electron is caching something."**
Restarting `npm run dev`, blowing away caches, full reboots — none of it changed the behavior. We wasted time on environmental theories before instrumenting properly.

### What was actually wrong

Look at the terminal node like a room with a security guard at the door and a typist inside who takes dictation.

When you press a key, the browser dispatches the keystroke as a tiny messenger that travels from the top of the page down toward the actual element you're typing in. xterm.js renders into a hidden `<textarea>` (the typist). For the keystroke to be recorded, the messenger has to **reach that textarea**.

The DOM dispatches events in two phases:

1. **Capture phase** — event travels **down** from the window toward the target, visiting every ancestor element first.
2. **Bubble phase** — event travels back **up** from the target toward the window.

We had this code on the outer wrapper around xterm:

```tsx
onKeyDownCapture={(e) => e.stopPropagation()}
onKeyDown={(e) => e.stopPropagation()}
onKeyUp={(e) => e.stopPropagation()}
```

The intent was reasonable: "don't let React Flow or our app-level keyboard shortcuts intercept keys typed in the terminal." But `onKeyDownCapture` runs in the **capture phase** — it fires on the way down, **before the event reaches xterm's textarea**. Calling `stopPropagation()` there stops the messenger at the door. xterm's keydown listener never fires. The byte is never computed. Nothing is sent to the PTY.

Then why did typing `a`, `b`, `c` work? Because xterm reads **printable characters from the `input` event**, not from `keydown`. The `input` event fires after the textarea has already received the character, so the capture-phase keydown blocker doesn't touch it. xterm handles **all other keys** (Backspace, arrows, Tab, Home, End, function keys, Ctrl+combos) **through its `keydown` listener** — every one of those was silently killed.

The instrumentation we added — `console.log` in xterm's `onData` — was the proof. When the user pressed Backspace, there was **zero output** in the console. The byte never left xterm because xterm never received the keystroke.

### The fix

Single change in [src/renderer/components/nodes/TerminalNode/index.tsx](../src/renderer/components/nodes/TerminalNode/index.tsx). Delete the capture-phase handler, keep the bubble-phase ones:

```diff
- onKeyDownCapture={(e) => e.stopPropagation()}
  onKeyDown={(e) => e.stopPropagation()}
  onKeyUp={(e) => e.stopPropagation()}
```

`onKeyDown` (no `Capture` suffix) runs in the bubble phase — **after** xterm's listener has already consumed the event. We still get our "don't leak keystrokes to React Flow" protection, but we no longer block xterm's own keydown handler. Backspace, arrows, and Tab immediately started working.

Verified by the user: typing `abc` then Backspace now produces `[KRNL0 →pty] "" 0x7f` in the console, and PowerShell echoes the redraw back.

### The lesson

`stopPropagation()` in **capture phase** prevents the event from reaching the target at all. `stopPropagation()` in **bubble phase** only prevents the event from continuing up the tree after the target has already handled it. When you want to "stop a key from leaking out" without breaking the component that should handle it, use **bubble phase only**.

More generally: when a bug "doesn't happen for some inputs but happens for others" that look superficially identical (printable characters work, special keys don't), the difference is almost always **which event the library listens to**. Instrument the boundary (what's actually being emitted at the seam between us and the library) **before** theorizing about the layers below it. The advisor flagged exactly this on the first call and we dismissed it; instrumenting earlier would have saved a full debugging cycle.

---

## 2026-05-11 — Dragging a node stuttered, and the node didn't move until you let go

### The symptom (what the user saw)

Two distinct symptoms, both on non-mother nodes (text, image, task):

1. **First version of the bug — node frozen during drag.** Click a node, hold the mouse button, move the cursor across the canvas. The node sat still — exactly where it started — and the cursor moved alone. The moment you released the mouse, the node *teleported* to wherever the cursor was. No motion in between. It felt like the canvas was on a 1-second tape delay.
2. **Second version — node moves but stutters.** After the first fix, the node followed the cursor, but in a stuttery, juddery way — like a video stream dropping frames. Smooth for a moment, then a tiny hitch, then smooth again. Repeatedly. And the browser console was spamming:
   > `[React Flow]: It seems that you are trying to drag a node that is not initialized. Please use onNodesChange as explained in the docs.`

### What we thought was wrong (and why we were wrong)

Three wrong guesses before the real cause landed. This one cost us five full iteration cycles.

**Guess 1 — "React Flow has an internal drag preview, so ignoring `dragging===true` updates should be fine."**
The original `onNodesChange` deliberately skipped position updates while `dragging` was true, on the assumption that RF would render its own drag preview internally and we only had to commit the final position when the user let go. This is how RF v10/v11 worked in *uncontrolled* mode. In v12 *controlled* mode (which we use because `boardStore` is the source of truth per Decision #13 §C) RF has **no internal preview** — the rendered position is whatever's in the `nodes` prop, full stop. If we don't apply the position changes, the node literally doesn't move. **That was the cause of bug #1.** Fixed by applying the position update on every tick.

**Guess 2 — "The stutter is CSS animations layered on top of fast input."**
After bug #1 was fixed, we'd added an Apple-style lift + tilt + spring-settle animation on top of the drag. The user said it stuttered. We assumed the animation itself was the culprit — `transition: transform 0.08s` was fighting the 60 fps tilt updates, `filter: drop-shadow` was re-rasterising every frame, etc. We stripped all the animation layers — pure grab-and-drop, no transforms. **The stutter persisted.** The animation was a minor contributor but not the root cause.

**Guess 3 — "Mother nodes are re-rendering 60 fps and TerminalNode owns xterm — that's the bottleneck."**
The advisor (correctly) flagged that our `rfNodes` memo was rebuilding `RFNode` objects for mother nodes every render with fresh `onMoveLeft` / `onMoveRight` closures, defeating `React.memo` on the adapter. With xterm.js inside `TerminalNode`, re-rendering it 60 fps would absolutely cause stutter. We cached mother nodes the same way non-mothers were cached. **The stutter still persisted.** The mother re-render was real waste, but it was downstream of the actual problem and fixing it alone didn't move the needle.

### What was actually wrong

The console warning was the real signal, and we ignored it for too long.

Think of React Flow like an interior designer trying to move furniture in a room. Before it can move a chair, it needs to know **how big the chair is** — its width, its height, its measured DOM dimensions. RF gets that information by listening to a `ResizeObserver` it attaches to each node. When the size is measured, RF emits a `'dimensions'` change in `onNodesChange` with the new bounds and *asks the consumer to record it*.

Our `onNodesChange` was doing this:

```ts
for (const change of changes) {
  if (change.type === 'position') { /* apply */ }
  else if (change.type === 'select') { /* apply */ }
  // 'remove', 'dimensions', 'add' — all ignored per §C.
}
```

We were silently dropping every `'dimensions'` change. Result: RF's internal node lookup table said *"this node has unknown dimensions"* for every node on the canvas. When you grabbed one to drag it, RF couldn't take its **fast measured drag path** — the path that uses the registered dimensions to compute hit-test boxes, drag offsets, and node-to-pointer projection in O(1). Instead it fell back to an uninstrumented slow path that does extra DOM measurements per drag tick, and **printed warning #015** to tell us why.

That slow path is what stuttered. And because every drag tick was *also* writing through Zustand → triggering `CanvasFlowInner` re-render → `StatusBar` re-render → mother nodes re-render → all edges re-render, even the fast path would have been doing real React work 60 times per second. The two problems were compounding.

The analogy that landed for the user: the slow path is like a courier who, every time you ask them to move a chair, **re-measures the chair with a tape measure** before they can pick it up. The fast path is like a courier who memorized every chair's dimensions when they first walked into the room. We were forcing the courier to re-measure on every step of the drag because we never let them write the measurement down.

### The fix

Swap to the standard RF v12 pattern: **local nodes state owns the live RF working copy; Zustand stays the persisted source of truth**.

In [src/renderer/components/Canvas/CanvasFlow.tsx](../src/renderer/components/Canvas/CanvasFlow.tsx):

```ts
// 1. derivedNodes — still memoised from boardStore (unchanged)
const derivedNodes = useMemo(() => { /* …slot ordering, mother cache… */ }, [board, …]);

// 2. local nodes state — RF's live working copy
const [nodes, setNodes] = useState<KrnlRFNode[]>(derivedNodes);
const isDraggingRef = useRef(false);

// 3. sync from store → local, but only when not mid-drag
useEffect(() => {
  if (!isDraggingRef.current) setNodes(derivedNodes);
}, [derivedNodes]);

// 4. apply ALL changes locally — including dimensions (this is what kills warning #015)
const onNodesChange = useCallback((changes: NodeChange<KrnlRFNode>[]) => {
  setNodes((nds) => applyNodeChanges<KrnlRFNode>(changes, nds));

  for (const c of changes) {
    if (c.type === 'position') {
      if (c.dragging === true) isDraggingRef.current = true;
      else if (c.dragging === false) {
        isDraggingRef.current = false;
        if (c.position) {
          updateNode(c.id, { position: c.position });
          const updated = useBoardStore.getState().board;
          if (updated) void window.krnl?.boardSave(updated);
        }
      }
    } else if (c.type === 'select' && c.selected) selectNode(c.id);
  }
}, [updateNode, selectNode]);

return <ReactFlow nodes={nodes} onNodesChange={onNodesChange} … />;
```

Decision #13 §C still holds: Zustand is the *persisted* single source of truth. The local nodes state is just an ephemeral working copy for RF's internal needs (dimensions, drag deltas) that don't belong on disk.

| | Before | After |
|---|---|---|
| Re-renders during a 60 fps drag | CanvasFlowInner + StatusBar + ViewportPersister + every mother + every edge | None — RF only |
| Dimensions changes applied | Silently dropped → slow drag path | Applied → fast measured drag path |
| Zustand writes per drag | 60/sec | 1 (on drop) |
| Disk writes per drag | 1 (on drop) | 1 (on drop) |

Tests: 291 passing, 0 typecheck errors. User verified smooth 60 fps drag in Electron with no console warning.

### The lesson

**A library warning is data, not noise.** RF was literally telling us "this node is not initialized, please use `onNodesChange` as explained in the docs" — and we spent five iterations on CSS perf, store subscriptions, memo caches, and mother-node optimisation before reading the warning seriously. Every one of those fixes was real but downstream. The warning pointed straight at the upstream cause — dropped `'dimensions'` changes — and we would have found it on iteration one if we had treated the console message as the first piece of evidence instead of background chatter.

More generally: **when you adopt a library's controlled mode, you take on its full feedback contract**. RF emits `position`, `select`, `dimensions`, `add`, `remove` — all five are part of the contract. Picking and choosing which ones to apply is the same as half-installing a sensor: the system *kind of* works but every higher-level behaviour gets weird. The standard `applyNodeChanges` call is one line that handles all five correctly. There's no "we only need the ones we care about" — the library cares about all of them, and if you don't feed them back, the library quietly degrades.

And: **measure before optimising**. The advisor told us this on iteration three and we didn't actually do it — we kept guessing. A React DevTools profile of a 1-second drag would have shown exactly which components were re-rendering and how long they took, and we would have spotted the mother-node cascade and the dropped-dimensions warning simultaneously. The cost of one profiling session is much smaller than five rounds of speculative fixes.

---
