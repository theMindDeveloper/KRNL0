# krnl0 — Visual System

*Source of truth: `FRONTEND REF/LifeOS Whiteboard.html`*

---

## Aesthetic direction

**Anthropic warmth × cyberpunk ASCII** — the native aesthetic is called **cyber**.

Warm paper tones (`#f5f1e8`) as the resting state — calm, analog, archival. Acid green (`#c9f158`) and rust orange (`#c8553d`) as high-signal, high-voltage accents — surgical, intentional. Monospace type as the connective tissue. Block-character ASCII art as the signature.

Not dark-by-default, but dark-by-choice. Both the light and dark variants of **cyber** are the same aesthetic — just different luminosity levels. **Noir** is the only alternate vibe, adding a high-contrast monochrome layer on top.

---

## Themes

### Native theme — cyber

Applied by default (no `data-vibe` attribute). Warm paper tones, acid-green accents, rust signals.

#### Color tokens

| Token | Light (`cyber`) | Dark (`cyber`) | Role |
|---|---|---|---|
| `--paper` | `#ebe1c2` | `#131210` | Canvas background |
| `--paper-2` | `#ddd0a7` | `#1f1d18` | Subtle fills, node body |
| `--paper-3` | `#cbba85` | `#2f2b24` | Borders, dividers |
| `--node-bg` | `#f6efd0` | `#1c1a13` | Node card background |
| `--ink` | `#1a1612` | `#f4efe2` | Primary text |
| `--ink-2` | `#38302a` | `#ddd6c6` | Secondary text — emphasized |
| `--ink-3` | `#554b38` | `#b3aa94` | Secondary text — dim |
| `--ink-4` | `#5f5541` | `#8f8572` | Tertiary text, placeholder |
| `--acid` | `#c9f158` | `#c9f158` | Active connections, terminal cursor, listening |
| `--acid-glow` | `#d8ff6e` | `#d8ff6e` | Hover/focus glow variant of acid |
| `--acid-faint` | `rgba(201, 241, 88, 0.08)` | `rgba(201, 241, 88, 0.08)` | Faint acid wash (selection, hover fills) |
| `--acid-ink` | `#3f5c0a` | `var(--acid)` | Acid used as text on paper (deep green in light mode) |
| `--accent-on-dark` | `#c9f158` | `#c9f158` | Accent on a surface that is dark in every theme (wheels, Orb, terminal badge) |
| `--spine` | `#5e7d1d` | `#7ea22b` | Fixed mother-node accent (deep green) |
| `--spine-hot` | `#7ea22b` | `#a8d244` | Hover/active spine variant |
| `--rust` | `#c8553d` | `#ee8466` | Pomodoro timer, warnings, live indicators |
| `--rust-deep` | `#a83e2a` | `#d05f47` | Deep variant of rust |
| `--plum` | `#6b4ea8` | `#6b4ea8` | Reserved accent |
| `--cyan` | `#22d3ee` | `#22d3ee` | Task-flow edge color |
| `--cyan-glow` | `#67e8f9` | `#67e8f9` | Glow variant of cyan |
| `--purple` | `#a78bfa` | `#a78bfa` | Accent (plum family) |
| `--amber` | `#d9a55a` | `#d9a55a` | Habit colour |
| `--rose` | `#c87080` | `#c87080` | Habit colour |
| `--teal` | `#5fa3a8` | `#5fa3a8` | Habit colour |
| `--lilac` | `#9c8ec4` | `#9c8ec4` | Habit colour |
| `--sand` | `#b8a17a` | `#b8a17a` | Habit colour |
| `--moss` | `#7a8f5a` | `#7a8f5a` | Habit colour |
| `--term-bg` | `#0c0a08` | `#05040a` | Terminal background (always dark) |
| `--term-bg-2` | `#15110d` | `#0a0812` | Terminal header background |
| `--term-fg` | `#d4cfc0` | `#d4cfc0` | Terminal foreground text |
| `--term-dim` | `#6b6354` | `#6b6354` | Terminal dimmed text |
| `--term-acid` | `#c9f158` | `#c9f158` | Terminal accent (cursor, prompt sigil) |
| `--term-rust` | `#e87a5f` | `#e87a5f` | Terminal error / path color |
| `--btn-primary-bg` | `#1a1612` | `var(--acid)` | Primary button fill |
| `--btn-primary-bg-hover` | `#2a261e` | `var(--acid-glow)` | Primary button hover |
| `--btn-primary-fg` | `var(--acid)` | `#1a1612` | Primary button text |
| `--btn-primary-ring` | `rgba(201,241,88,0.45)` | `rgba(201,241,88,0.45)` | Primary button focus ring |
| `--ink-on-bright` | `#0a0908` | `#0a0908` | Text / glyphs on an --acid fill |

