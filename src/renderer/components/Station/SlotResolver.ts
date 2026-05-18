/**
 * SlotResolver — maps mother-node config.stationSlot to the correct station
 * column, and provides default panel sizes per slot.
 *
 * ADR 0008 § 4.2 / § 9.1 OQ-1.A (architect decision A: Habit gets its own column).
 *
 * Slot assignments (from migration and seedBoard):
 *   pomo     → top-left
 *   todo     → top-center
 *   habit    → top-right-pre   (own column, 4-column layout with right rail)
 *   calendar → top-right-upper
 *   clock    → top-right-lower
 *   term     → bottom-strip
 */

import type { StationSlot } from '../../../shared/types';
import type { Node } from '../../../shared/types/node';
import type { MotherNodeConfig } from '../../../shared/types/board';

/**
 * Read stationSlot from a mother node's config.
 * Returns undefined if the node lacks isMother or stationSlot.
 */
export function resolveStationSlot(node: Node): StationSlot | undefined {
  if (!node.isMother) return undefined;
  const cfg = node.config as MotherNodeConfig | null | undefined;
  return cfg?.stationSlot;
}

// Default panel sizes for the react-resizable-panels API.
// Stored as percentage values (0–100) as required by the library.
export const SLOT_DEFAULTS = {
  // Outer row: top row fraction vs canvas fraction (percent)
  rowPercent: 50,
  canvasPercent: 50,
  // Column widths inside the top row (must sum to 100)
  columns: {
    'top-left':        22,   // Pomo
    'top-center':      30,   // Todo
    'top-right-pre':   22,   // Habit
    'right-rail':      26,   // Calendar + Clock stacked
  },
  // Right-rail split: calendar (upper) vs clock (lower)
  rightColumn: {
    upper: 55,   // Calendar
    lower: 45,   // Clock
  },
  // Minimum sizes (percent) — enforces NF6 minimum column floor
  minRow:        20,
  minCanvas:     40,
  minColumn:     18,
  minColumnWide: 20,   // for top-center (Todo)
  minRailCell:   30,
} as const;

// 1-based slot index for the badge label. Mirrors canvas-mode sort order.
export const SLOT_INDEX: Record<StationSlot, number> = {
  'top-left':         1,
  'top-center':       2,
  'top-right-pre':    3,
  'top-right-upper':  4,
  'top-right-lower':  5,
  'bottom-strip':     6,
};
