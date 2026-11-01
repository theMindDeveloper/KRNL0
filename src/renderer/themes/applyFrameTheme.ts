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

export function applyFrameTheme(id: FrameStyleId, mode: FrameMode, root: HTMLElement = document.documentElement): void {
  for (const key of applied) root.style.removeProperty(key);
  const entries = Object.entries(tokensFor(id, mode));
  for (const [key, value] of entries) root.style.setProperty(key, value);
  applied = entries.map(([key]) => key);
  if (id === 'classic') root.removeAttribute('data-dock');
  else root.setAttribute('data-dock', id);
}

/** Test hook: forget what was applied (jsdom roots are recreated per test). */
export function resetAppliedTokens(): void {
  applied = [];
}
