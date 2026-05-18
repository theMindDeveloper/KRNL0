/**
 * dock-themes — collects every dock skin's three-slot theme and injects
 * the combined CSS into the document head as a single <style> tag.
 *
 * Call `installDockThemes()` once at app boot, before React renders, to
 * avoid a flash-of-unthemed-canvas when a board opens in a non-default
 * dock. The function is idempotent — calling it twice replaces the
 * existing <style> element instead of duplicating rules.
 *
 * Adding a new dock skin:
 *   1. Create `src/renderer/styles/dock-themes/<id>.ts` exporting
 *      `export const <ID>_THEME = defineDockTheme({...}, {...})`.
 *   2. Import it here and append it to `THEME_CSS_BUNDLE` below.
 *   3. (Optionally) register the dock in `dockRegistry.tsx` with its
 *      Chrome component, bounds, padding, and theme constraint.
 */

import { BLUEPRINT_THEME } from './blueprint';
import { MACINTOSH_THEME } from './macintosh';
import { SUBMARINE_THEME } from './submarine';

const STYLE_TAG_ID = 'krnl-dock-themes';

/** Concatenated CSS for every dock skin registered above. */
const THEME_CSS_BUNDLE: string = [
  BLUEPRINT_THEME,
  MACINTOSH_THEME,
  SUBMARINE_THEME,
].join('\n');

/**
 * Inject the dock-theme CSS into <head>. Idempotent — safe to call once
 * at boot (the recommended place is `src/renderer/index.tsx` BEFORE
 * `createRoot(...).render(...)` so the canvas paints themed on first
 * frame).
 */
export function installDockThemes(): void {
  if (typeof document === 'undefined') return; // SSR / test guard
  let el = document.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_TAG_ID;
    document.head.appendChild(el);
  }
  el.textContent = THEME_CSS_BUNDLE;
}

/** Exported for tests + diagnostics. */
export const __DOCK_THEME_CSS = THEME_CSS_BUNDLE;
