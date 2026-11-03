// @vitest-environment jsdom
/** Event handlers see the layout the window really shows (ADR 0008 § 9.5 narrow fallback). */
import { describe, it, expect, afterEach } from 'vitest';
import { isStationShown } from '../../../src/renderer/components/Station/useStationViewportGate';

const size = (w: number, h: number) => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: h });
};
afterEach(() => size(1280, 800));

describe('isStationShown', () => {
  it('station on a big enough window', () => {
    size(1440, 900);
    expect(isStationShown('station')).toBe(true);
    expect(isStationShown('canvas')).toBe(false);
  });
  it('a half-screen window falls back to the canvas', () => {
    size(960, 1040);
    expect(isStationShown('station')).toBe(false);
  });
});
