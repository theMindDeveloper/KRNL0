/**
 * applyFrameTheme — the one place that writes a frame style's theme onto the
 * document (ADR 0009, requirement F2).
 *
 * Tokens go on <html> as inline custom properties so they beat the
 * `[data-theme]` defaults in tokens.css and reach every node, including child
 * canvas nodes. Properties written for the previous style are removed first,
 * so switching back to Classic restores tokens.css exactly.
 */

import type { FrameMode, FrameStyleId } from '../../shared/frameStyles';
import { MANIFESTS } from './manifests';
import type { ThemeManifest, TokenMap, XtermColors } from './types';
import { accentTokens, loadAccent, onAccentChange } from './accent';

let applied: string[] = [];

export function resolveMode(manifest: ThemeManifest, mode: FrameMode): FrameMode {
  if (manifest.tokens[mode]) return mode;
  return mode === 'dark' ? 'light' : 'dark';
}

export function tokensFor(id: FrameStyleId, mode: FrameMode): TokenMap {
  const m = MANIFESTS[id];
  return m.tokens[resolveMode(m, mode)] ?? {};
}

export function xtermFor(id: FrameStyleId, mode: FrameMode): XtermColors | undefined {
  const x = MANIFESTS[id].components.terminal.xterm;
  return x[mode] ?? x.dark ?? x.light;
}

export function currentMode(root: HTMLElement = document.documentElement): FrameMode {
  return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

let last: { id: FrameStyleId; root: HTMLElement } | null = null;

export function applyFrameTheme(id: FrameStyleId, mode: FrameMode, root: HTMLElement = document.documentElement): void {
  for (const key of applied) root.style.removeProperty(key);
  const base = tokensFor(id, mode);
  const entries = Object.entries(base);
  // The user's accent (Settings → Appearance) goes on top of the style's own,
  // for the mode the style is shown in (a dark-only style stays dark).
  const accent = loadAccent();
  if (accent) entries.push(...Object.entries(accentTokens(accent, resolveMode(MANIFESTS[id], mode), base)));
  for (const [key, value] of entries) root.style.setProperty(key, value);
  applied = entries.map(([key]) => key);
  last = { id, root };
  // F10 — bundled fonts load on demand; a failure only costs the fallback font.
  void MANIFESTS[id].loadFonts?.().catch(() => undefined);
  if (id === 'classic') root.removeAttribute('data-dock');
  else root.setAttribute('data-dock', id);
}

// A new accent: write the style's tokens again, with it, for the mode shown now.
onAccentChange(() => { if (last) applyFrameTheme(last.id, currentMode(last.root), last.root); });

/** Test hook: forget what was applied (jsdom roots are recreated per test). */
export function resetAppliedTokens(): void {
  applied = [];
}
