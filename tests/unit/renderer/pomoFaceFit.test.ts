/** A short station Pomo sheds secondary rows so the time and START always show. */
import { describe, it, expect } from 'vitest';
import { compactLevelFor } from '../../../src/renderer/components/nodes/PomoNode/FaceFit';

describe('compactLevelFor', () => {
  it('keeps every row when there is room', () => {
    expect(compactLevelFor(349)).toBe(0); // 1920×1080 station slot
  });
  it('sheds log link, then cycles, then session dots as the slot gets shorter', () => {
    expect(compactLevelFor(300)).toBe(1);
    expect(compactLevelFor(286)).toBe(2); // 1440×900
    expect(compactLevelFor(251)).toBe(3); // 1280×800
  });
  it('never goes past the last level', () => {
    expect(compactLevelFor(0)).toBe(3);
  });
});
