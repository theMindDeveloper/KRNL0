# ADR 0009 — Frame styles become full themes (theme engine + manifests)

**Status:** Accepted · 2026-11-01
**Supersedes:** the "Custom themes" row of the v1 cut list in `docs/03-architecture/decisions.md` ("we don't ship more than light + dark").
**Requirements:** `docs/06-requirements/theme-engine.md`

## Context

Frame styles (dock styles) were introduced as decoration around the mother row (ADR 0008 §2.6, `dockRegistry.tsx`). Over time each style grew its own colours, but only as token overrides on `.mother-frame` plus bezel CSS:

- Child canvas nodes (task, text, image) are separate React Flow nodes, so they never inherit tokens re-declared on `.mother-frame`.
- About 80 colours are hard-coded inside components (xterm theme object, Pomo LCD face, calendar now-line and grid, clock pointer core, MotherFrame inline styles), so no style can reach them.
- `defineDockTheme()` has `chrome` and `nodes` slots that were never migrated.
- Fonts several styles depend on (VT323, Stardos Stencil, Chicago) were never loaded.

The user approved design drafts in which every frame style skins every component, plus a new Pro style, and asked for a manifest-driven engine instead of hard-coded styling. The original green look (Classic) must stay available.

## Decision

1. **One manifest per frame style, on the existing registry.** `DockStyleDef` gains `manifest: ThemeManifest`. No parallel registry.
2. **Tokens live on `<html>`.** `applyFrameTheme(id, mode)` writes the manifest's tokens as CSS custom properties on the document root and keeps `data-dock` for chrome CSS. Existing token names are reused (`--paper`, `--ink*`, `--acid`, …) so the hundreds of existing `var()` reads keep working; new `--k-*` tokens replace hard-coded literals.
3. **Classic defaults reproduce today exactly.** Every new `--k-*` token's Classic value equals the literal it replaces. Classic remains the default style.
4. **Component variants are data, user choices win.** `components.pomo.face` is only a default; a node's own `config.face` overrides it. `components.clock` changes appearance only; the clock's feature set is fixed (ADR requirement F6).
5. **Frame style stays a per-machine preference.** It is persisted in localStorage (`krnl0-dock-style`) as today, not in `board.json`, so a shared board does not force a look on another machine. The CLI reaches it through the existing renderer dispatch (`cli:dispatch` → `theme.frame`), the same path `theme.set` already uses.
6. **Fonts are bundled.** Style fonts ship as local files and load only while their style is active (offline-first).
7. **Panel toggles are a slot.** `slots.panelToggles` places the Station toggles in the TopBar or the style's chrome, removing the separate row where a style opts in.

## Consequences

- Adding a style = one registry entry + one manifest (+ optional Chrome component).
- A test enforces the no-hard-coded-colour allowlist in node components.
- Light/dark stays a separate axis (`data-theme`); manifests carry tokens per mode and dark-only styles declare one mode.
- Delivered in four phases (requirements doc, "Delivery phases"); each phase ends green on typecheck and tests.

## Files affected (phase 1)

- `src/renderer/components/ChassisLayer/dockRegistry.tsx` — `manifest` field, Pro entry
- `src/renderer/themes/` — `types.ts`, `applyFrameTheme.ts`, one manifest per style
- `src/renderer/components/ChassisLayer/useDockStyle.ts` — calls the engine
- `src/renderer/store/useCliDispatch.ts`, `src/sys/parser.ts`, `src/sys/SysFacade.ts`, `src/sys/commands/theme.ts` — CLI
- Node components — literal → token sweep
