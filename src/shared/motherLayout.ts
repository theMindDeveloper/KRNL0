// Decision 60 — the Calendar window can be resized on the Free canvas, and the
// fixed windows (the "mothers", one row at y = 0) never overlap because of it.
//
// A window's size lives on the node (`config.canvasSize`, synced like its
// position); without one it is the standard 540 × 540. Resizing the Calendar,
// swapping two windows or moving one along the row lays the row out again,
// left to right, each window starting a gap after the one before it. Notes
// below a window that grew taller move down with it.
//
// Pure: used by the board store (the window) and the `krnl window size`
// command (the CLI), so both write the same board.

export const MOTHER_SIZE = 540;
export const MOTHER_GAP = 20;
/** Which windows can be resized (the owner: "at least the calendar"). */
export const RESIZABLE_MOTHERS: ReadonlySet<string> = new Set(['calendar']);
export const MOTHER_MIN = { width: 420, height: 360 } as const;
export const MOTHER_MAX = { width: 1800, height: 1400 } as const;

interface LayoutNode {
  id: string;
  kind: string;
  isMother?: boolean;
  position: { x: number; y: number };
  config?: unknown;
  state?: unknown;
  canvasId?: string;
}

/** A window's size on the canvas. */
export function motherSizeOf(n: LayoutNode): { width: number; height: number } {
  const s = (n.config as { canvasSize?: { width?: unknown; height?: unknown } } | undefined)?.canvasSize;
  const w = typeof s?.width === 'number' && Number.isFinite(s.width) ? s.width : MOTHER_SIZE;
  const h = typeof s?.height === 'number' && Number.isFinite(s.height) ? s.height : MOTHER_SIZE;
  return { width: w, height: h };
}

export function clampMotherSize(width: number, height: number): { width: number; height: number } {
  const snap = (v: number) => Math.round(v / 10) * 10;
  return {
    width: Math.min(MOTHER_MAX.width, Math.max(MOTHER_MIN.width, snap(width))),
    height: Math.min(MOTHER_MAX.height, Math.max(MOTHER_MIN.height, snap(height))),
  };
}

/**
 * The row of windows laid out again: in their order along x, the first keeps
 * its place and each next one starts a gap after the one before. Only the
 * windows on the row (same y as most of them) move; nodes that are not windows
 * never do here.
 */
export function reflowMotherRow<T extends LayoutNode>(nodes: readonly T[]): T[] {
  const mothers = nodes.filter((n) => n.isMother);
  if (mothers.length < 2) return nodes.slice();
  // The row's y: the most common one (older boards put them all at 0).
  const counts = new Map<number, number>();
  for (const m of mothers) counts.set(m.position.y, (counts.get(m.position.y) ?? 0) + 1);
  const rowY = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  const row = mothers.filter((m) => m.position.y === rowY).sort((a, b) => a.position.x - b.position.x);
  const nextX = new Map<string, number>();
  let x = row[0]!.position.x;
  for (const m of row) {
    nextX.set(m.id, x);
    x += motherSizeOf(m).width + MOTHER_GAP;
  }
  return nodes.map((n) => {
    const nx = nextX.get(n.id);
    return nx === undefined || nx === n.position.x ? n : { ...n, position: { x: nx, y: n.position.y } };
  });
}

/**
 * A window resized: its new size on the node, the row laid out again, and the
 * notes right below it (on its canvas, under its old bottom edge, across its
 * width) moved down by what it grew. Shrinking pulls nothing up.
 */
export function resizeMotherIn<T extends LayoutNode>(nodes: readonly T[], id: string, width: number, height: number): T[] {
  const target = nodes.find((n) => n.id === id);
  if (!target || !target.isMother) return nodes.slice();
  const old = motherSizeOf(target);
  const next = clampMotherSize(width, height);
  if (next.width === old.width && next.height === old.height) return nodes.slice();
  const dh = next.height - old.height;
  const left = target.position.x;
  const right = target.position.x + Math.max(old.width, next.width);
  const oldBottom = target.position.y + old.height;
  const moved = nodes.map((n) => {
    if (n.id === id) return { ...n, config: { ...((n.config as Record<string, unknown> | undefined) ?? {}), canvasSize: next } };
    if (dh > 0 && !n.isMother && n.canvasId === target.canvasId && n.position.y >= oldBottom - 1) {
      const w = (n.state as { width?: number } | undefined)?.width ?? 220;
      if (n.position.x < right && n.position.x + w > left) return { ...n, position: { x: n.position.x, y: n.position.y + dh } };
    }
    return n;
  });
  return reflowMotherRow(moved);
}
