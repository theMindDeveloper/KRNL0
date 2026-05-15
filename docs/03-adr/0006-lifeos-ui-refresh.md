# ADR 0006 — LifeOS UI refresh

**Status**: Accepted (2026-05-15)
**Source of truth**: `frontendref/LifeOS Whiteboard.html` (4905 lines) + the
8 chat transcripts under `frontendref/chats/`.

## Context

The user iterated a "LifeOS Whiteboard" prototype with claude.ai/design and
exported a 630 KB handoff bundle into `frontendref/`. The bundle's README
directs coding agents to recreate the design pixel-perfectly in the target
codebase's tech — not to copy the prototype's structure verbatim. KRNL0's
existing visual system (`docs/04-visual-system/design-tokens.md`) is the
foundation we extend.

The user's spoken brief, in addition to the bundle:

- Uniform node sizing, **squarish/balanced rectangle**, larger than today
- Pomodoro with **5 selectable timer faces** (ring / ascii / lcd / blocks /
  vapor), no colored edges on the node frame
- Clock displays more information (parallel-task rings already existed;
  add hands, "now" notch, meridiem, active-arc pulse)
- Habit cells: rectangles with small black inner blocks (the LifeOS
  two-color trick); animated drag for habit cards
- Calendar month view: hide next-month numbers, today in green, today's
  tasks listed
- Todo node: red accents
- AI orb: ambient liquid glow, click opens a chat panel (mock if no
  backend)
- TopBar brand mark: big square with a smaller black square inside
- StatusBar: black, more metrics (day, pomo session, nodes, edges, …)
- Front-end only; do not touch backend / store / IPC / persistence

## Decisions

### 1. Canonical mother size — **440 × 440**

Down from 380 × 600 (portrait). MonthView's 6-row grid uses `flex: 1`
rows, so it scales cleanly at 420–460. 440 is the squarish midpoint and
matches the user's "balanced rectangle" signal. **MotherFrame.MOTHER_WIDTH
/ MOTHER_HEIGHT and rfAdapters INITIAL_DIMS_BY_KIND must stay in sync** —
a mismatch makes the RF selection ring sit off the visible card. Both
constants are commented to point at each other and at this ADR.

Existing `board.json` nodes keep their stored dimensions; only newly added
mothers seed at 440 × 440. No migration is performed (frontend-only).

### 2. Per-node Pomodoro variant, **selected via gear menu**

`PomoConfig.face: 'ring' | 'ascii' | 'lcd' | 'blocks' | 'vapor'` (optional;
defaults to `'ring'`). A `switch` in PomoNode renders the matching
component from `variants/`. The face picker lives in the gear panel and
dispatches `pomo.setFace`.

LifeOS used `MutationObserver` on `<html data-timer>` for variant
switching. We **rejected** that pattern as over-engineering for our stack
— per-node config + a switch is simpler and gives us per-instance state
without a global side channel.

### 3. Brand mark — **acid outer + ink inner block** (literal reading)

22 × 22 acid (`#c9f158`) square with a 10 × 10 ink (`#1a1814`) block
centred inside it; "KRNL" wordmark in `--font-mono` beside, with the
trailing `0` dimmed to `--ink-3`. This is the user's literal description.
We considered the LifeOS-source mirror (ink outer + acid `■` glyph +
dashed border) and rejected it as confirmation bias toward the prototype.

### 4. Today cell — **acid green in both themes**

Class `.krnl-month-cell--today` paints the cell with `var(--acid)` and
forces a hard-coded `#1a1814` text colour so contrast holds in both
light and dark themes (acid is theme-invariant; `--ink` flips). The
existing `krnl-today-pulse` ring is kept on top of the fill, now stroking
`var(--ink)` so it reads against green.

This supersedes the older "rust in light, acid in dark" decision from
LifeOS chat 5 — the user explicitly said "green" during the May 15
session.

### 5. Todo rust accents — **surgical**

- `var(--rust)` count badge in the header when `overdueCount > 0`
- 5×5 `var(--rust)` dot at the start of each row whose scheduled end has
  passed and is still undone

Same `isPast` rule as the existing graying. No FSM, store, or sort
changes. Architecturally indistinguishable from a token refresh.

