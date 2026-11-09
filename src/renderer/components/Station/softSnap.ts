// Station soft snap — when you let go of a divider, it clicks onto a line that
// is already there if it ended up close to one: a divider in the other row
// (the Clock's edge under the Calendar's), or where the divider sits by
// default. Only within a few pixels, so it helps when you aim for a line and
// never stops you from putting it anywhere else.
//
// Pure: StationLayout reads both rows' layouts (percent per panel, in order),
// asks for a snapped layout for the row that was just dragged, and applies it.

export type RowLayout = Record<string, number>;

/** Divider positions (percent from the left) of a row, in panel order. */
export function dividers(layout: RowLayout, order: readonly string[]): number[] {
  const out: number[] = [];
  let x = 0;
  for (let i = 0; i < order.length - 1; i++) {
    x += layout[order[i]!] ?? 0;
    out.push(x);
  }
  return out;
}

/**
 * The row's layout with each divider that ended within `threshold` (percent)
 * of a target moved onto it, keeping every panel at or above its minimum.
 * Null when nothing moves (so a snapped layout never snaps again).
 */
export function snapRow(
  layout: RowLayout,
  order: readonly string[],
  targets: readonly number[],
  threshold: number,
  mins: Readonly<Record<string, number>> = {},
): RowLayout | null {
  if (order.length < 2 || targets.length === 0) return null;
  const next: RowLayout = { ...layout };
  let moved = false;
  let x = 0;
  for (let i = 0; i < order.length - 1; i++) {
    const left = order[i]!;
    const right = order[i + 1]!;
    x += next[left] ?? 0;
    let best: number | null = null;
    for (const t of targets) {
      const d = t - x;
      if (Math.abs(d) <= threshold && Math.abs(d) > 0.05 && (best === null || Math.abs(d) < Math.abs(best))) best = d;
    }
    if (best === null) continue;
    const l = (next[left] ?? 0) + best;
    const r = (next[right] ?? 0) - best;
    if (l < (mins[left] ?? 0) || r < (mins[right] ?? 0)) continue;
    next[left] = l;
    next[right] = r;
    x += best;
    moved = true;
  }
  return moved ? next : null;
}

/** How far (in pixels) a divider is pulled onto a line. */
export const SNAP_PX = 14;

/** SNAP_PX as a percent of a row `widthPx` wide. */
export const snapPercent = (widthPx: number): number => (widthPx > 0 ? (SNAP_PX / widthPx) * 100 : 0);
