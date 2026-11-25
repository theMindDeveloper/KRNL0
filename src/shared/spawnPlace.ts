// Where a new node lands when the app picks the place (owner, 2026-11-25:
// "make sure new nodes do not spawn on mother nodes and overlap too").
//
// Every automatic spawn (a task added in Todo or the terminal, a subtask, the
// next task, a habit card, a note from the Synthesizer) asks for its usual
// spot first. If that spot touches a window of the row or another card on the
// same canvas, the node goes to the nearest free spot beside, under or above
// what is in the way. A place the user picks by hand (drop, paste) is kept.
//
// The windows are taken where the canvas draws them (render-only row, see
// CanvasFlow + motherLayout.ts), not at their saved positions.
//
// Pure: used by the renderer's spawn paths and by the sys CLI.

import { MOTHER_ROW_START_X, motherRowXs, motherSizeOf } from './motherLayout';

export interface PlaceNode {
  id: string;
  kind: string;
  position?: { x: number; y: number };
  isMother?: boolean;
  canvasId?: unknown;
  state?: unknown;
  config?: unknown;
}

export interface Box { x: number; y: number; w: number; h: number }

/** Cards closer than this count as touching. */
export const MIN_GAP = 16;
/** Space left between a moved node and what was in its way. */
export const PLACE_GAP = 40;

const SIZE_BY_KIND: Readonly<Record<string, { w: number; h: number }>> = {
  'todo.task': { w: 220, h: 140 },
  'habit.lane': { w: 240, h: 150 },
  text: { w: 280, h: 140 },
  image: { w: 320, h: 240 },
  media: { w: 360, h: 240 },
};
const DEFAULT_SIZE = { w: 240, h: 150 };

const posOf = (n: PlaceNode): { x: number; y: number } => n.position ?? { x: 0, y: 0 };
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

/** A card's box on the canvas (its own width / height when it has them). */
export function boxOf(n: PlaceNode): Box {
  const s = (n.state ?? {}) as { width?: unknown; height?: unknown };
  const c = (n.config ?? {}) as { width?: unknown; height?: unknown };
  const d = SIZE_BY_KIND[n.kind] ?? DEFAULT_SIZE;
  return { x: posOf(n).x, y: posOf(n).y, w: num(s.width) ?? num(c.width) ?? d.w, h: num(s.height) ?? num(c.height) ?? d.h };
}

/** Station's hidden-window rule without the renderer (the CLI's view). */
export const defaultHidden = (n: PlaceNode): boolean => {
  const cfg = (n.config ?? {}) as { stationHidden?: unknown };
  if (cfg.stationHidden !== undefined) return !!cfg.stationHidden;
  return n.kind === 'term';
};

/** The height most windows of the row share (the row's y; motherRow.ts). */
export function motherRowYOf(nodes: readonly PlaceNode[]): number {
  const counts = new Map<number, number>();
  for (const n of nodes) if (n.isMother) counts.set(posOf(n).y, (counts.get(posOf(n).y) ?? 0) + 1);
  if (counts.size === 0) return 0;
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
}

/** The windows of the row where the canvas draws them. */
export function drawnMotherBoxes(nodes: readonly PlaceNode[], isHidden: (n: PlaceNode) => boolean = defaultHidden): Box[] {
  const row = nodes.filter((n) => n.isMother && !isHidden(n)).slice().sort((a, b) => posOf(a).x - posOf(b).x);
  if (row.length === 0) return [];
  const startX = Math.min(...row.map((n) => posOf(n).x), MOTHER_ROW_START_X);
  const xs = motherRowXs(row, startX);
  const y = motherRowYOf(nodes);
  return row.map((n) => { const s = motherSizeOf(n); return { x: xs.get(n.id)!, y, w: s.width, h: s.height }; });
}

const touches = (a: Box, b: Box, gap: number): boolean =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

/** The nearest spot for `want` that touches none of `obstacles` (itself when it is free). */
export function clearSpot(obstacles: readonly Box[], want: Box): { x: number; y: number } {
  const free = (b: Box): boolean => !obstacles.some((o) => touches(b, o, MIN_GAP));
  if (free(want)) return { x: want.x, y: want.y };
  const dist = (b: Box): number => Math.hypot(b.x - want.x, b.y - want.y);
  const seen = new Set<string>([`${want.x},${want.y}`]);
  let frontier: Box[] = [want];
  let best = null as Box | null;
  for (let depth = 0; depth < 5 && frontier.length; depth++) {
    const next: Box[] = [];
    for (const c of frontier) {
      for (const o of obstacles) {
        if (!touches(c, o, MIN_GAP)) continue;
        // Right of, left of, under and above what is in the way.
        for (const p of [
          { x: o.x + o.w + PLACE_GAP, y: c.y },
          { x: o.x - c.w - PLACE_GAP, y: c.y },
          { x: c.x, y: o.y + o.h + PLACE_GAP },
          { x: c.x, y: o.y - c.h - PLACE_GAP },
        ]) {
          const key = `${p.x},${p.y}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const b = { ...c, ...p };
          if (free(b)) { if (!best || dist(b) < dist(best)) best = b; }
          else next.push(b);
        }
      }
    }
    // A free spot nearer than any blocked one cannot get beaten by going deeper.
    next.sort((a, b) => dist(a) - dist(b));
    if (best && (next.length === 0 || dist(best) <= dist(next[0]!))) break;
    frontier = next.slice(0, 48);
  }
  return best ? { x: best.x, y: best.y } : { x: want.x, y: want.y };
}

/**
 * `node` at the nearest free spot to its own position: off every drawn window
 * and every card on its canvas (frames hold cards, so they are not in the way).
 */
export function placeClear<T extends PlaceNode>(nodes: readonly PlaceNode[], node: T, isHidden?: (n: PlaceNode) => boolean): T {
  const obstacles: Box[] = drawnMotherBoxes(nodes, isHidden);
  for (const n of nodes) {
    if (n.isMother || n.id === node.id || n.kind === 'frame') continue;
    if (node.canvasId && n.canvasId && n.canvasId !== node.canvasId) continue;
    obstacles.push(boxOf(n));
  }
  const at = clearSpot(obstacles, boxOf(node));
  const was = posOf(node);
  return at.x === was.x && at.y === was.y ? node : { ...node, position: at };
}

/** The same for the CLI's loosely typed boards (text / image add). */
export function placeClearLoose<T extends Record<string, unknown>>(nodes: readonly Record<string, unknown>[], node: T): T {
  return placeClear(nodes as unknown as PlaceNode[], node as unknown as PlaceNode) as unknown as T;
}
