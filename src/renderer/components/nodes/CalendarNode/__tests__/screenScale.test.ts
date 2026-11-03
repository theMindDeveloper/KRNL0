// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { screenScale } from '../screenScale';

function el(cssWidth: number, screenWidth: number): HTMLElement {
  const d = document.createElement('div');
  Object.defineProperty(d, 'offsetWidth', { value: cssWidth });
  d.getBoundingClientRect = () => ({ width: screenWidth, height: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) });
  return d;
}

describe('calendar pointer scale', () => {
  it('is the canvas zoom when the calendar is drawn scaled', () => {
    expect(screenScale(el(200, 100))).toBe(0.5);
    expect(screenScale(el(200, 300))).toBe(1.5);
  });
  it('falls back to 1 when the element is not measured (jsdom, hidden)', () => {
    expect(screenScale(el(0, 0))).toBe(1);
  });
});
