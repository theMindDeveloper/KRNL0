// Where the mother row sits in Canvas mode (render-only; persisted positions
// stay as they are).
//
// Every other node keeps one position in both modes: Station mode's canvas
// panel and Canvas mode show the same flow coordinates. The mothers, which
// Station draws as panels, are the only thing Canvas mode has to place, so
// the row lifts itself above the topmost node. Nothing is ever behind a
// mother window, and switching modes never moves anything.
import type { Node as KrnlNode } from '../../../shared/types/node';
import { tallestMother } from '../../../shared/motherLayout';

export const MOTHER_ROW_HEIGHT = 540;
/** Space between the row and the topmost node (room for the slot badge). */
export const MOTHER_ROW_GAP = 120;
const GRID = 40;

/**
 * Decision 60 — the row stays where it is (the owner, 2026-11-21: a card put
 * beside the resized Calendar sent every window up and away). It sits at the
 * windows' own saved height; notes go wherever you put them.
 */
export function motherRowY(nodes: readonly KrnlNode[]): number {
  void MOTHER_ROW_HEIGHT; void MOTHER_ROW_GAP; void GRID; void tallestMother;
  const counts = new Map<number, number>();
  for (const n of nodes) if (n.isMother) counts.set(n.position.y, (counts.get(n.position.y) ?? 0) + 1);
  if (counts.size === 0) return 0;
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
}
