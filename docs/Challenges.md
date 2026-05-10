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
