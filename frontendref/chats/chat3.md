# Design Changes

_Started 2026-05-09 18:36 UTC_

---

## User

do these changes

## Assistant

_[tool: list_files]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: snip]_

_[tool: grep]_

Let me see the TaskNode and remaining components:

_[tool: read_file]_

_[tool: str_replace_edit]_

I'll batch the edits efficiently.

_[tool: str_replace_edit]_

_[tool: snip]_

_[tool: str_replace_edit]_

_[tool: snip]_

Now let me check it loads cleanly:

_[tool: show_html]_

_[tool: done]_

_[tool: fork_verifier_agent]_

Done. Key changes:

- **No edges between todo and tasks** — the chain is its own organism. Reordering the todo slot still drags the whole DAG with it.
- **Layered task DAG** — initial layout shows L0 (one task) → L1 (two parallel tasks) → L2 (one merging task). Adding a task spawns it into a new layer wired up from the previous layer's tail.
- **Cyan flowing edges** — task connections are thick cyan strokes with a per-edge SVG gradient that lightens from source to target, plus a marching-dash flow animation; flashing when a task is checked.
- **Click "+ pomo" on any task** — spawns a fresh pomodoro for that task with a rust dotted edge. Counter on the button shows how many already attached. Multiple pomos per task are supported.
- **Sand-grain frame on fixed modules** — stippled dotted frame composited with mask-exclude makes the spine read as embedded into the paper, not floating.
- **Terminal slot tag fix** — terminal node now uses `overflow: visible` with corner-radius preserved on inner head/body, so the SLOT tag is no longer clipped.

## User

the stroke on the paretns window look really bad, make it a thick dark green (theme color) line, also as i said maek all partests nodes THE SAME SIZE.

## Assistant

_[tool: snip]_

_[tool: str_replace_edit]_

_[tool: snip]_

_[tool: done]_

All five fixed modules now share a unified 360×460 footprint and wear a thick deep-green border (`--spine` / `--spine-hot` for hover/dark) instead of the sandy stipple. Corner brackets and the SLOT tag picked up the same green so the spine reads as one rigid, intentional structure.

## User

2 problems:
1. the design is too desteacting, th egreen lines distract the user from the node, try anotehr design choice for this usecase.
2. terminal uses different logic, it only showes the green lines on poitned on,
maek pomodoro look cooler, ad adnimation on top of the number that filles up wit hthe time, cause now its currenlyy emty.

make the tweaks alsoi compatible for me to test all the tweaks with the current design.

## Assistant

_[tool: snip]_

_[tool: str_replace_edit]_

_[tool: snip]_

_[tool: grep]_

_[tool: snip]_

_[tool: str_replace_edit]_

_[tool: grep]_

Now make the tweaks panel fully wired up:

_[tool: snip]_

_[tool: str_replace_edit]_

_[tool: snip]_

_[tool: grep]_

_[tool: snip]_

_[tool: str_replace_edit]_

_[tool: snip]_

_[tool: done]_

Pomodoro now has a big ring + the time fills with accent green from the bottom as the timer drains. Tweaks panel is fully wired: theme, accent (acid/cyan/plum recolor the whole accent system), density (compact/comfy/spacious adjusts ring size, clock size, padding), and grid dots.

