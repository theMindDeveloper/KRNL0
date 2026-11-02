// Readable parallel tasks — decides which overlapping task blocks get their own
// lane in a Calendar day column, and which collapse into a "+N" chip.
//
// The lane packer (store/laneLayout.ts) puts every task of an overlap cluster
// side by side. In a narrow week column that makes 4–5 parallel tasks thin,
// unreadable slivers. Up to MIN_SIDE_BY_SIDE parallel tasks always sit side by
// side (each block stays visible and clickable, a narrow one shows its title
// vertically). Beyond that, lanes are capped at what fits at a readable width:
//   - lanes ≥ 2: the first (maxLanes − 1) lanes show; the rest collapse into a
//     chip in the last lane.
//   - lanes = 1 (a column narrower than two readable lanes): lane 0 shows at
//     full width and the rest collapse into a compact chip pinned to the
//     block's top-right corner.
// Text rule (docs/04-visual-system/design-tokens.md): a block is never
// narrower than MIN_LANE_PX, so its title always fits with an inset on both
// sides and ellipsizes instead of touching the edge.

/** Narrowest lane that still carries a readable, ellipsized title. */
export const MIN_LANE_PX = 64;
/** Parallel tasks that always get their own lane, however narrow the column. */
export const MIN_SIDE_BY_SIDE = 4;
/** Padding between block text and the block edge (both sides). */
export const BLOCK_TEXT_INSET = 4;

export interface LanePlacement {
  colIndex: number;
  colCount: number;
  span: number;
}

export interface DayBlockSlice {
  id: string;
  startMin: number;
  endMin: number;
}

export interface OverflowGroup<T extends DayBlockSlice> {
  startMin: number;
  slices: T[];
  /** Fraction of the plan area where the chip starts (lane mode). */
  leftFrac: number;
  /** True when the column has a single lane: the chip overlays the block's corner. */
  compact: boolean;
}

export interface DayBlockLayout<T extends DayBlockSlice> {
  maxLanes: number;
  placements: Map<string, LanePlacement>;
  hidden: Set<string>;
  overflow: OverflowGroup<T>[];
}

/** Lanes that fit in a plan area `planPx` wide. Always at least 1. */
export function readableLaneCount(planPx: number, minLanePx = MIN_LANE_PX): number {
  if (!Number.isFinite(planPx) || planPx <= 0) return 1;
  return Math.max(1, Math.floor(planPx / minLanePx));
}

export function layoutDayBlocks<T extends DayBlockSlice>(
  slices: readonly T[],
  raw: ReadonlyMap<string, LanePlacement>,
  planPx: number,
  minLanePx = MIN_LANE_PX,
): DayBlockLayout<T> {
  const maxLanes = Math.max(MIN_SIDE_BY_SIDE, readableLaneCount(planPx, minLanePx));
  const placements = new Map<string, LanePlacement>();
  const hiddenSlices: T[] = [];
  for (const sl of slices) {
    const pl = raw.get(sl.id) ?? { colIndex: 0, colCount: 1, span: 1 };
    if (pl.colCount <= maxLanes) {
      placements.set(sl.id, pl);
    } else if (maxLanes === 1) {
      if (pl.colIndex === 0) placements.set(sl.id, { colIndex: 0, colCount: 1, span: 1 });
      else hiddenSlices.push(sl);
    } else if (pl.colIndex >= maxLanes - 1) {
      hiddenSlices.push(sl);
    } else {
      placements.set(sl.id, {
        colIndex: pl.colIndex,
        colCount: maxLanes,
        span: Math.max(1, Math.min(pl.span, maxLanes - 1 - pl.colIndex)),
      });
    }
  }

  // One chip per run of hidden slices that overlap in time.
  const groups: T[][] = [];
  for (const sl of [...hiddenSlices].sort((a, b) => a.startMin - b.startMin)) {
    const last = groups[groups.length - 1];
    const lastEnd = last ? Math.max(...last.map((x) => x.endMin)) : -1;
    if (last && sl.startMin < lastEnd) last.push(sl);
    else groups.push([sl]);
  }
  const compact = maxLanes === 1;
  const overflow = groups.map((g) => ({
    startMin: g[0]!.startMin,
    slices: g,
    leftFrac: compact ? 0 : (maxLanes - 1) / maxLanes,
    compact,
  }));

  return { maxLanes, placements, hidden: new Set(hiddenSlices.map((s) => s.id)), overflow };
}
