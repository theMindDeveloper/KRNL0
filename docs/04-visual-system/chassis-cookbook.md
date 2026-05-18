# Chassis Cookbook — the DOCK_REGISTRY engine

> *A field manual for the dock-frame system: what `DOCK_REGISTRY` accepts, how
> Canvas Mode and Station Mode consume it, and how to add a new chassis
> without touching nine files.*
>
> **Scope.** `src/renderer/components/ChassisLayer/dockRegistry.tsx`
> **Pairs with.** [ADR 0008 — Station Mode](../03-adr/0008-station-mode-layout-toggle.md) · [Design Tokens](design-tokens.md)
> **Status.** Locked engine — `refactor(chassis): introduce DOCK_REGISTRY as
> single source of truth for dock frames` (post v0.8.6).

---

## ▌ TL;DR

`DOCK_REGISTRY` is a **theme acceptor**. You hand it one config object
(`DockStyleDef`); it answers every question the rest of the app could ask
about that look — what label to show in the picker, what SVG glyph to draw,
what padding the station shell reserves, where the canvas-mode chrome rect
sits in flow-space, whether the topbar should suppress the light/dark toggle.

```
                 ┌──────────────────────────────┐
                 │     DOCK_REGISTRY[style]     │
                 │      ← single source         │
                 └──────────────┬───────────────┘
        ┌───────────┬───────────┴───────────┬────────────┐
        ▼           ▼                       ▼            ▼
   CanvasChassis  StationLayout         Dock picker    TopBar
   (flow-space     (screen-space         (label /       (dark-only
    chrome rect)    padding + chrome)     sublabel /     gate)
                                          glyph)
```

No per-style switch statements live downstream. The registry is the engine.

---

## ▌ 1. The contract — what the registry accepts

```ts
export interface DockStyleDef {
  id:              string;                    // stable key (also the data-dock attribute)
  label:           string;                    // shown in the dock picker tile
  sublabel:        string;                    // small caption under the label
  glyph:           ReactNode;                 // 24×24 viewBox SVG, currentColor stroke
  Chrome?:         React.ComponentType;       // shared canvas + station chrome
  canvasBounds?:   DockCanvasBounds;          // required iff Chrome is set
  stationPadding:  { top: number; bottom: number };
  theme?:          'dark-only';               // optional global theme constraint
}

type DockCanvasBounds =
  | { kind: 'static';      rect: { left: number; top: number; width: number; height: number } }
  | { kind: 'fit-mothers'; topOffset: number; height: number; sidePad: number; minWidth: number };
```

### Field-by-field reference

| Field | Required | Read by | Meaning |
|---|:---:|---|---|
| `id` | ✓ | everywhere | Literal narrowed into `DockStyle`. Also written as `<html data-dock="…">` so `chassis.css` selectors fire. The single exception `classic` removes the attribute. |
| `label` | ✓ | Dock picker | Tile heading. Title-case. |
| `sublabel` | ✓ | Dock picker | One-line descriptor — `"Eurorack panel"`, `"Mission control"`, `"Rack chassis"`. |
| `glyph` | ✓ | Dock picker | Compact SVG used as the picker tile icon. Always `width="22" height="22" viewBox="0 0 24 24"` with `stroke="currentColor"` so the topbar theme paints it. |
| `Chrome` | ◌ | `CanvasChassis`, `StationLayout` | The decorative React component shared by both modes. **Omit for chromeless styles** (`classic`). |
| `canvasBounds` | ◌* | `CanvasChassis` | *Required when `Chrome` is set.* Tells `CanvasChassis` where to place the chrome rect in React-Flow flow-space. Two shapes (see § 2). |
| `stationPadding` | ✓ | `StationLayout` | Pixels reserved at the top/bottom of the station shell so the chrome rails don't overlap the panels. `{ top: 0, bottom: 0 }` for chromeless. |
| `theme` | ◌ | `TopBar` | `'dark-only'` instructs `TopBar` to hide the theme toggle and force `data-theme="dark"` while this style is active. Used by `krnl-dock`. |

> **Why** `id` doubles as the `data-dock` attribute: CSS scoping. Every
> chassis-specific rule lives under `.dock-chassis.dock-<id>` in
> `src/renderer/styles/chassis.css`. The registry id and the CSS selector
> are the same string — rename one and you rename both.

---

## ▌ 2. Sizing the canvas-mode chrome — `DockCanvasBounds`

Two variants, picked by `kind`. Both live in **React-Flow flow-space**, so
they pan/zoom with the canvas.

### `static`

