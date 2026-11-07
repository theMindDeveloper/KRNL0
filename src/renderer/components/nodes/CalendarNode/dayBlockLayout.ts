// Readable parallel tasks — decides which overlapping task blocks sit side by
// side in a Calendar day column, and which clashes become a shelf.
//
// The lane packer (store/laneLayout.ts) puts every task of an overlap cluster
// side by side. In a narrow week column that makes parallel tasks thin,
// cut-off slivers. So lanes are only what fits at a readable width
// (READABLE_LANE_PX), capped per view (week 2, day 4 — LANE_CAP). Text is
// never rotated.
//
// A clash that needs more lanes than fit becomes a SHELF (calendar-clock-
// visuals.md F28): one block over the clash's whole time span with one named
// row per plan. Nothing is hidden behind a count — every plan stays readable,
// clickable and draggable (the old "+N" chip hid them, and a hidden plan could
// not be dragged).
// Text rule (docs/04-visual-system/design-tokens.md): a block is never
// narrower than MIN_LANE_PX, so its title always fits with an inset on both
// sides and ellipsizes instead of touching the edge.

/** Narrowest lane that still carries a readable, ellipsized title. */
export const MIN_LANE_PX = 64;
/**
 * Narrowest lane worth drawing side by side: a usual plan name ("Read chapter B")
 * fits whole. A clash whose lanes would be narrower becomes a shelf (F28).
 */
export const READABLE_LANE_PX = 96;
/** Most lanes a day column shows: the week is an overview, the day has room. */
export const LANE_CAP = { week: 2, day: 4 } as const;
/** Padding between block text and the block edge (both sides). */
export const BLOCK_TEXT_INSET = 4;
/** Shelf geometry (px): header row, one row per plan, bottom padding. */
export const SHELF_HEAD_PX = 20;
export const SHELF_ROW_PX = 21;
export const SHELF_PAD_PX = 5;

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

/** A clash shown as one block with a row per plan. */
export interface ShelfGroup<T extends DayBlockSlice> {
  startMin: number;
  endMin: number;
  /** In start order (then shorter first, then id). */
  slices: T[];
}

export interface DayBlockLayout<T extends DayBlockSlice> {
  maxLanes: number;
  placements: Map<string, LanePlacement>;
  /** Ids drawn inside a shelf instead of as their own block. */
  inShelf: Set<string>;
  shelves: ShelfGroup<T>[];
}

/** Lanes that fit in a plan area `planPx` wide. Always at least 1. */
export function readableLaneCount(planPx: number, minLanePx = MIN_LANE_PX): number {
  if (!Number.isFinite(planPx) || planPx <= 0) return 1;
  return Math.max(1, Math.floor(planPx / minLanePx));
}

/** Height a shelf needs to show all its rows. */
export function shelfNeedPx(rows: number): number {
  return SHELF_HEAD_PX + rows * SHELF_ROW_PX + SHELF_PAD_PX;
}

/**
 * `minSpanMin`: the shortest a block is drawn (in minutes), so two short
 * plans that touch on screen count as one clash, as the lane packer does.
 */
export function layoutDayBlocks<T extends DayBlockSlice>(
  slices: readonly T[],
  raw: ReadonlyMap<string, LanePlacement>,
  planPx: number,
  minLanePx = MIN_LANE_PX,
  cap: number = LANE_CAP.day,
  minSpanMin = 0,
): DayBlockLayout<T> {
  const maxLanes = Math.max(1, Math.min(cap, readableLaneCount(planPx, minLanePx)));
  const drawnEnd = (s: T) => Math.max(s.endMin, s.startMin + minSpanMin);
  const order = (a: T, b: T) => a.startMin - b.startMin || (a.endMin - a.startMin) - (b.endMin - b.startMin) || a.id.localeCompare(b.id);

  // Overlap clusters (a run of slices that touch on screen).
  const clusters: T[][] = [];
  let clusterEnd = -Infinity;
  for (const sl of [...slices].sort(order)) {
    const last = clusters[clusters.length - 1];
    if (last && sl.startMin < clusterEnd) {
      last.push(sl);
      clusterEnd = Math.max(clusterEnd, drawnEnd(sl));
    } else {
      clusters.push([sl]);
      clusterEnd = drawnEnd(sl);
    }
  }

  const placements = new Map<string, LanePlacement>();
  const shelves: ShelfGroup<T>[] = [];
  const inShelf = new Set<string>();
  for (const cl of clusters) {
    const lanes = Math.max(...cl.map((sl) => raw.get(sl.id)?.colCount ?? 1));
    if (cl.length > 1 && lanes > maxLanes) {
      shelves.push({ startMin: cl[0]!.startMin, endMin: Math.max(...cl.map((s) => s.endMin)), slices: cl });
      for (const sl of cl) inShelf.add(sl.id);
    } else if (cl.length === 1) {
      // Alone in its time: the whole width, whatever the packer counted.
      placements.set(cl[0]!.id, { colIndex: 0, colCount: 1, span: 1 });
    } else {
      for (const sl of cl) placements.set(sl.id, raw.get(sl.id) ?? { colIndex: 0, colCount: 1, span: 1 });
    }
  }
  return { maxLanes, placements, inShelf, shelves };
}
