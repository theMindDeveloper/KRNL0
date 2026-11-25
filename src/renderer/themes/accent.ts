// The app's accent colour (owner, 2026-11-24: "change any colour instead of the
// app's green, and a reset for the default KRNL0 green"). Settings → General →
// Appearance, and `krnl theme accent <#hex|name|reset>`.
//
// The accent is a per-device choice (like light / dark), kept in localStorage.
// It is written on <html> as inline custom properties AFTER the frame style's
// tokens (applyFrameTheme), so it wins over every style, and it follows light /
// dark: in light mode accent TEXT is a deeper shade of it (a bright accent is
// unreadable on cream), in dark mode the accent itself.

import type { FrameMode } from '../../shared/frameStyles';
import type { TokenMap } from './types';

export const ACCENT_DEFAULT = '#c9f158';
const KEY = 'krnl0-accent';
const HEX = /^#[0-9a-f]{6}$/i;

export const ACCENT_PRESETS: ReadonlyArray<{ id: string; hex: string; name: string }> = [
  { id: 'green', hex: ACCENT_DEFAULT, name: 'KRNL0 green' },
  { id: 'cyan', hex: '#5ad1e6', name: 'Cyan' },
  { id: 'blue', hex: '#6aa8ff', name: 'Blue' },
  { id: 'violet', hex: '#b48cff', name: 'Violet' },
  { id: 'pink', hex: '#ff7ab6', name: 'Pink' },
  { id: 'red', hex: '#ff6b6b', name: 'Red' },
  { id: 'orange', hex: '#ff9f5a', name: 'Orange' },
  { id: 'amber', hex: '#ffd166', name: 'Amber' },
];

/** "#ABC", "abc123", "blue", "KRNL0 green" → "#aabbcc"; null when it is not a colour. */
export function parseAccent(input: string): string | null {
  const v = input.trim().toLowerCase();
  const preset = ACCENT_PRESETS.find((p) => p.id === v || p.name.toLowerCase() === v || (v === 'default' && p.id === 'green') || (v === 'krnl0' && p.id === 'green'));
  if (preset) return preset.hex;
  const h = v.startsWith('#') ? v : `#${v}`;
  if (/^#[0-9a-f]{3}$/.test(h)) return `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  return HEX.test(h) ? h : null;
}

/** Relative luminance (WCAG) of a #rrggbb colour. */
export function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

/**
 * Why an accent can't be used, or null. Text and marks on an accent fill are
 * dark in every style, so the accent must stay light enough to read them on
 * (at least 4.5:1 against near-black).
 */
export function accentProblem(hex: string): string | null {
  if (!HEX.test(hex)) return 'Type a colour like #6aa8ff';
  const contrast = (luminance(hex) + 0.05) / (0.004 + 0.05);
  return contrast < 4.5 ? 'Too dark: dark text on it would be hard to read. Pick a lighter one.' : null;
}

/** The saved accent (#rrggbb), or null for KRNL0 green. */
export function loadAccent(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    return v && HEX.test(v) && v.toLowerCase() !== ACCENT_DEFAULT ? v.toLowerCase() : null;
  } catch { return null; }
}

/**
 * The tokens an accent writes on top of the frame style's (`base`), for the
 * mode the style is really shown in (a dark-only style is dark even when the
 * app is set to light).
 *
 * The primary button is left to the style: where a style fills it (or writes
 * its text) with the accent it says `var(--acid)` and follows on its own; a
 * style with its own button colours (Blueprint's cream on navy) keeps them.
 * Only a hover written as the old green literal is replaced.
 */
export function accentTokens(hex: string, mode: FrameMode, base: TokenMap = {}): TokenMap {
  const glow = `color-mix(in srgb, ${hex} 75%, white)`;
  const out: Record<`--${string}`, string> = {
    '--acid': hex,
    '--acid-glow': glow,
    '--acid-faint': `color-mix(in srgb, ${hex} 8%, transparent)`,
    '--acid-ink': mode === 'light' ? `color-mix(in srgb, ${hex} 42%, black)` : hex,
    '--accent-on-dark': hex,
    '--term-acid': hex,
    '--btn-primary-ring': `color-mix(in srgb, ${hex} 45%, transparent)`,
  };
  const bg = base['--btn-primary-bg'];
  if (mode === 'dark' && (bg === undefined || bg === 'var(--acid)')) out['--btn-primary-bg-hover'] = glow;
  return out;
}

type Listener = () => void;
const listeners = new Set<Listener>();
/** Called when the accent changes (applyFrameTheme writes it again). */
export function onAccentChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Save an accent (null or KRNL0 green = the default) and apply it everywhere. */
export function saveAccent(hex: string | null): string | null {
  const v = hex ? parseAccent(hex) : null;
  if (hex && !v) return 'Type a colour like #6aa8ff';
  if (v) { const p = accentProblem(v); if (p) return p; }
  try {
    if (!v || v === ACCENT_DEFAULT) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, v);
  } catch { /* private window: this session only */ }
  for (const fn of listeners) fn();
  return null;
}

/** Another window of the app (the floating timer) changed it: follow. */
export function installAccentSync(): () => void {
  const on = (e: StorageEvent): void => { if (e.key === KEY) for (const fn of listeners) fn(); };
  window.addEventListener('storage', on);
  return () => window.removeEventListener('storage', on);
}
