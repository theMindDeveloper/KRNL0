/** Calendar year view: 12 months always in even rows, the biggest square cells that fit the panel. */
import { describe, it, expect } from 'vitest';
import { yearLayout } from '../../../src/renderer/components/nodes/CalendarNode/YearView';

const fits = (w: number, h: number) => {
  const { cols, cell } = yearLayout(w, h);
  const rows = 12 / cols;
  const monthW = cell * 7 + 2 * 6;
  const monthH = 34 + cell * 6 + 2 * 5;
  return { cols, cell, ok: monthW * cols + 14 * (cols - 1) <= w && monthH * rows + 14 * (rows - 1) <= h };
};

describe('yearLayout', () => {
  it('only ever uses 2, 3, 4 or 6 columns (never 7 + 5)', () => {
    for (const [w, h] of [[1000, 760], [520, 760], [380, 560], [700, 520], [1400, 400], [300, 900]] as const) {
      expect([2, 3, 4, 6]).toContain(yearLayout(w, h).cols);
    }
  });

  it('every month fits inside the box at every size', () => {
    for (const [w, h] of [[1000, 760], [520, 760], [380, 560], [700, 520], [1400, 400], [300, 900], [1920, 1000]] as const) {
      expect(fits(w, h).ok).toBe(true);
    }
  });

  it('a wide, short panel goes 6 across; a tall, narrow one 2 or 3 across', () => {
    expect(yearLayout(1400, 400).cols).toBe(6);
    expect(yearLayout(300, 900).cols).toBeLessThanOrEqual(3);
  });

  it('cells are capped at 28 px and never below 6', () => {
    expect(yearLayout(4000, 3000).cell).toBe(28);
    expect(yearLayout(50, 50).cell).toBe(6);
  });
});