_Generated from `src/renderer/styles/tokens.css` (`:root` / `[data-theme="dark"]`). Frame styles (ADR 0009, `themes/manifests.ts`) override these per style; the accent pairs below are what keeps every style readable._

`--acid` is invariant across light and dark in the native style. Frame styles may change it (Macintosh light makes it near-black), so never pair it with a fixed colour — use the pairs below.

#### Accent pairs — which token goes on which surface

| Surface | Fill | Text / glyph on it |
|---|---|---|
| Primary button | `--btn-primary-bg` | `--btn-primary-fg` |
| An `--acid` fill (badge, checked box, switch knob) | `--acid` | `--ink-on-bright` |
| Accent text on paper / a node card | — | `--acid-ink` |
| A surface that is dark in every theme (pie menu, pen wheel, Orb, Commander, terminal) | `--accent-on-dark` (active) | `#0e1012` on the accent; `#d4cfc0` / `#8a8270` (= `--term-fg` / `--term-dim`) for body text |
| Danger text / outline (delete, unplan, factory reset) | — | `--rust` (never a hard-coded red) |

`themeContrast.test.ts` checks the pairs in every frame style.

#### Shared components

Use these instead of hand-rolling (all in `src/renderer/components/ui/`):

| Need | Component |
|---|---|
| Dropdown | `AppSelect` (never a native `<select>`) |
| Time input | `TimeField` (never `<input type="time">`); `onEnter` / `onEscape` for host forms |
| Floating menu / picker | `Popover` (Escape closes it; a field marked `data-own-escape` handles Escape itself) |
| On/off toggle | `Switch` / `SwitchVisual` |
| Close a dialog / popup / panel | `CloseButton` (`tone="dark"` on always-dark panels) |
| Stacking order of anything floating | `Z` from `ui/layers.ts` — chrome < widget < dialog < commander < nodeMenu < popup < layerMenu < notice < radial < modal < popover < contextMenu < topmost. Pick a named layer, never a new number |

Active items show a filled / tinted background or a coloured icon — never a left-edge accent bar.

`--term-bg` is always dark regardless of the host theme. The terminal is a portal to another layer.

#### Grid tokens

| Token | Light | Dark |
|---|---|---|
| `--grid` | `rgba(26, 24, 20, 0.06)` | `rgba(240, 235, 221, 0.05)` |
| `--grid-strong` | `rgba(26, 24, 20, 0.12)` | `rgba(240, 235, 221, 0.10)` |

Canvas grid: `radial-gradient` dots at `32px` (minor) and `160px` (major) intervals.

#### Geometry tokens

| Token | Value | Role |
|---|---|---|
| `--radius` | `6px` | Button, small element radius |
| `--radius-lg` | `10px` | Node card radius |

#### Shadow tokens

| Token | Value | Role |
|---|---|---|
| `--shadow-1` | `0 1px 0 rgba(26,24,20,.04), 0 2px 6px rgba(26,24,20,.06)` | Resting node elevation |
| `--shadow-2` | `0 2px 0 rgba(26,24,20,.04), 0 8px 24px rgba(26,24,20,.10)` | Hover/selected elevation |
| `--shadow-glow` | `0 0 0 1px var(--acid), 0 0 24px rgba(201,241,88,.25)` | Terminal focus glow |

---

### Additional theme — noir

Applied with `data-vibe="noir"`. High-contrast monochrome. No neon — the accent is near-white. Zero border-radius. All-caps everywhere.

#### Color tokens

| Token | Light (`noir`) | Dark (`noir`) | Role |
|---|---|---|---|
| `--paper` | `#ebe9e4` | `#0a0a0a` | Canvas background |
| `--paper-2` | `#d8d6d0` | `#161616` | Subtle fills |
| `--paper-3` | `#b4b2ac` | `#2c2c2c` | Borders, dividers |
| `--ink` | `#0a0a0a` | `#fafaf6` | Primary text |
| `--ink-2` | `#1d1d1d` | `#d4d4d0` | Secondary text — emphasized |
| `--ink-3` | `#555555` | `#888888` | Secondary text — dim |
| `--ink-4` | `#888888` | `#555555` | Tertiary text |
| `--node-bg` | `#f6f5f1` | `#131313` | Node card background |
| `--rust` | `#0a0a0a` | `#fafaf6` | Replaces rust — same as ink (monochrome) |
| `--acid` | `#fafaf6` | `#fafaf6` | Replaces acid — near-white signal |
| `--acid-glow` | `#ffffff` | `#ffffff` | White glow |
| `--grid` | `rgba(0,0,0,0.05)` | — | Grid overlay |
| `--grid-strong` | `rgba(0,0,0,0.10)` | — | Grid strong |