### 6. ClockNode — additive only

- Live hour + minute hands inside the SVG, gated on `isToday` AND the
  current minute falling inside the displayed 12h window. Driven by the
  singleton `useTick()` at 500ms (no new timer).
- "Now" notch in `var(--rust)` on the outer ring at the current minute.
- Meridiem readout (`PM 14:37`) in the top-right of the dial.
- Active-arc pulse — the arc the wall-clock is currently inside applies
  the `clock-arc-pulse` keyframe (added in PR1).

Parallel task rings already existed (ADR 0004 §4) with a cap of 4
concentric rings + `mixBlendMode: 'multiply'` collapse for branches 4+.
No changes to ring math or day-anchored selectors.

### 7. HabitSwapModal — **deferred**

LifeOS' habit-drop-onto-calendar opens a two-choice modal ("Every
weekday" vs "Every day"). KRNL0 already covers this via the
**RadialChooser** (ADR 0002 §2). Building a separate LifeOS-style modal
would duplicate the role.

If the visual differs enough that the design team wants a redesign of
the chooser itself, that's a follow-up — not a port of the LifeOS modal
verbatim.

### 8. KRNL0 Crazy own mode — **deferred to PR10**

`[data-vibe="krnl0"]` stub comment is in `tokens.css`; the saturated
cyber variant ships after the Phase 1–9 visuals land and the user has
seen them running.

## Sync points and risk fences

| Sync pair | Location | Why |
|---|---|---|
| Mother size | `MotherFrame/index.tsx` ↔ `Canvas/rfAdapters.tsx` | RF selection-ring alignment |
| Timer face | `PomoConfig.face` ↔ `variants/*.tsx` registry | Default-on-missing keeps old `board.json` valid |
| Today colour | `reactflow-theme.css` `.krnl-month-cell--today` ↔ `MonthView.tsx` inline `color: '#1a1814'` for today rows | Acid is theme-invariant; text must hard-code |

Untouched surfaces (frontend-only scope):
- `src/main/`
- `src/brain/`
- `src/renderer/store/`
- `src/renderer/dnd/habitDrag.ts`
- xterm.js theme inside `TerminalNode/`

## Phase log

| PR | Scope | Commit |
|---|---|---|
| PR1 | Tokens — keyframes for PR4–PR9, vibe stub | `d089bfe` |
| PR2 | MotherFrame + rfAdapters → 440 × 440 | `7c348f3` |
| PR3 | TopBar brand mark + 8-item StatusBar | `60e9e91` |
| PR4 | PomoNode + 5 variant subcomponents (delegated to backend-dev) | `2cdbb11` |
| PR5 | ClockNode hands + now-notch + meridiem + active-arc pulse | `4bb4cfb` |
| PR6a | Habit cell two-color trick + LaneNode drag rotation | `0bf9d7b` |
| PR7 | CalendarNode/MonthView hide-next-month + green today + today strip | `dc01af5` |
| PR8 | TodoNode overdue badge + row rust dot | `dfc3bba` |
| PR9 | AI Orb SVG glow + mock chat panel | `78577be` |
| PR10 | KRNL0 Crazy vibe (deferred) | — |

## Consequences

- Mother nodes shrink ~26% in height; per-node bodies re-flow in the
  respective PRs. Existing nodes that were drawn taller still render — RF
  only seeds new ones at 440 × 440.
- PomoNode now has variant subcomponents; future timer additions are
  cheap (one new file under `variants/`).
- ClockNode subscribes to `useTick()` — adds 2 Hz re-renders. The node
  already re-rendered on every board mutation, so the addition is small.
- Orb chat panel is a stub. Replacing `mockReply()` with the real brain
  bridge is a one-line change when the boundary lands; the prop-shape
  (string in, string out) is already what the bridge needs.
- No state-shape changes beyond `PomoConfig.face` (optional, defaults
  silently). Existing `board.json` files load unchanged.

## Snapshot tests audit

`tests/` contains zero `toMatchSnapshot` / `toMatchInlineSnapshot` calls
as of 2026-05-15. Visual changes in this refresh do not break frozen DOM
fixtures because we don't keep any. Two assertion-style tests were
updated in PR3 (brand mark structure, statusbar item splits).
