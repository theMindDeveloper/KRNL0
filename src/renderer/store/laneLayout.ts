// Lane packing for overlapping time blocks — shared by the Calendar (columns
// inside a day) and the Clock (concentric rings), so both surfaces agree on
// which tasks run in parallel.
//
// 1. Intervals that overlap (directly or through a chain of overlaps) form a
//    cluster.
// 2. Inside a cluster each interval takes the first lane that is free at its
//    start (greedy, sorted by start then longer-first).
// 3. Every interval in a cluster reports the cluster's lane count, so widths
//    are consistent across the cluster (the old per-block count made blocks in
//    the same cluster different widths).
// 4. `span` lets a block widen into lanes to its right that stay free for its
//    whole interval, so a lone late block in a busy cluster isn't a sliver.

export interface LaneInput {
  id: string;
  start: number; // any monotonic unit (minutes, ms)
  end: number;
}

export interface LanePlacement {
  lane: number;      // 0-based
  laneCount: number; // lanes in this interval's cluster
  span: number;      // lanes this interval may occupy, starting at `lane` (≥1)
}

export function packLanes(items: readonly LaneInput[]): Map<string, LanePlacement> {
  const out = new Map<string, LanePlacement>();
  const sorted = items
    .map((it) => ({ ...it, end: Math.max(it.end, it.start + 1e-9) }))
    .sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start) || a.id.localeCompare(b.id));

  let cluster: Array<{ id: string; start: number; end: number; lane: number }> = [];
  let clusterEnd = -Infinity;
  let laneEnds: number[] = [];

  const flush = () => {
    const laneCount = laneEnds.length;
    for (const c of cluster) {
      let span = 1;
      for (let l = c.lane + 1; l < laneCount; l++) {
        const blocked = cluster.some((o) => o.lane === l && o.start < c.end && c.start < o.end);
        if (blocked) break;
        span++;
      }
      out.set(c.id, { lane: c.lane, laneCount, span });
    }
    cluster = [];
    laneEnds = [];
    clusterEnd = -Infinity;
  };

  for (const it of sorted) {
    if (cluster.length > 0 && it.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= it.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(it.end);
    } else {
      laneEnds[lane] = it.end;
    }
    cluster.push({ id: it.id, start: it.start, end: it.end, lane });
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  if (cluster.length > 0) flush();
  return out;
}
