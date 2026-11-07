// Readable parallel tasks — decides which overlapping task blocks sit side by
// side with their names, and which clashes become slim letter bars.
//
// The lane packer (store/laneLayout.ts) puts every task of an overlap cluster
// side by side. In a narrow week column that makes parallel tasks thin,
// cut-off slivers. So lanes are only what fits at a readable width
// (READABLE_LANE_PX), capped per view (week 2, day 4 — LANE_CAP). Text is
// never rotated.
//
// A clash whose lanes would be narrower than that keeps every plan as its own
// slim bar at its real time, named by a letter (calendar-clock-visuals.md F28,
// clashLabels.ts). Nothing is folded away behind a count, so every plan stays
// clickable and draggable.
// Text rule (docs/04-visual-system/design-tokens.md): a name is drawn only
// where it fits whole; a letter bar carries its letter, the name is in the
// tooltip and the popup.

/** Narrowest lane that still carries a readable, ellipsized title. */
export const MIN_LANE_PX = 64;
/**
 * Narrowest lane worth drawing side by side: a usual plan name ("Read chapter B")
 * fits whole. A clash whose lanes would be narrower becomes letter bars (F28).
 */
export const READABLE_LANE_PX = 96;
/** Most lanes a day column shows: the week is an overview, the day has room. */
export const LANE_CAP = { week: 2, day: 4 } as const;
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

/** A clash drawn as letter bars (lanes too narrow for names). */
export interface ClashGroup<T extends DayBlockSlice> {
  startMin: number;
  endMin: number;
  /** In start order (then shorter first, then id). */
  slices: T[];
}

export interface DayBlockLayout<T extends DayBlockSlice> {
  maxLanes: number;
  placements: Map<string, LanePlacement>;
  /** Ids drawn as letter bars. */
  lettered: Set<string>;
  clashes: ClashGroup<T>[];
}

/** Lanes that fit in a plan area `planPx` wide. Always at least 1. */
export function readableLaneCount(planPx: number, minLanePx = MIN_LANE_PX): number {
  if (!Number.isFinite(planPx) || planPx <= 0) return 1;
  return Math.max(1, Math.floor(planPx / minLanePx));
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
  const clashes: ClashGroup<T>[] = [];
  const lettered = new Set<string>();
  for (const cl of clusters) {
    if (cl.length === 1) {
      // Alone in its time: the whole width, whatever the packer counted.
      placements.set(cl[0]!.id, { colIndex: 0, colCount: 1, span: 1 });
      continue;
    }
    // Every plan of a clash keeps its lane (the packer's columns).
    for (const sl of cl) placements.set(sl.id, raw.get(sl.id) ?? { colIndex: 0, colCount: 1, span: 1 });
    const lanes = Math.max(...cl.map((sl) => raw.get(sl.id)?.colCount ?? 1));
    if (lanes > maxLanes) {
      clashes.push({ startMin: cl[0]!.startMin, endMin: Math.max(...cl.map((x) => x.endMin)), slices: cl });
      for (const sl of cl) lettered.add(sl.id);
    }
  }
  return { maxLanes, placements, lettered, clashes };
}