#### Noir behavioral overrides

These override visual rules that depend on color cues, replacing them with geometry/weight:

| Element | Cyber | Noir |
|---|---|---|
| Node border-radius | `--radius-lg` (10px) | `0` — sharp corners |
| Button border-radius | `5px` | `0` |
| Node headers | letter-spacing 0.04em | letter-spacing 0.18em |
| Pomodoro ring progress | `--rust` stroke | `--ink` stroke, no drop-shadow |
| Pomodoro fill color | `--spine-hot` / `--acid` | `--ink` only |
| Pomo meniscus line | visible | hidden |
| Connection paths | `--ink-3` | `--ink` |
| Task-flow edges | `--cyan` | `--ink`, no drop-shadow |
| AI orb | acid-green glow | no glow (box-shadow only) |
| Brand mark | rounded 3px, dashed outline | 0px radius, no outline |

---

## Typography

| Variable | Value | Where |
|---|---|---|
| `--font-mono` | `'JetBrains Mono', ui-monospace, monospace` | Node headers, terminal, topbar, status bar, `sys` CLI |
| `--font-sans` | `'Geist', ui-sans-serif, system-ui, sans-serif` | Body — todo items, habit names, general UI |
| `--font-serif` | `'Instrument Serif', Georgia, serif` | Text/prose nodes (child node type) |

### Type scale

| Element | Size | Weight | Font | Case |
|---|---|---|---|---|
| Node header | 10.5px | 500 | mono | UPPER |
| Topbar brand | 12.5px | 600 | mono | UPPER |
| Buttons | 11px | 400 | mono | lower |
| Status bar | 10.5px | 400 | mono | — |
| Body text (todos, habits) | 13–14px | 400 | sans | — |
| Pomodoro clock (default) | 64px | 300 | mono | — |
| Terminal body | 11.5px | 400 | mono | — |

### Rules

- Node headers are **always monospace, always uppercase, always `--ink-3`**. No exceptions.
- No system fonts — all three families are loaded from Google Fonts (or bundled subset).
- `JetBrains Mono` carries `font-variant-numeric: tabular-nums` on timers.

---

## Layout & grid

- **Canvas grid:** `32px` minor (radial dot), `160px` major (radial dot, stronger opacity).
- **App chrome heights:** topbar 44px, status bar 28px, dock button 36×36px.
- **Node widths (from reference):**

| Node | Width |
|---|---|
| Pomodoro (mother) | 240px |
| Habit (mother) | 320px |
| Todo (mother) | 300px (fixed strip) |
| Terminal (mother) | 460px |
| Task (child) | 220px |
| Text (child) | 260px |
| Image (child) | 240px |

- **Fixed mother positions (canvas coordinates):**

| Mother | `kind` | `x` | `y` |
|---|---|---|---|
| Todos | `todo` | `-480` | `0` |
| Pomodoro | `pomo` | `0` | `0` |
| Habits | `habit` | `480` | `0` |
| Terminal | `term` | `0` | `320` |

Camera centers on `(0, 160)` at startup — all four are visible.

---

## Component — Node anatomy

### Mother nodes (fixed)

- `border: 1px solid var(--paper-3)`, `border-radius: 6px`
- Background: `var(--node-bg)`
- Shadow: `0 8px 24px rgba(26,24,20,0.08)`
- Corner brackets (`.fixed-corners`) visible at `opacity: 0.35`, brighten on hover/select
- Slot tag above node: monospace, 9px, uppercase — shows node role
- Reorder arrows (`‹ ›`) appear on hover for swapping spine order
- **No drag ports** (`.node.fixed .port { display: none }`)
- **No resize handle** (`.node.fixed .resize-handle { display: none }`)
- Cursor: `default` — cannot be moved

### Child nodes (free)

```
┌─────────────────────────────┐
│ ● TITLE  kind.tag         × │  ← mono, 10.5px, uppercase, --ink-3
├─────────────────────────────┤
│                             │
│ node body                   │
│                             │
└─────────────────────────────┘
●                             ●  ← port.left / port.right (12px circles)
```

- Ports: `12px` circle, `--ink-3` border, hover → acid-green fill + 1.3× scale + acid ring
- Header: `7px 10px 6px` padding, drag handle, `cursor: grab`
- Node actions (close ×, more ⋯) hidden at rest, appear on hover

---

## Component — Connection edges

