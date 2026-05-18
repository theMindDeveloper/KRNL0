/**
 * dockTheme — the modular contract every new dock skin must fulfil.
 *
 * Each dock style supplies FOUR slots of CSS. Every consumer agrees that
 * a dock is "themed" only when all four slots are present:
 *
 *   ┌─ canvas ──┐   The infinite canvas surface. Paper colour, grid pattern,
 *   │           │   page-level tokens for the React-Flow pane and body. This
 *   │           │   is the background the user pans across.
 *   ├─ chrome ──┤   The dock chassis itself — the decorative frame that
 *   │           │   wraps the mother row. Knobs, rivets, screens, plaques.
 *   ├─ nodes ───┤   The mother-node interior palette — `--paper`, `--ink`,
 *   │           │   `--acid`, `--spine`, `--rust`, `--node-bg`, etc. The
 *   │           │   cascade re-paints every component inside a mother.
 *   └─ toolbar ─┘   The Station-mode PANELS toolbar (top of the shell —
 *                   `[data-testid="station-toolbar"]`). Each dock owns its
 *                   own toolbar styling so the chip-bar reads as part of
 *                   the chassis (e.g. menu-bar for Mac, brass plate for
 *                   Submarine, drafting tab for Blueprint).
 *
 * `defineDockTheme()` enforces all four at the type level and returns a
 * single CSS string with section markers, ready to inject into a
 * <style> tag. Adding a new dock skin = one module that calls this
 * function with its four slots, then register it in
 * `dock-themes/index.ts`. No edits to other files are required.
 */

export interface DockThemeCss {
  /** Background of the infinite canvas / page. Selectors typically scope
   *  to `html[data-dock="X"] body`, `.react-flow__background`,
   *  `.react-flow__pane`. May redeclare `--paper` / `--grid` / etc. */
  canvas: string;
  /** Decorative chrome wrapping the mother row. Selectors typically scope
   *  to `.dock-chassis.dock-X` and any `.md-X-*` sub-elements. */
  chrome: string;
  /** Per-mother-node palette + bezel. Selectors typically scope to
   *  `[data-dock="X"] .mother-frame` and re-declare KRNL design tokens
   *  on it so the cascade re-paints every internal element. */
  nodes: string;
  /** Station-mode PANELS toolbar — the chip-strip rendered at the top of
   *  the station shell. Scope to
   *  `.dock-chassis.dock-X [data-testid="station-toolbar"]`. The default
   *  toolbar has its own beige background; per-dock styling lets the bar
   *  blend into the chassis (transparent menu-bar, brass strip, etc.).
   *  The toolbar's inline styles can be overridden with `!important`. */
  toolbar: string;
}

export interface DockThemeMeta {
  /** Stable id matching the DOCK_REGISTRY key and `<html data-dock="X">`. */
  id: string;
  /** Human-readable label — used in the auto-generated section markers. */
  label?: string;
}

/**
 * Build a single CSS string for a dock skin from its three slots.
 *
 * The returned string includes comment headers so the resulting
 * `<style id="krnl-dock-themes">` is readable in DevTools.
 *
 * @example
 *   export const BLUEPRINT_THEME = defineDockTheme(
 *     { id: 'blueprint', label: 'Blueprint' },
 *     {
 *       canvas: `html[data-dock="blueprint"] body { … }`,
 *       chrome: `.dock-chassis.dock-blueprint { … }`,
 *       nodes:  `[data-dock="blueprint"] .mother-frame { --paper: …; }`,
 *     },
 *   );
 */
export function defineDockTheme(meta: DockThemeMeta, css: DockThemeCss): string {
  const banner = (slot: 'CANVAS' | 'CHROME' | 'NODES' | 'TOOLBAR') =>
    `\n/* ═══════════════════════════════════════════════════════════════════\n` +
    `   DOCK · ${(meta.label ?? meta.id).toUpperCase()} · ${slot}\n` +
    `   id: ${meta.id}\n` +
    `   ═══════════════════════════════════════════════════════════════════ */\n`;

  return [
    banner('CANVAS')  + css.canvas.trim(),
    banner('CHROME')  + css.chrome.trim(),
    banner('NODES')   + css.nodes.trim(),
    banner('TOOLBAR') + css.toolbar.trim(),
  ].join('\n\n') + '\n';
}
