/**
 * themeContrast.test.ts — ADR 0009 NF6, the guard against same-colour text.
 *
 * Resolves the real token values every frame style ends up with (tokens.css
 * base for the mode + the style's manifest), then checks WCAG contrast for
 * every foreground/background PAIR the components rely on. A new style, or a
 * palette tweak, that would put black on black (or acid on cream) fails here
 * instead of shipping.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MANIFESTS } from '../../../src/renderer/themes/manifests';
import { FRAME_STYLES } from '../../../src/shared/frameStyles';

type Map = Record<string, string>;

const css = readFileSync(resolve(__dirname, '../../../src/renderer/styles/tokens.css'), 'utf8');

function block(selector: string): Map {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block`);
  const body = css.slice(start, css.indexOf('\n}', start));
  const out: Map = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}

const BASE = { light: block(':root'), dark: { ...block(':root'), ...block('[data-theme="dark"]') } };

function resolveVar(map: Map, value: string, depth = 0): string {
  if (depth > 10) throw new Error(`var loop: ${value}`);
  const m = value.match(/^var\((--[\w-]+)(?:,\s*(.+))?\)$/);
  if (!m) return value;
  const ref = map[m[1]!];
  return resolveVar(map, ref ?? m[2] ?? '', depth + 1);
}

type RGBA = { r: number; g: number; b: number; a: number };
function parse(c: string): RGBA {
  const hex = c.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return { r: n >> 16, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgba = c.match(/^rgba?\(([^)]+)\)$/);
  if (rgba) {
    const [r, g, b, a] = rgba[1]!.split(',').map((x) => Number(x.trim()));
    return { r: r!, g: g!, b: b!, a: a ?? 1 };
  }
  throw new Error(`unparseable colour "${c}"`);
}
const over = (top: RGBA, under: RGBA): RGBA => ({
  r: top.r * top.a + under.r * (1 - top.a),
  g: top.g * top.a + under.g * (1 - top.a),
  b: top.b * top.a + under.b * (1 - top.a),
  a: 1,
});
const lin = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (c: RGBA) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
function contrast(fg: string, bg: string): number {
  const b = parse(bg);
  const f = over(parse(fg), b);
  const [hi, lo] = [lum(f), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** Fixed dark surfaces that never flip with the mode (dock key, LCD, status bar). */
const FIXED_DARK = '#1a1814';

/** [foreground token, background token or literal, minimum ratio] */
const PAIRS: ReadonlyArray<[string, string, number]> = [
  ['--ink', '--node-bg', 4.5],
  ['--ink-2', '--node-bg', 4.5],
  ['--ink-3', '--node-bg', 4.5],
  ['--ink-4', '--node-bg', 4.5],
  ['--acid-ink', '--node-bg', 4.5],
  ['--accent-on-dark', FIXED_DARK, 4.5],
  ['--ink-on-bright', '--acid', 4.5],
  ['--btn-primary-fg', '--btn-primary-bg', 4.5],
];

const cases = FRAME_STYLES.flatMap((s) => s.modes.map((mode) => [s.id, mode] as const));

describe('NF6 — every style keeps its text/surface pairs readable', () => {
  it.each(cases)('%s / %s', (id, mode) => {
    const map: Map = { ...BASE[mode], ...(MANIFESTS[id].tokens[mode] ?? {}) };
    const failures: string[] = [];
    for (const [fgTok, bgTok, min] of PAIRS) {
      const fg = resolveVar(map, map[fgTok] ?? '');
      const bg = bgTok.startsWith('--') ? resolveVar(map, map[bgTok] ?? '') : bgTok;
      const ratio = contrast(fg, bg);
      if (ratio < min) failures.push(`${fgTok} (${fg}) on ${bgTok} (${bg}) = ${ratio.toFixed(2)} < ${min}`);
    }
    expect(failures).toEqual([]);
  });
});
