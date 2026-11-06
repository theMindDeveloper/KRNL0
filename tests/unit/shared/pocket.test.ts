/** Decision 37 — pocket timer rules (pocket-timer.md F1, F7, F9, F10). */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_POCKET_PREFS,
  clampPocketPosition,
  describePocketStatus,
  isPocketLive,
  parsePocketPrefs,
  shouldShowPocket,
} from '../../../src/shared/pocket';

describe('shouldShowPocket', () => {
  const on = { ...DEFAULT_POCKET_PREFS };
  it('F1: shows on minimise while timing, not when idle or with the window up', () => {
    expect(shouldShowPocket({ prefs: on, live: true, mainMinimized: true, forced: false })).toBe(true);
    expect(shouldShowPocket({ prefs: on, live: false, mainMinimized: true, forced: false })).toBe(false);
    expect(shouldShowPocket({ prefs: on, live: true, mainMinimized: false, forced: false })).toBe(false);
  });
  it('F10: mini show shows it with the window up, while timing', () => {
    expect(shouldShowPocket({ prefs: on, live: true, mainMinimized: false, forced: true })).toBe(true);
    expect(shouldShowPocket({ prefs: on, live: false, mainMinimized: false, forced: true })).toBe(false);
  });
  it('F9: off means never', () => {
    expect(shouldShowPocket({ prefs: { ...on, enabled: false }, live: true, mainMinimized: true, forced: true })).toBe(false);
  });
});

describe('isPocketLive', () => {
  it.each([['running', true], ['paused', true], ['break', true], ['idle', false], ['done', false], [undefined, false]] as const)('%s', (s, want) => {
    expect(isPocketLive(s)).toBe(want);
  });
});

describe('clampPocketPosition (F7)', () => {
  const screens = [{ x: 0, y: 0, width: 1920, height: 1040 }, { x: 1920, y: 0, width: 1280, height: 1000 }];
  const size = { width: 304, height: 250 };
  it('no saved position: top-right of the first screen', () => {
    expect(clampPocketPosition({ x: null, y: null }, size, screens)).toEqual({ x: 1920 - 304 - 24, y: 24 });
  });
  it('keeps a visible position, nudged fully inside', () => {
    expect(clampPocketPosition({ x: 2000, y: 100 }, size, screens)).toEqual({ x: 2000, y: 100 });
    expect(clampPocketPosition({ x: 1700, y: 900 }, size, screens)).toEqual({ x: 1616, y: 790 });
    // Straddling two screens: it lands fully on the one its centre is nearest.
    expect(clampPocketPosition({ x: 1800, y: 900 }, size, screens)).toEqual({ x: 1920, y: 750 });
  });
  it('a position on an unplugged monitor moves to the nearest screen', () => {
    expect(clampPocketPosition({ x: 5000, y: 300 }, size, screens)).toEqual({ x: 1920 + 1280 - 304, y: 300 });
    expect(clampPocketPosition({ x: -3000, y: -500 }, size, screens)).toEqual({ x: 0, y: 0 });
  });
});

describe('parsePocketPrefs', () => {
  it('fills defaults and drops junk', () => {
    expect(parsePocketPrefs(null)).toEqual(DEFAULT_POCKET_PREFS);
    expect(parsePocketPrefs({ enabled: false, collapsed: 'yes', x: 10.6, y: 'a' })).toEqual({ enabled: false, collapsed: false, x: 11, y: null });
  });
});

describe('describePocketStatus', () => {
  it('reads plainly', () => {
    expect(describePocketStatus({ enabled: false, visible: false, collapsed: false, live: true })).toBe('Floating timer is off.');
    expect(describePocketStatus({ enabled: true, visible: true, collapsed: true, live: true })).toBe('Floating timer is on · showing (collapsed) · a session is running.');
  });
});
