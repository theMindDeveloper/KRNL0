/**
 * station-min-column-width.test.tsx
 *
 * ADR 0008 § 9.1 — at 1024×640, each station column respects its minSize floor.
 * Gates OQ-1's tight-column concern.
 *
 * The react-resizable-panels library itself enforces minSize.  This test
 * validates the minSize constants we provide and verifies that at the minimum
 * supported viewport (1024×640), the sum of min-widths (in %) doesn't exceed
 * 100 — meaning the layout is feasible at minimum.
 */

import { describe, it, expect } from 'vitest';
import { SLOT_DEFAULTS } from '../../../src/renderer/components/Station/SlotResolver';

describe('station column minSize — 1024px viewport (ADR § 9.1)', () => {
  it('minColumn and minColumnWide are valid percentages', () => {
    expect(SLOT_DEFAULTS.minColumn).toBeGreaterThan(0);
    expect(SLOT_DEFAULTS.minColumn).toBeLessThan(50);
    expect(SLOT_DEFAULTS.minColumnWide).toBeGreaterThan(0);
    expect(SLOT_DEFAULTS.minColumnWide).toBeLessThan(50);
  });

  it('sum of 4-column minimum sizes does not exceed 100% (layout is feasible)', () => {
    // 3 columns at minColumn (Pomo, Habit) + 1 at minColumnWide (Todo)
    // + 1 right rail at minColumnWide.
    // Layout: Pomo(minColumn) + Todo(minColumnWide) + Habit(minColumn) + RightRail(minColumnWide)
    const sumMin =
      SLOT_DEFAULTS.minColumn +
      SLOT_DEFAULTS.minColumnWide +
      SLOT_DEFAULTS.minColumn +
      SLOT_DEFAULTS.minColumnWide;
    expect(sumMin).toBeLessThanOrEqual(100);
  });

  it('default column sizes sum to 100%', () => {
    const { columns } = SLOT_DEFAULTS;
    const total =
      columns['top-left'] +
      columns['top-center'] +
      columns['top-right-pre'] +
      columns['right-rail'];
    expect(total).toBe(100);
  });

  it('default right-rail split sums to 100%', () => {
    const { rightColumn } = SLOT_DEFAULTS;
    expect(rightColumn.upper + rightColumn.lower).toBe(100);
  });

  it('default row + canvas fraction sums to 100%', () => {
    expect(SLOT_DEFAULTS.rowPercent + SLOT_DEFAULTS.canvasPercent).toBe(100);
  });

  it('minRow and minCanvas leave room for each other', () => {
    expect(SLOT_DEFAULTS.minRow + SLOT_DEFAULTS.minCanvas).toBeLessThanOrEqual(100);
  });

  it('at 1024px viewport, minColumn px floor is meaningful (≥ 160px)', () => {
    const viewportWidth = 1024;
    const minPxPomo = (SLOT_DEFAULTS.minColumn / 100) * viewportWidth;
    // Pomo at min should still be at least 160px to display content.
    expect(minPxPomo).toBeGreaterThanOrEqual(160);
  });
});
