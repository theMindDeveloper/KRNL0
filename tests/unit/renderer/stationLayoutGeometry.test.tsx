// @vitest-environment jsdom
/**
 * Issue #199 — showing the terminal panel for the first time looped
 * (React #185): every saved layout flowed back into Panel `defaultSize`,
 * re-registered the panels and saved a slightly different layout again.
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  bottomUnchanged, columnsUnchanged, rowUnchanged, sameFraction, useSnapshot,
} from '../../../src/renderer/components/Station/layoutGeometry';
import { restoredSizes } from '../../../src/renderer/components/Station/restoredSizes';
import type { StationGeometry } from '../../../src/shared/types';

const saved: StationGeometry = {
  rowFraction: 0.40125,
  columnFractions: [0.25, 0.25, 0.25, 0.25],
  rightColumnSplit: 0.6,
  bottomFractions: {
    'station-bottom-canvas': 0.6,
    'station-bottom-terminal': 0.15,
    'station-bottom-clock': 0.25,
  },
};

describe('layout-changed handlers skip a write that changes nothing', () => {
  it('treats sizes within 0.01 % as the same', () => {
    expect(sameFraction(0.6, 0.60009)).toBe(true);
    expect(sameFraction(0.6, 0.6002)).toBe(false);
    expect(sameFraction(undefined, 0.6)).toBe(false);
  });

  it('bottom row: the rounding jitter measured in the #185 loop is not written again', () => {
    // The three layouts the loop cycled through (percent).
    const cycle = [
      { 'station-bottom-canvas': 60.009, 'station-bottom-terminal': 14.995, 'station-bottom-clock': 24.996 },
      { 'station-bottom-canvas': 60, 'station-bottom-terminal': 14.996, 'station-bottom-clock': 25.004 },
      { 'station-bottom-canvas': 59.994, 'station-bottom-terminal': 14.999, 'station-bottom-clock': 25.007 },
    ];
    for (const layout of cycle) {
      expect(bottomUnchanged(saved, layout, layout['station-bottom-canvas'] / 100)).toBe(true);
    }
  });

  it('bottom row: a real drag, a newly shown panel or no saved geometry is written', () => {
    expect(bottomUnchanged(saved, { 'station-bottom-canvas': 55, 'station-bottom-terminal': 20, 'station-bottom-clock': 25 }, 0.55)).toBe(false);
    expect(bottomUnchanged(saved, { 'station-bottom-canvas': 60, 'station-bottom-analytics': 15 }, 0.6)).toBe(false);
    expect(bottomUnchanged(undefined, { 'station-bottom-canvas': 60 }, 0.6)).toBe(false);
  });

  it('outer row and top columns', () => {
    expect(rowUnchanged(saved, 0.40126)).toBe(true);
    expect(rowUnchanged(saved, 0.45)).toBe(false);
    expect(columnsUnchanged(saved, [0.25003, 0.24998, 0.25, 0.25])).toBe(true);
    expect(columnsUnchanged(saved, [0.3, 0.2, 0.25, 0.25])).toBe(false);
    expect(columnsUnchanged(saved, [0.5, 0.5])).toBe(false);
  });
});

describe('panel sizes are a snapshot per set of visible panels', () => {
  it('keeps the first sizes while the saved layout keeps changing', () => {
    const ids = ['station-bottom-canvas', 'station-bottom-terminal'];
    let fractions: Record<string, number> = { 'station-bottom-canvas': 0.6, 'station-bottom-terminal': 0.1499 };
    const compute = () => restoredSizes(ids, [60, 15], [30, 14], fractions, 75);
    const { result, rerender } = renderHook(({ key }: { key: string }) => useSnapshot(key, compute), { initialProps: { key: ids.join(',') } });
    const first = result.current;
    // Each save used to change defaultSize and re-register the panels.
    const saves: Array<[number, number]> = [[0.60009, 0.14995], [0.6, 0.14996], [0.59994, 0.14999]];
    for (const [canvas, terminal] of saves) {
      fractions = { 'station-bottom-canvas': canvas, 'station-bottom-terminal': terminal };
      rerender({ key: ids.join(',') });
      expect(result.current).toBe(first);
    }
  });

  it('recomputes when a panel is shown or hidden, from what was saved', () => {
    let fractions: Record<string, number> = { a: 0.5, b: 0.5 };
    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) => useSnapshot(ids.join(','), () => restoredSizes(ids, ids.map(() => 100 / ids.length), ids.map(() => 10), fractions)),
      { initialProps: { ids: ['a', 'b'] } },
    );
    expect(result.current).toEqual([50, 50]);
    fractions = { a: 0.5, b: 0.25, c: 0.25 };
    rerender({ ids: ['a', 'b', 'c'] });
    expect(result.current).toEqual([50, 25, 25]);
  });
});
