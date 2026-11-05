// Station panel sizes ↔ saved geometry, without a feedback loop (issue #199).
//
// react-resizable-panels v4 re-registers a Panel whenever its `defaultSize`
// prop changes, and every registration re-derives the group layout (rounded
// to 3 decimals) and fires onLayoutChanged. We save that layout, and the
// saved fractions used to flow straight back into `defaultSize` — so each
// save produced slightly different sizes, which re-registered the panels,
// which saved again. The values never settled (a 3-step cycle measured when
// the terminal panel was first shown) and React stopped it with error #185.
//
// Two guards, either of which breaks the loop:
//   1. useSnapshot — panel sizes are computed once per set of visible panels
//      (the only time a Panel reads `defaultSize` anyway), not on every save.
//   2. *Unchanged — a layout within EPSILON_PCT of what is saved is not
//      written again.

import { useRef } from 'react';
import type { StationGeometry } from '../../../shared/types';

/** Layout differences at or below this many percent are not worth a save. */
export const EPSILON_PCT = 0.01;

/** Two saved fractions (0..1) are the same size to within EPSILON_PCT %. */
export function sameFraction(a: number | undefined, b: number | undefined, epsPct: number = EPSILON_PCT): boolean {
  if (a === undefined || b === undefined) return false;
  return Math.abs(a - b) * 100 <= epsPct + 1e-9;
}

/** The mother-row height is already saved. */
export function rowUnchanged(current: StationGeometry | undefined, rowFraction: number): boolean {
  return sameFraction(current?.rowFraction, rowFraction);
}

/** Every top-row column width is already saved. */
export function columnsUnchanged(current: StationGeometry | undefined, columnFractions: readonly number[]): boolean {
  const saved = current?.columnFractions;
  if (!saved || saved.length !== columnFractions.length) return false;
  return columnFractions.every((v, i) => sameFraction(saved[i], v));
}

/** Every bottom-row panel in `layout` (percent, by panel id) is already saved. */
export function bottomUnchanged(
  current: StationGeometry | undefined,
  layout: Readonly<Record<string, number>>,
  rightColumnSplit: number,
): boolean {
  const saved = current?.bottomFractions;
  if (!saved || !sameFraction(current?.rightColumnSplit, rightColumnSplit)) return false;
  return Object.entries(layout).every(([id, pct]) => sameFraction(saved[id], pct / 100));
}

/**
 * The value `compute` returned the last time `key` changed. Panel sizes are
 * keyed by the visible panel ids: they are recomputed when a panel is shown
 * or hidden (the panels remount and read `defaultSize` again), and stay put
 * while the user drags or the layout is saved.
 */
export function useSnapshot<T>(key: string, compute: () => T): T {
  const ref = useRef<{ key: string; value: T } | null>(null);
  if (ref.current === null || ref.current.key !== key) {
    ref.current = { key, value: compute() };
  }
  return ref.current.value;
}