```ts
canvasBounds: { kind: 'static', rect: { left: -1410, top: -50, width: 3360, height: 678 } }
```

A fixed rectangle in flow-space. Use when the chrome is meant to look like
a wide instrument that frames the mother row from constant world coords —
the synth/telemetry approach.

### `fit-mothers`

```ts
canvasBounds: { kind: 'fit-mothers', topOffset: -102, height: 744, sidePad: 10, minWidth: 600 }
```

The chrome rectangle hugs the live x-span of the visible mother nodes.
`CanvasChassis` subscribes to mother positions and animates `transform` /
`width` on a 320 ms cubic-bezier transition when the row resizes. Use this
when the chrome is meant to read as a *rack* that grows and shrinks with the
hardware mounted inside it — the krnl-dock approach.

| Param | Meaning |
|---|---|
| `topOffset` | Y position in flow-space relative to the mother row baseline |
| `height` | Total chrome rect height |
| `sidePad` | Horizontal padding added to both edges of the mother x-span |
| `minWidth` | Floor used when no mothers are present (empty board) |

---

## ▌ 3. Chassis catalogue — current entries

Four entries ship today. Each one is a single object literal in
`DOCK_REGISTRY`. The visual identity of every variant fits on one sheet.

### ▶ classic ▏ *the bare paper*

```
╴ no chrome ╶ ╴ paper underneath ╶ ╴ stationPadding 0/0 ╶
```

| Spec | Value |
|---|---|
| `id` | `'classic'` |
| `label` / `sublabel` | `Classic` / `Default frame` |
| `Chrome` | — (chromeless) |
| `canvasBounds` | — |
| `stationPadding` | `{ top: 0, bottom: 0 }` |
| `theme` | — |
| Glyph | rectangle with two faint horizontal rules |

Use case: no decoration. Both modes render against the raw paper background.
Treated as the default for new boards.

---

### ▶ synthesizer ▏ *the eurorack panel*

```
▣ ◯ ◯ ◯ ▣   ◯ ◯ ◯   ▣ ◯ ◯ ◯ ▣      static rect: 3360×678 around the row
─────────────────────────────────
```

| Spec | Value |
|---|---|
| `id` | `'synthesizer'` |
| `label` / `sublabel` | `Synthesizer` / `Eurorack panel` |
| `Chrome` | `SynthesizerChrome` |
| `canvasBounds` | `static` · `{ left: -1410, top: -50, width: 3360, height: 678 }` |
| `stationPadding` | `{ top: 50, bottom: 88 }` |
| `theme` | — (light + dark both ship) |
| Glyph | rect with three centred knob discs |

Use case: knob-and-rail aesthetic. Heavy decorative SVG, three patch-bay
rows, screw rivets.

---

### ▶ telemetry ▏ *mission control*

```
╔ MISSION CLOCK ── SIGNAL ───── DOWNLINK ╗   static rect: 3360×686
╚ CARRIER · SYS PRESSURE · AOS / LOS ════╝
```

| Spec | Value |
|---|---|
| `id` | `'telemetry'` |
| `label` / `sublabel` | `Telemetry` / `Mission control` |
| `Chrome` | `TelemetryChrome` |
| `canvasBounds` | `static` · `{ left: -1410, top: -76, width: 3360, height: 686 }` |
| `stationPadding` | `{ top: 76, bottom: 70 }` |
| `theme` | — |
| Glyph | rect with a small signal-waveform path |

Use case: instrument-panel readout. Wired to live board state — mission
clock, signal waveform from the event log, carrier MHz from nodes·edges,
sys pressure from completion ratio, downlink from best habit streak,
AOS/LOS, transmission log strip.

---

### ▶ krnl-dock ▏ *rack chassis · dark-only*

```
┃ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ┃    fit-mothers · hugs the row
┃ ░░░░░░░  modular rails  ░ ┃    minWidth 600 · sidePad 10
```

| Spec | Value |
|---|---|
| `id` | `'krnl-dock'` |
| `label` / `sublabel` | `KRNL Dock` / `Rack chassis` |
| `Chrome` | `KrnlDockChrome` |
| `canvasBounds` | `fit-mothers` · `{ topOffset: -102, height: 744, sidePad: 10, minWidth: 600 }` |
| `stationPadding` | `{ top: 102, bottom: 102 }` |
| `theme` | `'dark-only'` ← topbar hides the theme toggle |
| Glyph | rect with two horizontal rails and rivet dots |

Use case: full 19" rack metaphor. The chrome resizes with the mother row.
Forces dark theme because the rail materials only render correctly on the
dark paper.

---

## ▌ 4. How the engine routes a style

