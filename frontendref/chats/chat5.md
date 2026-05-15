# String Connection Colors

_Started 2026-05-09 20:53 UTC_

---

## User

correct the white colors when something is sleevted is wrong cause the accent color is light green so u cant see the string! fix that.
also the connections between striing nodes for example are wrong, the connection is not between the connection cicels!
look after other bugs and fix them for a finished product!

## Assistant

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: grep]_

_[tool: view_image]_

_[tool: grep]_

_[tool: grep]_

_[tool: read_file]_

Now I have a clear picture of all the bugs. Let me read the pendingPath section fully, then fix everything:

_[tool: update_todos]_

Now I have a clear picture of all bugs:
1. **Connection Y endpoints**: use static `NODE_SIZE` estimates, but ports are at `top: 50%` of *actual* rendered height — causing visible misalignment
2. **Selection color**: dark mode uses `--ink` (cream/white) border + invisible dark box-shadow — barely visible, AND active edges use `--acid` (light green) which is hard to see in light mode
3. **Ports null crash risk**: `Ports` calls `onPortDown(...)` without null check (fixed nodes pass null)

Let me fix all of these now:

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Now fix the JS — imports, measured sizes state, the useLayoutEffect measurer, edgeEnds, pendingPath, and the Ports null check:

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Now update `edgeEnds` and `pendingPath` to use measured sizes, and add the `useLayoutEffect` measurer:

_[tool: str_replace_edit]_

_[tool: grep]_

_[tool: read_file]_

_[tool: str_replace_edit]_

Now fix `pendingPath` to use measured sizes too:

_[tool: read_file]_

_[tool: grep]_

_[tool: read_file]_

_[tool: str_replace_edit]_

_[tool: grep]_

Good. Now let me verify all the changes landed correctly:

_[tool: grep]_

All changes are in place. Let me also verify the Ports fix and check for any remaining issues:All good. Let me surface it and check for console errors:

_[tool: done]_

_[tool: fork_verifier_agent]_

_[tool: update_todos]_

Here's what was fixed:

**1. Connection endpoints** — Added a `useLayoutEffect` that measures actual rendered node heights after each layout change. `edgeEnds` and `pendingPath` now use those measured heights (with `NODE_SIZE` as fallback) so edge lines land exactly on port circles regardless of text wrapping.

**2. Selection color** — In dark mode, selected nodes now get a subtle acid-green glow ring (`rgba(201,241,88,0.18)`) instead of the invisible dark box-shadow that was essentially hidden on a dark background. Border uses `--ink-2` (medium cream) rather than the stark white `--ink`.

**3. Active connection visibility** — In light mode, active edges now use `--spine` (dark forest green) instead of `--acid` (light lime) — no more invisible strings on cream backgrounds. Dark mode keeps the acid glow.

**4. Ports null safety** — `Ports` now returns `null` if `onPortDown` is null (fixed nodes), preventing a crash if someone clicks a port on a fixed module. Also added `e.stopPropagation()` on port mousedown so dragging from a port no longer accidentally pans the canvas.

Waiting for the verifier to report back — will address any issues it finds.

## User

Verifier agent check completed

## Assistant

All clear — verifier confirmed everything looks correct. The three bugs are squashed and the whiteboard is clean. Let me know if you spot anything else to polish!

_[tool: snip]_

Ready when you are — what's next?

## User

Apply drawing

## Assistant

_[tool: view_image]_

_[tool: grep]_

Clear — `.cal-cell.today` uses `background: var(--ink)` which in dark mode is cream/white, with `color: var(--acid)` = lime green. Lime on white = illegible. Fix: in dark mode, flip to acid background + dark paper text (same pattern as the `pomo-btn` and `tweak-opt.active`):

_[tool: str_replace_edit]_

_[tool: done]_

Fixed. In dark mode the "today" cell now uses **acid green background + near-black text** — same pattern as the active timer button and selected tweaks. High contrast, on-brand. The event dot on today also switches to `--paper` so it stays visible against the green.

_[tool: fork_verifier_agent]_

Waiting on the verifier. Anything else you'd like to address in the meantime?

## User

Verifier agent check completed

## Assistant

✓ Confirmed clean. The calendar "today" cell now reads properly in dark mode.

