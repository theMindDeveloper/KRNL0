// @vitest-environment jsdom
/**
 * Ambient Radio and window resizes: a tab tucked to the right edge follows
 * that edge when the window grows or shrinks (it used to stay where it was —
 * mid-screen after maximising, out of reach after shrinking).
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import React from 'react';
import { AmbientRadio } from '../../../src/renderer/components/AmbientRadio';

function setWindow(w: number, h: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: h });
}

beforeEach(() => {
  try { localStorage.clear(); } catch { /* none */ }
  setWindow(1200, 800);
});
afterEach(() => { cleanup(); });

describe('Ambient Radio on window resize', () => {
  it('a tab tucked right stays on the right edge when the window grows and shrinks', () => {
    // First run: the radio starts tucked at the right edge.
    render(<AmbientRadio />);
    const left = () => parseFloat(screen.getByTestId('ambient-radio').style.left);
    expect(left()).toBe(1200 - 14);
    act(() => { setWindow(1600, 900); window.dispatchEvent(new Event('resize')); });
    expect(left()).toBe(1600 - 14);
    act(() => { setWindow(800, 600); window.dispatchEvent(new Event('resize')); });
    expect(left()).toBe(800 - 14);
  });
});