```
┌──────────── pick a style ──────────────────────────────────────┐
│   useDockStyle()                                               │
│     ├── reads localStorage['krnl0-dock-style']                 │
│     ├── writes <html data-dock="…"> for CSS scoping            │
│     └── notifies subscribers (shared module state)             │
└────────────────────────────┬───────────────────────────────────┘
                             │
        ┌────────────────────┴────────────────────┐
        ▼                                         ▼
   layoutMode === 'canvas'                   layoutMode === 'station'
        │                                         │
        ▼                                         ▼
   <CanvasChassis dockStyle={s}/>           <StationLayout />
        │                                         │
        ├─ def = DOCK_REGISTRY[s]                 ├─ def = DOCK_REGISTRY[s]
        ├─ if (!def.Chrome) return null           ├─ shell wraps content in
        ├─ resolve bounds via                     │   <div class="dock-chassis dock-{id}">
        │    canvasBounds.kind                    ├─ reserves def.stationPadding
        │      ('static' | 'fit-mothers')         │   top/bottom of the shell
        ├─ mount inside <ViewportPortal>          ├─ renders <def.Chrome /> inside
        │   so it pans/zooms with the canvas      │   that wrapper, screen-anchored
        └─ render <def.Chrome />                  └─ canvas is one panel cell
```

**Theme gate (orthogonal axis).** `TopBar` reads
`isDarkOnly(currentStyle)` from the registry. If true, the theme pill is
hidden and `data-theme` is forced to `dark`. The user's previous theme
choice is restored once they switch back to a style without `theme:
'dark-only'`.

**CSS scoping.** Both modes wrap their chrome container in
`.dock-chassis.dock-<id>`. Decorative CSS lives in
`src/renderer/styles/chassis.css`. Station-specific overrides go under
`.dock-chassis.dock-<id>[data-station]`. The wrapper attribute is the only
contract — the styles file owns the visual detail.

---

## ▌ 5. The four-slot CSS contract — `defineDockTheme()`

Every dock skin paints **four regions**, and the modular `defineDockTheme()`
function in [dockTheme.ts](../../src/renderer/styles/dockTheme.ts) takes
exactly that — four named CSS slots — for every new dock. The function is
the contract; satisfying it guarantees a coherent skin.

```ts
// src/renderer/styles/dockTheme.ts
export interface DockThemeCss {
  canvas:  string;  // the infinite paper — .react-flow root, --grid, body bg
  chrome:  string;  // the chassis frame around the mother row
  nodes:   string;  // the per-mother palette — --paper, --ink, --acid, etc.
  toolbar: string;  // the Station-mode PANELS chip-strip (`[data-testid="station-toolbar"]`)
}

export function defineDockTheme(
  meta: { id: string; label?: string },
  css:  DockThemeCss,
): string;
```

```
┌─────────── one dock skin = four CSS slots ──────────────┐
│                                                          │
│   canvas      The page / .react-flow background.         │
│               Re-skins paper, RF dot colours, gradients, │
│               grid overlays, vignettes. This is the      │
│               "what the user pans across" surface.       │
│                                                          │
│   chrome      The decorative chassis around the mother   │
│               row. Knobs, rivets, screens, plaques.      │
│                                                          │
│   nodes       The mother-frame CSS-variable cascade.     │
│               Re-declares --paper, --ink, --acid,        │
│               --spine, --rust, --node-bg so every node   │
│               component inside repaints automatically.   │
│                                                          │
│   toolbar     The Station-mode PANELS chip-strip at the  │
│               top of the shell. Restyles the bar's       │
│               background, chip colours, hover/active     │
│               states; can also set                       │
│               `--station-toolbar-margin` to inset the    │
│               bar from the chassis edges (avoids it      │
│               kissing rounded corners or rivets).        │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

Every theme module ends with one call to `defineDockTheme(...)` and exports
the resulting CSS string. The collector
[dock-themes/index.ts](../../src/renderer/styles/dock-themes/index.ts)
bundles every theme and injects it into a single `<style id="krnl-dock-themes">`
element at boot — `installDockThemes()` is called from `index.tsx` BEFORE
React renders.

### File layout

```
src/renderer/styles/
├── dockTheme.ts                   ← the function (the contract)
├── chassis.css                    ← legacy: chrome+nodes for shipped docks
└── dock-themes/
    ├── index.ts                   ← installDockThemes()
    ├── blueprint.ts               ← one theme module per skin
    ├── macintosh.ts
    ├── mainframe.ts
    └── submarine.ts
```

### Worked example — `blueprint.ts`

```ts
import { defineDockTheme } from '../dockTheme';

