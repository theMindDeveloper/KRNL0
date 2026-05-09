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
| `--paper` | `#f5f1e8` | `#0e0d0b` | Canvas background |
| `--paper-2` | `#ede7d6` | `#1a1814` | Subtle fills, node body |
| `--paper-3` | `#e3dcc7` | `#2a2620` | Borders, dividers |
| `--ink` | `#1a1814` | `#f0ebdd` | Primary text |
| `--ink-2` | `#3d362b` | `#d4cfc0` | Secondary text — emphasized |
| `--ink-3` | `#6b6354` | `#8a8270` | Secondary text — dim |
| `--ink-4` | `#9a9180` | `#5a5244` | Tertiary text, placeholder |
| `--acid` | `#c9f158` | `#c9f158` | Active connections, terminal cursor, listening |
| `--acid-glow` | `#d8ff6e` | `#d8ff6e` | Hover/focus glow variant of acid |
| `--spine` | `#5e7d1d` | `#6e8f25` | Fixed mother-node accent (deep green) |
| `--spine-hot` | `#7ea22b` | `#9ac33c` | Hover/active spine variant |
| `--rust` | `#c8553d` | `#e87a5f` | Pomodoro timer, warnings, live indicators |
| `--rust-deep` | `#a83e2a` | `#c8553d` | Deep variant of rust |
| `--plum` | `#6b4ea8` | `#6b4ea8` | Reserved accent |
| `--cyan` | `#4ea8b0` | `#4ea8b0` | Task-flow edge color |
| `--node-bg` | `#fdfaf2` | `#18160f` | Node card background |
| `--term-bg` | `#0c0a08` | `#05040a` | Terminal background (always dark) |
| `--term-bg-2` | `#15110d` | `#0a0812` | Terminal header background |
| `--term-fg` | `#d4cfc0` | `#d4cfc0` | Terminal foreground text |
| `--term-dim` | `#6b6354` | `#6b6354` | Terminal dimmed text |
| `--term-acid` | `#c9f158` | `#c9f158` | Terminal accent (cursor, prompt sigil) |
| `--term-rust` | `#e87a5f` | `#e87a5f` | Terminal error / path color |

`--acid` is invariant across light and dark. It's a signal, not a shade — constant, high-voltage.

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
