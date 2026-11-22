// Decision 60 — the Calendar window can be resized on the Free canvas.
//
// The owner's rules (2026-11-21): it grows like a picture (it keeps its square
// shape), never below the standard size the other windows have (540 × 540),
// with a small snap back to that size, and the size stays on this device —
// it is never synced (`config.canvasSize` is a per-device key in sync/shape.ts).
//
// Nothing is moved to make room: the canvas draws the row of windows itself
// (render-only, CanvasFlow), each one a gap after the one before at its own
// width, and lifts the row above the topmost note by the tallest window — so a
// bigger Calendar never covers a window beside it or a note under it, and no
// saved position changes.
//
// Pure: used by the board store (the window) and `krnl window size` (the CLI).

export const MOTHER_SIZE = 540;
export const MOTHER_GAP = 20;
/** Which windows can be resized (the owner: "at least the calendar"). */
export const RESIZABLE_MOTHERS: ReadonlySet<string> = new Set(['calendar']);
export const MOTHER_MIN = { width: MOTHER_SIZE, height: MOTHER_SIZE } as const;
export const MOTHER_MAX = { width: 1400, height: 1400 } as const;
/** Within this much of the smallest or largest size, the window snaps to it. */
export const MOTHER_SNAP = 28;
/** Decision 60 — the Calendar starts at its largest size on the canvas (the owner). */
export const DEFAULT_SIZE_BY_KIND: Readonly<Record<string, number>> = { calendar: 1400 };
const defaultSide = (kind: string): number => DEFAULT_SIZE_BY_KIND[kind] ?? MOTHER_SIZE;

interface LayoutNode {
  id: string;
  kind: string;
  isMother?: boolean;
  config?: unknown;
}

/** A window's size on the canvas (this device). */
export function motherSizeOf(n: LayoutNode): { width: number; height: number } {
  const s = (n.config as { canvasSize?: { width?: unknown; height?: unknown } } | undefined)?.canvasSize;
  const d = defaultSide(n.kind);
  const w = typeof s?.width === 'number' && Number.isFinite(s.width) ? s.width : d;
  const h = typeof s?.height === 'number' && Number.isFinite(s.height) ? s.height : d;
  return { width: w, height: h };
}

/** A size the window may take: square, 540 to 1400, in 10 px steps, snapping to 540 near it. */
export function clampMotherSize(width: number, height: number = width): { width: number; height: number } {
  let side = Math.round(Math.max(width, height) / 10) * 10;
  if (side < MOTHER_SIZE + MOTHER_SNAP) side = MOTHER_SIZE;
  if (side > MOTHER_MAX.width - MOTHER_SNAP) side = MOTHER_MAX.width;
  return { width: side, height: side };
}

/** The board's nodes with one window at a new size (only its own config changes). */
export function resizeMotherIn<T extends LayoutNode>(nodes: readonly T[], id: string, width: number, height?: number): T[] {
  const target = nodes.find((n) => n.id === id);
  if (!target || !target.isMother || !RESIZABLE_MOTHERS.has(target.kind)) return nodes.slice();
  const old = motherSizeOf(target);
  const next = clampMotherSize(width, height ?? width);
  if (next.width === old.width && next.height === old.height) return nodes.slice();
  return nodes.map((n) => {
    if (n.id !== id) return n;
    const cfg = { ...((n.config as Record<string, unknown> | undefined) ?? {}) };
    // Its default size is no size at all: nothing left on the node.
    if (next.width === defaultSide(n.kind)) delete cfg['canvasSize'];
    else cfg['canvasSize'] = next;
    return { ...n, config: cfg };
  });
}

/** The drawn x of each window in the row: from `startX`, each a gap after the one before, at its own width. */
export function motherRowXs(ordered: readonly LayoutNode[], startX: number): Map<string, number> {
  const out = new Map<string, number>();
  let x = startX;
  for (const n of ordered) {
    out.set(n.id, x);
    x += motherSizeOf(n).width + MOTHER_GAP;
  }
  return out;
}

/** The tallest window of the row (the row lifts above the notes by this much). */
export function tallestMother(nodes: readonly LayoutNode[]): number {
  let h = MOTHER_SIZE;
  for (const n of nodes) if (n.isMother) h = Math.max(h, motherSizeOf(n).height);
  return h;
}