| Edge type | Stroke | Style | Animation |
|---|---|---|---|
| Inactive | `--ink-3` | `stroke-dasharray: 4 3`, `opacity: 0.6` | None |
| Active (triggered) | `--spine` (light) / `--acid` (dark) | Solid | 600ms glow fade |
| Pending (drawing) | `--rust` | `dasharray: 6 4` | None |
| Task-flow | `--cyan` | `width: 3`, `dasharray: 14 8` | Marching ants 1.6s |
| Pomo edge | `--rust` | `width: 1.4`, `dasharray: 3 4` | None |

Active edges: `filter: drop-shadow(0 0 5px rgba(94,125,29,.45))` (light), `drop-shadow(0 0 5px rgba(201,241,88,.7))` (dark).

---

## Component — AI Blob (orb)

Fixed position, not on canvas: `position: fixed; left: 22px; bottom: 56px`.

| State | Filter | Animation |
|---|---|---|
| Idle | `drop-shadow(0 0 18px rgba(201,241,88,.55))` + 40px soft glow | `ai-float` 6s ease infinite (translate ±6px, rotate ±2°) |
| Listening | `drop-shadow(0 0 28px rgba(201,241,88,1))` + 70px glow | Swirl rings pulse |
| Thinking | `drop-shadow(0 0 24px rgba(180,140,240,.9))` (purple) | Swirl `animation-duration: 1.8s` |
| Speaking | — | Rings expand outward (`ai-ring` keyframes) |

Panel (when open): `background: rgba(14,13,11,0.94)`, `border: 1px solid rgba(201,241,88,.22)`, 340px wide, `border-radius: 14px`.

---

## Component — Terminal node

Terminal is always dark regardless of host theme.

- Background: `var(--term-bg)` / header: `var(--term-bg-2)`
- Border at rest: `#2a241c`; hover: `var(--acid)` + `shadow-glow`
- Cursor: 7×13px block, `background: var(--acid)`, `blink 1.05s steps(2) infinite`
- Prompt sigil: `var(--term-acid)`; path: `var(--term-rust)`
- Boot ASCII art: `color: var(--term-acid)`, `text-shadow: 0 0 6px rgba(201,241,88,.4)`

---

## Density modifiers

Applied as `data-density` on `<html>` (or canvas root). Affects padding and font sizes only — not color.

| Element | compact | default | spacious |
|---|---|---|---|
| Pomodoro ring | 188×188px | 220×220px | 240×240px |
| Pomodoro clock | 54px | 64px | 72px |
| Node body padding | 10px 12px | 14px 16px | 18px 20px |
| Todo/Habit rows | 4px vertical | 6px | 9px |
| Terminal font | 11px | 11.5px | 13px |

---

## Accessibility

| Mechanism | Behavior |
|---|---|
| `@media (prefers-reduced-motion)` | Disables orb float, edge pulses, pomo ring transitions, spawn animations |
| `data-motion="reduced"` | Same as above, user-controlled toggle |
| `[data-contrast="high"]` | Boosts ink/paper delta — deeper darks, higher whites |

Color is never the **only** signal. Every state change has a shape or label alongside the color change (e.g. active edges go solid *and* glow; completed todos get strikethrough *and* dim; pomo state changes show a text label in the status bar).

---

## ASCII as identity

Block characters (`█`, `▀`, `▄`, `▙`, `▟`) appear in:
- Product logo (acid green, 8px mono, terminal boot art)
- Terminal node boot screen (`▙ krnl0 v0.1.0`)
- Mother node fixed-slot tag prefix

Not decoration. Deliberate statement: *the terminal is foundational*.

---

## Rule — text never touches an edge

No text in the app may touch or cross the edge of the shape it sits in: a chart slice, the donut hole, a bar, a plot gutter, a pill or a card.

- **Charts (SVG).** Size every label with the helpers in `src/renderer/analytics/charts/common.ts`:
  - `fitArcLabel` is for donut and pie slices.
  - `fitCircleLabel` is for the text in the donut hole.
  - `textWidth` + `TEXT_INSET` size axis gutters.

  Each label keeps `TEXT_INSET` (3 px) of clearance on every side, which also covers the dark text halo. If a label doesn't fit, shrink it down to `MIN_LABEL_FONT` (8 px). If it still doesn't fit, don't draw it. The legend or tooltip already carries the value. Never place a label at a fixed spot or behind a fixed `pct >= N` check.
- **HTML.** Any text box that can get long needs `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` plus a max width (see the Todo tag pill), or it must wrap. Padding is never zero on a bordered container.
- **Enforced by** `tests/unit/renderer/analytics.textContainment.test.tsx`. It checks 3,000 random slice layouts plus rendered donuts, and fails if any label's box leaves its slice. New chart types add a case there.
