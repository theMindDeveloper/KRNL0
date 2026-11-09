// Align to grid — an invisible grid, like "Align icons to grid" on a desktop.
//
// When it is on (Settings → Canvas, `krnl settings grid on`), anything you
// drop on the canvas settles on the grid: its top-left corner goes to the
// nearest grid point (every 80 px — strict on purpose, so lining up is easy). If that spot would put it
// on top of something, it goes to the nearest free spot instead — never more
// than a few cells away. Turning it on tidies what is already there the same
// way, in reading order. Nothing shows on screen; things just line up.
//
// Pure geometry: CanvasFlow feeds it the measured boxes and applies the result.

// 80 px: few spots, so things line up easily. A task card (220 × 120) takes
// three columns and two rows, so cards side by side keep an even 20 px gap
// and rows 40 px; every second step meets the canvas's big dots (160 px).
export const GRID = 80;
/** Free space kept around a box so cards never touch. */
export const GAP = 8;
/** How far (in cells) a box may be moved to find a free spot. */
const MAX_RING = 12;

export interface Box { x: number; y: number; w: number; h: number }

export type GridScope = 'cards' | 'all';
/** The board's cards (a plan, a habit, an event); 'cards' snaps only these. */
const CARD_KINDS: ReadonlySet<string> = new Set(['todo.task', 'habit.lane']);
/**
 * The board's setting as a scope. Cards only is the default: a board saved by
 * the first build (`alignGrid: true`) reads as cards only, never everything.
 */
export function gridScopeOf(value: unknown): GridScope | null {
  if (value === 'all') return 'all';
  if (value === 'cards' || value === true) return 'cards';
  return null;
}

/** Does the grid apply to this kind? Windows (mothers) never move. */
export function onGrid(scope: GridScope | null | undefined, kind: string | undefined, isMother = false): boolean {
  if (!scope || isMother || !kind) return false;
  return scope === 'all' || CARD_KINDS.has(kind);
}

export const snap = (v: number): number => Math.round(v / GRID) * GRID;

function hits(a: Box, b: Box): boolean {
  return a.x < b.x + b.w + GAP && a.x + a.w + GAP > b.x && a.y < b.y + b.h + GAP && a.y + a.h + GAP > b.y;
}

/**
 * Where `box` lands: the nearest grid point to where it was dropped that does
 * not overlap any obstacle. Falls back to the plain snapped point if the
 * neighbourhood is full.
 */
export function landing(box: Box, obstacles: readonly Box[]): { x: number; y: number } {
  const sx = snap(box.x);
  const sy = snap(box.y);
  const free = (x: number, y: number) => !obstacles.some((o) => hits({ x, y, w: box.w, h: box.h }, o));
  if (free(sx, sy)) return { x: sx, y: sy };
  // Every grid point within MAX_RING cells, nearest to the drop first.
  let best = null as { x: number; y: number; d: number } | null;
  for (let ring = 1; ring <= MAX_RING; ring++) {
    for (let i = -ring; i <= ring; i++) {
      for (let j = -ring; j <= ring; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue; // the ring's edge only
        const x = sx + i * GRID;
        const y = sy + j * GRID;
        if (!free(x, y)) continue;
        const d = (x - box.x) ** 2 + (y - box.y) ** 2;
        if (!best || d < best.d) best = { x, y, d };
      }
    }
    // A spot on this ring is always nearer than any on the next ring but one.
    if (best && Math.sqrt(best.d) <= (ring + 0.5) * GRID) break;
  }
  return best ? { x: best.x, y: best.y } : { x: sx, y: sy };
}

export interface AlignItem { id: string; box: Box; movable: boolean }

/**
 * Tidy everything at once (when the grid is turned on): fixed things stay,
 * movable ones are placed in reading order (top band first, then left to
 * right), each on its nearest free grid spot. Only moved ids are returned.
 */
export function alignAll(items: readonly AlignItem[]): Map<string, { x: number; y: number }> {
  const placed: Box[] = items.filter((i) => !i.movable).map((i) => i.box);
  const order = items.filter((i) => i.movable)
    .sort((a, b) => Math.round(a.box.y / GRID) - Math.round(b.box.y / GRID) || a.box.x - b.box.x);
  const out = new Map<string, { x: number; y: number }>();
  for (const it of order) {
    const p = landing(it.box, placed);
    placed.push({ ...it.box, x: p.x, y: p.y });
    if (p.x !== it.box.x || p.y !== it.box.y) out.set(it.id, p);
  }
  return out;
}
