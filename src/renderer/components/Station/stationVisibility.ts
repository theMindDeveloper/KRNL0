/**
 * stationVisibility — whether a mother panel is hidden in Station mode.
 * Lives in its own module so lightweight callers (StationToolbar, which the
 * TopBar can host — ADR 0009 F9) don't pull in the whole StationLayout tree.
 */

import type { MotherNodeConfig } from '../../../shared/types';
import type { Node } from '../../../shared/types/node';

// Terminal mother is default-hidden across every dock variant — users opt in
// via the StationToolbar toggle. Other mothers (Analytics included) stay
// default-visible.
export function isStationHidden(node: Node | undefined): boolean {
  if (!node) return true; // missing == hidden
  const cfg = (node.config ?? {}) as MotherNodeConfig;
  if (cfg.stationHidden !== undefined) return !!cfg.stationHidden;
  if (node.kind === 'term') return true;
  return false;
}
