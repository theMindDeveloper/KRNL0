// Runtime contrast picker for text-on-color surfaces.
//
// The naive "lock text to dark hex on every accent bg" rule fails because:
//   1) Habit colors include 'ink' and 'spine' which are DARK in light theme
//      (#1a1612 and #5e7d1d). Dark text on those is invisible.
//   2) Theme variants can map the SAME token to opposite ends of the
//      luminance spectrum — e.g. --rust is #c8553d in the light theme
//      but #0a0a0a in the high-contrast theme. A locked-dark text colour
//      disappears on the high-contrast variant.
//
// The correct rule is dynamic: read the computed background colour at
// render time, compute its luminance, and pick #0a0908 or #fafaf6 — the
// one with the higher contrast against that specific colour, in this
// specific theme, right now.
//
// All callers should use these helpers when placing text on a colour
// whose tone they don't statically control (habit colour, task tone,
// accent tokens whose value differs across themes).

/** Theme-locked near-black for text on bright/medium colours. */
export const TEXT_DARK = '#0a0908';
/** Theme-locked near-white for text on dark colours. */
export const TEXT_LIGHT = '#fafaf6';

// Cache keyed by `${theme}:${varName}` so theme switches invalidate
// the old picks. getComputedStyle is moderately expensive on hot paths
// (e.g. one habit block per weekday × scheduled habits); the cache
// keeps subsequent reads to a Map lookup.
const cache = new Map<string, string>();
let cachedTheme: string | null = null;

function currentTheme(): string {
  if (typeof document === 'undefined') return 'default';
  return document.documentElement.getAttribute('data-theme') ?? 'default';
}

function refreshThemeCache(): void {
  const theme = currentTheme();
  if (theme !== cachedTheme) {
    cache.clear();
    cachedTheme = theme;
  }
}

/** Parse #rgb / #rrggbb / rgb(...) / rgba(...) to a normalized #rrggbb. */
function parseToHex(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (s.startsWith('#')) {
    if (s.length === 4) {
      // #abc → #aabbcc
      return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
    }
    if (s.length === 7) return s.toLowerCase();
    return null;
  }
  const m = /rgba?\(([^)]+)\)/i.exec(s);
  if (!m) return null;
  const parts = m[1]!.split(',').map((p) => parseFloat(p.trim()));
  if (parts.length < 3) return null;
  const [r, g, b] = parts as [number, number, number];
  if (![r, g, b].every((n) => Number.isFinite(n))) return null;
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toLowerCase();
}

/**
 * Pick the higher-contrast text colour (dark or light) for a given
 * background colour expressed as a hex / rgb string. Uses the YIQ
 * brightness formula — cheap, accurate enough for UI decisions.
 */
export function bestTextOnHex(cssColor: string): string {
  const hex = parseToHex(cssColor);
  if (!hex) return TEXT_DARK;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  // 145 (out of 255) sits between WCAG light/dark thresholds and
  // matches the "feels readable" pick across the KRNL0 palette.
  return yiq >= 145 ? TEXT_DARK : TEXT_LIGHT;
}

/**
 * Pick the higher-contrast text colour for a CSS custom-property
 * background — e.g. `bestTextOnVar('--acid')` or
 * `bestTextOnVar(\`--${habit.color}\`)`. Reads the variable's currently
 * resolved value from `:root` so theme variants are honoured. Cached.
 */
export function bestTextOnVar(varName: string): string {
  if (typeof document === 'undefined') return TEXT_DARK;
  refreshThemeCache();
  const key = `${cachedTheme}:${varName}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  const pick = raw ? bestTextOnHex(raw) : TEXT_DARK;
  cache.set(key, pick);
  return pick;
}

/** Public reset for tests / theme-switch listeners that want to force a recompute. */
export function clearContrastCache(): void {
  cache.clear();
  cachedTheme = null;
}
