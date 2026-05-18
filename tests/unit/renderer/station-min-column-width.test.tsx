/**
 * station-min-column-width.test.tsx
 *
 * ADR 0008 § 9.1 — at 1024×640, each station column respects its minSize floor.
 *
 * Layout (user-confirmed):
 *   Top row: 4 equal mother cells (Pomo, Todo, Habit, Calendar)
 *   Bottom row: Canvas + Clock
 */

import { describe, it, expect } from 'vitest';
import { SLOT_DEFAULTS } from '../../../src/renderer/components/Station/SlotResolver';

describe('station column minSize — 1024px viewport (ADR § 9.1)', () => {
  it('minColumn is a valid percentage', () => {
    expect(SLOT_DEFAULTS.minColumn).toBeGreaterThan(0);
    expect(SLOT_DEFAULTS.minColumn).toBeLessThan(50);
  });

  it('sum of 4-column minimum sizes does not exceed 100% (layout is feasible)', () => {
    // Top row: 4 mothers at minColumn each
    const sumMin = SLOT_DEFAULTS.minColumn * 4;
    expect(sumMin).toBeLessThanOrEqual(100);
  });

  it('default top-row column sizes sum to 100%', () => {
    const { columns } = SLOT_DEFAULTS;
    const total =
      columns['top-left'] +
      columns['top-center'] +
      columns['top-right-pre'] +
      columns['top-right-upper'];
    expect(total).toBe(100);
  });

  it('default bottom-row split sums to 100%', () => {
    expect(SLOT_DEFAULTS.bottom.canvas + SLOT_DEFAULTS.bottom.clock).toBe(100);
  });

  it('default row + canvas fraction sums to 100%', () => {
    expect(SLOT_DEFAULTS.rowPercent + SLOT_DEFAULTS.canvasPercent).toBe(100);
  });

  it('minRow and minCanvas leave room for each other', () => {
    expect(SLOT_DEFAULTS.minRow + SLOT_DEFAULTS.minCanvas).toBeLessThanOrEqual(100);
  });

  it('at 1024px viewport, minColumn px floor is meaningful (≥ 140px)', () => {
    const viewportWidth = 1024;
    const minPxPomo = (SLOT_DEFAULTS.minColumn / 100) * viewportWidth;
    // Pomo at min should still be at least 140px to display content.
    expect(minPxPomo).toBeGreaterThanOrEqual(140);
  });
});