export const BLUEPRINT_THEME = defineDockTheme(
  { id: 'blueprint', label: 'Blueprint' },
  {
    canvas: `
      html[data-theme="dark"][data-dock="blueprint"] .react-flow {
        background: linear-gradient(180deg, #08121f 0%, #0c1a2e 100%) !important;
        --grid:        rgba(126, 200, 227, 0.10);
        --grid-strong: rgba(126, 200, 227, 0.30);
      }
      html[data-dock="blueprint"] .react-flow::before {
        /* static cross-hatch grid overlay — drafting sheet feel */
        content: ''; position: absolute; inset: 0; …
      }
    `,
    chrome: `…chassis around the mother row…`,
    nodes:  `[data-dock="blueprint"] .mother-frame {
              --paper: #0c1a2e; --ink: #d8eaff; --acid: #7ec8e3; …
              background: var(--paper) !important; …
            }`,
    toolbar: `
      /* PANELS toolbar — drafting tab pinned to the top of the sheet */
      .dock-chassis.dock-blueprint { --station-toolbar-margin: 4px 14px 0; }
      .dock-chassis.dock-blueprint [data-testid="station-toolbar"] {
        background: rgba(126, 200, 227, 0.06) !important;
        border: 1px solid var(--bp-line-2) !important;
        border-radius: 2px;
      }
      …button + active-state overrides…
    `,
  },
);
```

The cascade does the rest: every node component inside a mother on a
Blueprint dock reads `--paper` and gets navy, reads `--acid` and gets cyan,
without per-component edits.

---

## ▌ 6. Cookbook — adding a new chassis

Adding a new dock style is **four file touches**: a Chrome component, a
registry entry, a theme module, and one line in the theme bundle.

### Recipe — adding `brutalist` (concrete slab aesthetic)

**Step 1 — write the Chrome component**

`src/renderer/components/ChassisLayer/BrutalistChrome.tsx`:

```tsx
export function BrutalistChrome() {
  return (
    <div className="md-brutalist-frame">
      {/* SVG / HTML painted inside the wrapper rect that CanvasChassis
          and StationLayout already give you. Don't position; fill. */}
    </div>
  );
}
```

**Step 2 — add one entry to `DOCK_REGISTRY`**

`src/renderer/components/ChassisLayer/dockRegistry.tsx`:

```ts
brutalist: {
  id: 'brutalist',
  label: 'Brutalist',
  sublabel: 'Concrete slab',
  glyph: BRUTALIST_GLYPH,
  Chrome: BrutalistChrome,
  canvasBounds: { kind: 'static',
    rect: { left: -1410, top: -60, width: 3360, height: 700 } },
  stationPadding: { top: 60, bottom: 60 },
  // theme: 'dark-only',   ← uncomment if the slab only renders in dark
},
```

`DockStyle` automatically widens. Every consumer reads from the registry.

**Step 3 — write the theme module (all three CSS slots)**

`src/renderer/styles/dock-themes/brutalist.ts`:

```ts
import { defineDockTheme } from '../dockTheme';

