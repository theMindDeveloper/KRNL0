// @vitest-environment jsdom
/**
 * contrastText — YIQ-based text-on-colour picker.
 *
 * Asserts the rule the user complained about: dark habit colours
 * ('ink' = #1a1612 in light theme, 'spine' = #5e7d1d) must receive
 * the LIGHT text colour, not the dark one. Bright colours
 * ('acid' = #c9f158) must receive DARK text. The picker has to flip
 * automatically with no caller knowledge of the palette.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  bestTextOnHex,
  bestTextOnVar,
  clearContrastCache,
  TEXT_DARK,
  TEXT_LIGHT,
} from '../../../src/renderer/utils/contrastText';

describe('contrastText.bestTextOnHex', () => {
  it('picks dark text on bright KRNL0 accents', () => {
    expect(bestTextOnHex('#c9f158')).toBe(TEXT_DARK); // acid (default theme)
    expect(bestTextOnHex('#fafaf6')).toBe(TEXT_DARK); // acid (high-contrast)
    expect(bestTextOnHex('#22d3ee')).toBe(TEXT_DARK); // cyan
    expect(bestTextOnHex('#d9a55a')).toBe(TEXT_DARK); // amber
    expect(bestTextOnHex('#ee8466')).toBe(TEXT_DARK); // rust (dark theme — peach, light)
  });

  it('picks LIGHT text on dark habit colours and medium-dark tones', () => {
    // The exact regression the user reported: in light mode, picking
    // habit color "ink" gave a dark block with dark text on it.
    expect(bestTextOnHex('#1a1612')).toBe(TEXT_LIGHT); // ink (light theme)
    expect(bestTextOnHex('#5e7d1d')).toBe(TEXT_LIGHT); // spine (light theme)
    expect(bestTextOnHex('#0a0a0a')).toBe(TEXT_LIGHT); // rust (high-contrast — flipped to near-black)
    expect(bestTextOnHex('#6b4ea8')).toBe(TEXT_LIGHT); // plum
    expect(bestTextOnHex('#c8553d')).toBe(TEXT_LIGHT); // rust (light theme — dusty red, white wins)
  });

  it('parses short-hex and rgb() forms', () => {
    expect(bestTextOnHex('#fff')).toBe(TEXT_DARK);
    expect(bestTextOnHex('#000')).toBe(TEXT_LIGHT);
    expect(bestTextOnHex('rgb(250, 250, 246)')).toBe(TEXT_DARK);
    expect(bestTextOnHex('rgba(10, 9, 8, 1)')).toBe(TEXT_LIGHT);
  });

  it('falls back to dark text when the input is unparseable', () => {
    expect(bestTextOnHex('not-a-color')).toBe(TEXT_DARK);
    expect(bestTextOnHex('')).toBe(TEXT_DARK);
  });
});

describe('contrastText.bestTextOnVar (with jsdom :root)', () => {
  beforeEach(() => {
    clearContrastCache();
    document.documentElement.setAttribute('data-theme', 'test');
    document.documentElement.style.setProperty('--test-bright', '#c9f158');
    document.documentElement.style.setProperty('--test-dark', '#1a1612');
  });

  it('reads --token value from :root and picks the right text colour', () => {
    expect(bestTextOnVar('--test-bright')).toBe(TEXT_DARK);
    expect(bestTextOnVar('--test-dark')).toBe(TEXT_LIGHT);
  });

  it('invalidates cache when data-theme changes', () => {
    expect(bestTextOnVar('--test-bright')).toBe(TEXT_DARK);

    // Flip the theme; same var, opposite hex.
    document.documentElement.setAttribute('data-theme', 'inverted');
    document.documentElement.style.setProperty('--test-bright', '#0a0a0a');
    expect(bestTextOnVar('--test-bright')).toBe(TEXT_LIGHT);
  });

  it('returns dark fallback for an undefined variable', () => {
    expect(bestTextOnVar('--does-not-exist')).toBe(TEXT_DARK);
  });
});
