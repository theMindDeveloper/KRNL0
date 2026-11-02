/**
 * stationVisibility — whether a mother panel is hidden in Station mode.
 * Lives in its own module so lightweight callers (StationToolbar, which the
 * TopBar can host — ADR 0009 F9) don't pull in the whole StationLayout tree.
 */

import type { MotherNodeConfig } from '../../../shared/types';
import type { Node } from '../../../shared/types/node';

// Terminal and Analytics mothers are default-hidden across every dock variant —
// users opt in via the StationToolbar toggle. Analytics takes the canvas panel
// when shown (Decision 32), so showing it by default would hide the canvas.
// Other mothers stay default-visible.
export function isStationHidden(node: Node | undefined): boolean {
  if (!node) return true; // missing == hidden
  const cfg = (node.config ?? {}) as MotherNodeConfig;
  if (cfg.stationHidden !== undefined) return !!cfg.stationHidden;
  if (node.kind === 'term' || node.kind === 'analytics') return true;
  return false;
}
