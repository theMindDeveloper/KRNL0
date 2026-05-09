*v0.4.2 · April 26, 2026*

---

## What it is

**krnl0** is an infinite whiteboard OS for your life.

It merges four tools that productive people keep open in separate windows — a Pomodoro timer, a habit tracker, a to-do list, and a terminal — into one connected, programmable canvas. Nodes talk to each other. When the Pomodoro starts, the first open task highlights. When a habit streak breaks, the terminal can log it. Every widget is a node; every node can be wired to another.

The canvas is the operating system. The terminal is the power layer. Claude Code is the AI that wires it all together.

---

## Core concepts

| Concept | Description |
|---|---|
| **Nodes** | Self-contained widgets: Pomodoro, Habit grid, Todo list, Text note, Image (ASCII), Terminal |
| **Edges** | Directed connections between nodes — data flows, triggers, visual relations |
| **Boards** | Named workspaces (`deep-work`, `morning-routine`, `project-x`) — infinite canvases |
| **The Terminal** | First-class node. Run `claude "..."` to wire, configure, or automate any node via natural language |
| **krnl0** | The product name + the philosophy: your life as an intentionally designed system |

---

## Philosophy

> *Less doing, more shaping. Make the loops cleaner — then everything downstream gets easier.*

krnl0 is built on three convictions:

1. **Visible systems beat invisible ones.** When your habits, focus sessions, and tasks share a canvas, you see how they relate. Friction becomes visible. Flow becomes designable.

2. **The terminal belongs in productivity.** Power users live in their shells. Org-mode, vim, tmux — these aren't legacy tools; they're precision instruments. krnl0 gives the terminal a home on the canvas, first-class, not an afterthought.

3. **AI should wire, not replace.** Claude Code doesn't do your work. It connects your nodes, scaffolds your setup, and lets you describe automation in plain English. You stay in control.

---

## Design language

### Aesthetic direction
**Anthropic warmth × cyberpunk ASCII**

Warm paper tones (`#f5f1e8`, `#ede7d6`) as the resting state — calm, analog, archival. Acid green (`#c9f158`) and rust orange (`#c8553d`) as high-signal accents — surgical, intentional. Monospace type as the connective tissue. Block-character ASCII art as the aesthetic signature.

Not dark-by-default, but dark-by-choice. Both themes are deliberate.

### Color tokens

| Token | Light | Dark | Role |
|---|---|---|---|
| `--paper` | `#f5f1e8` | `#0e0d0b` | Canvas background |
| `--paper-2` | `#ede7d6` | `#1a1814` | Subtle fills |
| `--paper-3` | `#e3dcc7` | `#2a2620` | Borders, dividers |
| `--ink` | `#1a1814` | `#f0ebdd` | Primary text |
| `--ink-3` | `#6b6354` | `#8a8270` | Secondary text |
| `--acid` | `#c9f158` | `#c9f158` | Primary accent, terminal, active connections |
| `--rust` | `#c8553d` | `#e87a5f` | Pomodoro, warnings, live indicators |
| `--term-bg` | `#0c0a08` | `#05040a` | Terminal node background (always dark) |

### Typography

| Role | Font | Usage |
|---|---|---|
| UI chrome, labels, code | `JetBrains Mono` | Topbar, node headers, status bar, terminal |
| Body copy, notes | `Geist` | Todo items, habit names, general UI |
| Prose nodes | `Instrument Serif` | Text nodes — editorial, large, readable |

### Layout principles
- **Monospace grid.** The canvas dot grid aligns to `32px` minor / `160px` major.
- **Signal over decoration.** No gradients. No drop shadows as decoration. Shadows only for elevation.
- **Node headers are always monospace, always uppercase, always dim.** Nodes announce their type quietly.
- **Active connections glow.** Acid green, no dash, drop shadow — this is the only animated chrome.
- **The terminal is always dark.** Even in light mode. It's a portal to another layer.

### Node anatomy
┌─────────────────────────────┐ │ ● TITLE kind.tag × │ ← monospace header, drag handle ├─────────────────────────────┤ │ │ │ node body │ ← widget-specific UI │ │ └─────────────────────────────┘ ● ● ← connection ports (left / right)

### ASCII as identity
Block characters (`█`, `▀`, `▄`, `▙`, `▟`) are used for the product logo and terminal art — not as decoration but as a deliberate aesthetic statement: *the terminal is foundational*. The logo appears in the terminal node on boot, acid green, with a subtle glow.

---

## Node specifications

### Pomodoro (`pomo.025`)
- 25-minute countdown, monospace tabular numerals
- Progress bar in rust
- Session counter (N / 4)
- START / PAUSE / RESET controls
- Emits: `onStart`, `onComplete`, `onBreak` events (connectable to other nodes)

### Habit Tracker (`hbt.week`)
- 7-day rolling grid per habit
- Click to toggle a day done/undone
- Streak counter
- Today column highlighted with rust border

### Todo List (`td.list`)
- Checkable items with tag labels (`work`, `life`, `home`, `read`)
- Strikethrough + dim on complete
- Acid checkmark on done state
- Named boards (e.g. "Today", "This Week")

### Text Note (`txt`)
- Instrument Serif, 18px, editorial
- Transparent / dashed border at rest, solid on hover
- No toolbar — just write

### Image / ASCII (`img.ascii`)
- Placeholder for real images or ASCII art
- Always dark background regardless of theme
- Caption with filename + dimensions

### Terminal (`claude-code · zsh`)
- Always dark, monochrome + acid/rust accents
- Three-light macOS-style titlebar
- Command history, scrollable
- Built-in commands: `help`, `ls`, `clear`, `claude <msg>`, `vim <file>`, `emacs <file>`
- `claude` prefix pipes to Claude Code — returns structured output in-terminal
- `● LIVE` badge when Claude is attached

---

## Interaction model

| Action | Input |
|---|---|
| Pan canvas | Drag empty space |
| Zoom | ⌘/Ctrl + scroll |
| Add node | Left dock icons |
| Move node | Drag node header |
| Connect nodes | Drag from `●` port to another node |
| Select node | Click node body |
| Delete node | Node header `×` button |
| Fit board | `SHIFT+F` or FIT button |
| Toggle theme | `☀/☾` button in topbar |
| Open tweaks | TWEAKS button |

---

## Roadmap (not built yet)

- [ ] Real Claude Code integration via WebSocket
- [ ] Board persistence (localStorage → sync → cloud)
- [ ] Custom node types (via terminal: `sys node create --kind "standup"`)
- [ ] Multiplayer / shared boards
- [ ] Mobile companion (read-only + quick-add)
- [ ] Plugin API — import any CLI tool as a node
- [ ] vim/emacs org-mode embedded editor (real, not simulated)
- [ ] Export board as PDF / PNG / Markdown

---

*Built with React + JetBrains Mono + block characters and a lot of conviction.*