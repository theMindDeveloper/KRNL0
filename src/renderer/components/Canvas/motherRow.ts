// Where the mother row sits in Canvas mode (render-only; persisted positions
// stay as they are).
//
// Every other node keeps one position in both modes: Station mode's canvas
// panel and Canvas mode show the same flow coordinates. The mothers, which
// Station draws as panels, are the only thing Canvas mode has to place, so
// the row lifts itself above the topmost node. Nothing is ever behind a
// mother window, and switching modes never moves anything.
import type { Node as KrnlNode } from '../../../shared/types/node';

export const MOTHER_ROW_HEIGHT = 540;
/** Space between the row and the topmost node (room for the slot badge). */
export const MOTHER_ROW_GAP = 120;
const GRID = 40;

export function motherRowY(nodes: readonly KrnlNode[]): number {
  let top = Infinity;
  for (const n of nodes) {
    if (!n.isMother && n.position.y < top) top = n.position.y;
  }
  if (!Number.isFinite(top)) return 0;
  const y = Math.floor((top - MOTHER_ROW_GAP - MOTHER_ROW_HEIGHT) / GRID) * GRID;
  return Math.min(0, y);
}
