# THE SYSTEM — Visual System

*Extracted from PRD v0.6.0 §11*

---

## Aesthetic direction

**Anthropic warmth × cyberpunk ASCII**

Warm paper tones as the resting state — calm, analog, archival. Acid green and rust orange as high-signal accents — surgical, intentional. Monospace type as the connective tissue. Block-character ASCII art as the aesthetic signature.

Not dark-by-default, but dark-by-choice. Both themes are deliberate.

---

## Color tokens

| Token | Light | Dark | Role |
|---|---|---|---|
| `--paper` | `#f5f1e8` | `#0e0d0b` | Canvas background |
| `--paper-2` | `#ede7d6` | `#1a1814` | Subtle fills, node body |
| `--paper-3` | `#e3dcc7` | `#2a2620` | Borders, dividers |
| `--ink` | `#1a1814` | `#f0ebdd` | Primary text |
| `--ink-3` | `#6b6354` | `#8a8270` | Secondary text |
| `--acid` | `#c9f158` | `#c9f158` | Active connections, terminal accent, voice "listening" |
| `--rust` | `#c8553d` | `#e87a5f` | Pomodoro, warnings, orb "thinking" |
| `--term-bg` | `#0c0a08` | `#05040a` | Terminal — always dark in both themes |

`--acid` is the same in both themes. It's not a semantic color — it's a signal. High-voltage. Constant.

---

## Typography

| Role | Font | Where |
|---|---|---|
| Chrome, code, headers | `JetBrains Mono` | Node headers, terminal, status, topbar |
| Body | `Geist` | Todo items, habit names, general UI |
| Prose | `Instrument Serif` | Journal node (v1.5), large readable text |

### Rules
- Headers are **always monospace, always uppercase, always dim (`--ink-3`)**.
- Body text is Geist at 14–16px.
- No system fonts. These three are shipped with the app (subset, ~50KB each).

---

## Layout principles

1. **Monospace grid.** Canvas dot grid: `32px` minor / `160px` major. All node sizes snap to this grid.
2. **Signal over decoration.** No gradients. No glassmorphism. No emoji icons. Decoration is noise.
3. **Headers monospace, uppercase, dim.** No exceptions. Nodes announce their type quietly.
4. **Only active connections animate.** Acid-green pulse, ~600ms. Everything else: still.
5. **Terminal always dark.** Both themes. It's a portal to another layer — it should look like one.

---

## Node anatomy

### Mother nodes (anchored)
Larger than children. Pinned-corner glyph (`▙`) in the header indicates they cannot be moved. No `×` delete button — settings gear instead. At far zoom-out they remain labeled blocks.

### Child nodes (free)

```
┌─────────────────────────────┐
│ ● TITLE  kind.tag         × │  ← monospace, uppercase, dim
├─────────────────────────────┤
│                             │
│ node body                   │
│                             │
└─────────────────────────────┘
●                             ●  ← input port (left), output port (right)
```

Spawn near their mother. Animate into position once on creation (200ms ease-out). Then still.

---

## The orb

Fixed in viewport (not on canvas). Bottom-right. 56px circle.

| State | Appearance |
|---|---|
| Idle | Acid-green dot inside `--paper-2` circle. Breathing animation, 3s cycle. |
| Listening | Solid acid-green fill. Waveform ring driven by mic level. |
| Thinking | Rust dot. Faster pulse. While waiting on the brain. |
| Speaking | Acid-green ring expanding outward. While TTS plays. |

Push-to-talk on `Space`. Caption above orb: live transcript while listening, `…` while thinking, reply on completion (5s, fades).

---

## ASCII as identity

Block characters (`█`, `▀`, `▄`, `▙`, `▟`) appear in:
- Product logo (acid green, terminal boot screen)
- Mother node headers (pinned-corner glyph `▙`)
- Terminal node art on startup

Not decoration — deliberate aesthetic statement: *the terminal is foundational*.

---

## Accessibility variants

| Setting | Effect |
|---|---|
| Reduced motion | Disables orb breathing, edge pulses, spawn animation. All state changes instant. |
| High contrast | `--high-contrast` variant — boosts ink/paper delta significantly. |
| Font scaling | All sizes from CSS variables — user can scale without breaking layout. |

Color is never the **only** signal. Every state change has a shape or text component alongside the color change.
