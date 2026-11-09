// Decision 39 — routines that overlap on a day sit side by side, one lane
// each, so their bands and names never draw on top of each other.

export interface LaneSpan {
  id: string;
  startMin: number;
  endMin: number;
}

export interface Lane {
  /** 0-based lane, left to right. */
  lane: number;
  /** Lanes in this span's overlap group (its width is 1 / lanes). */
  lanes: number;
}

/**
 * Groups spans that overlap (directly or through a chain) and gives each a
 * lane: the first free lane, in start order. Spans that only touch (one ends
 * as the next starts) do not overlap.
 */
export function routineLanes(spans: readonly LaneSpan[]): Map<string, Lane> {
  const out = new Map<string, Lane>();
  const sorted = [...spans].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin || a.id.localeCompare(b.id));
  let group: Array<{ id: string; lane: number }> = [];
  let laneEnds: number[] = [];
  let groupEnd = -1;
  const close = () => {
    for (const g of group) out.set(g.id, { lane: g.lane, lanes: laneEnds.length });
    group = [];
    laneEnds = [];
  };
  for (const s of sorted) {
    if (group.length && s.startMin >= groupEnd) close();
    let lane = laneEnds.findIndex((end) => end <= s.startMin);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(s.endMin); } else laneEnds[lane] = s.endMin;
    group.push({ id: s.id, lane });
    groupEnd = group.length === 1 ? s.endMin : Math.max(groupEnd, s.endMin);
  }
  close();
  return out;
}
