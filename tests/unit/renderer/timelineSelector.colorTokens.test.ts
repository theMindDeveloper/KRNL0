/**
 * Decision 24.1 — Color-token contract test.
 *
 * Asserts that every entry in COLORS (the selector's palette) has a matching
 * CSS custom-property declaration (`--<name>:`) in tokens.css.
 *
 * This is the merge gate: if anyone adds a color name to COLORS without
 * adding the corresponding `--<name>` to tokens.css, this test fails with a
 * clear message naming the missing token.
 *
 * Background: `stroke="var(--undefined-token)"` in SVG falls back to
 * `stroke="none"` (SVG initial value), making the arc invisible even though
 * the DOM element exists. jsdom tests cannot catch this because jsdom does
 * not parse or apply CSS; only a static-analysis test against the CSS file can.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { COLORS } from '../../../src/renderer/store/timelineSelector';

describe('Decision 24.1 — color-token contract', () => {
  it('every COLORS entry has a matching CSS custom property in tokens.css', () => {
    const cssPath = resolve(__dirname, '../../../src/renderer/styles/tokens.css');
    const css = readFileSync(cssPath, 'utf-8');

    for (const token of COLORS) {
      const re = new RegExp(`--${token}\\s*:`);
      expect(re.test(css), `--${token} must be defined in src/renderer/styles/tokens.css`).toBe(true);
    }
  });
});