export const BRUTALIST_THEME = defineDockTheme(
  { id: 'brutalist', label: 'Brutalist' },
  {
    canvas: `
      html[data-dock="brutalist"] .react-flow {
        background: linear-gradient(180deg, #2a2a2a 0%, #1c1c1c 100%) !important;
        --grid: rgba(255,255,255,0.04);
        --grid-strong: rgba(255,255,255,0.10);
      }
      /* hatching, vignette, scanlines, whatever the aesthetic needs */
    `,
    chrome: `
      .dock-chassis.dock-brutalist {
        background: #2a2a2a;
        border: 8px solid #1c1c1c;
        /* concrete slab box-shadow, formwork lines, rivets */
      }
      .dock-chassis.dock-brutalist[data-station] {
        /* station-mode tweaks */
      }
      /* …all .md-br-* sub-element rules */
    `,
    nodes: `
      [data-dock="brutalist"] .mother-frame {
        --paper:   #2a2a2a;
        --paper-2: #1c1c1c;
        --node-bg: #1f1f1f;
        --ink:     #e8e3d4;
        --acid:    #ff8c00;       /* hazard orange instead of acid green */
        --spine:   #ff8c00;
        --rust:    #ff5050;
        --cyan:    #ff8c00;
        background: var(--paper) !important;
        box-shadow:
          inset 0 0 0 2px #0a0907,
          0 4px 0 rgba(0,0,0,0.55) !important;
      }
    `,
  },
);
```

**Step 4 — register the theme in the bundle**

`src/renderer/styles/dock-themes/index.ts`:

```ts
import { BRUTALIST_THEME } from './brutalist';
// …
const THEME_CSS_BUNDLE: string = [
  BLUEPRINT_THEME,
  MACINTOSH_THEME,
  SUBMARINE_THEME,
  BRUTALIST_THEME,     // ← new line
].join('\n');
```

**That's it.** The picker tile, canvas-mode chrome, station-mode chrome,
canvas paper, RF grid dots, and every mother-node child component all
re-skin themselves the next time the user selects Brutalist. No edits to
`chassis.css`, no per-component overrides, no consumer changes.

> **Legacy note.** Docks that pre-date `defineDockTheme()` (classic,
> synthesizer, telemetry, krnl-dock, plus the chrome/node CSS for blueprint,
> macintosh, submarine) live in `chassis.css`. That's allowed but not
> recommended. New docks SHOULD populate all four slots in the theme
> module — including `toolbar` so the Station-mode PANELS bar matches.

---

## ▌ 6. Anti-patterns — "you're doing it wrong"

These were the nine-file edit traps the registry was introduced to kill.
Any time you reach for one of them, prefer extending `DockStyleDef`.

| Symptom | Sign you're doing it wrong | Do this instead |
|---|---|---|
| Adding `case 'brutalist':` to a switch in `CanvasChassis` | The registry already dispatches `<def.Chrome />` | Add `Chrome` to the registry entry. |
| Hardcoding `if (style === 'krnl-dock')` in `TopBar` | That check exists; it lives in `isDarkOnly(style)` | Set `theme: 'dark-only'` on the registry entry. |
| Editing `STATIC_DIMS` or `RAIL_PADDING` constants in consumers | Those were removed in the refactor | Add `canvasBounds` / `stationPadding` to the registry entry. |
| Adding an entry to a parallel `LABELS` / `SUB` / `GLYPHS` map | The picker reads `def.label / def.sublabel / def.glyph` directly | Set those fields on the registry entry. |
| Calling `setStyle('something not in the registry')` | Compile error — `DockStyle` is `keyof typeof DOCK_REGISTRY` | Add the entry first. |
| Wrapping the Chrome component with positioning yourself | The consumer wraps you in `.dock-chassis dock-<id>` already | Paint inside the parent. |

> **Field note.** The original chassis system required edits in nine places
> for every new style — `DockStyle` union, `DOCK_STYLES` list, `chassis.css`,
> `CanvasChassis` STATIC_DIMS, `CanvasChassis` chrome switch, `StationLayout`
> RAIL_PADDING, `StationLayout` chrome switch, Dock picker LABELS/SUB/GLYPHS,
> TopBar dark-only branch. Every station-mode iteration silently missed at
> least one touchpoint. The registry exists so that future agent-driven
> dock additions cannot repeat that pain.

---

## ▌ 7. Test surface

The chassis behaviour is covered by the ADR 0008 test suite — see
`test(station): ADR 0008 test suite — chassis parity, StationCell,
viewport gate, toggle preservation, min-column` (commit `dd2b61f`). When
adding a new chassis, the parity check is automatic: the same `<Chrome />`
component renders in both modes from the same registry entry, so there is
no second implementation to keep in sync.

When extending `DockStyleDef` (new optional field, e.g. `bottomBleed`),
add the field to the type, give existing entries a sensible default, and
let consumers read it directly from `DOCK_REGISTRY[style]`. Do **not**
introduce a per-style switch to interpret the new field.

---

## ▌ 8. Glossary

| Term | Meaning |
|---|---|
| **Dock** | The decorative chrome wrapping the mother row. Variants: classic / synthesizer / telemetry / krnl-dock. *Not* a layout mode. |
| **Chassis** | The DOM element that holds the dock chrome (`.dock-chassis.dock-<id>`). Lives in both modes. |
| **Canvas Mode** | Infinite-canvas layout. Chrome rendered via `<ViewportPortal>` in flow-space. |
| **Station Mode** | Fixed-panel layout (ADR 0008). Chrome rendered in screen-space wrapping the station shell. |
| **`DockStyleDef`** | The single object literal that defines a chassis variant. The contract the engine enforces. |
| **`canvasBounds`** | How `CanvasChassis` positions the chrome rect in flow-space. `static` (fixed rectangle) or `fit-mothers` (hugs the mother row). |
| **`stationPadding`** | Pixels reserved at the top/bottom of the station shell to clear the chrome rails. |
| **`theme: 'dark-only'`** | Tells `TopBar` to suppress the light/dark toggle and force `data-theme="dark"` while this style is active. |
