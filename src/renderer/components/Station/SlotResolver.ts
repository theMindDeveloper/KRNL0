/**
 * SlotResolver — maps mother-node config.stationSlot to the correct station
 * column, and provides default panel sizes per slot.
 *
 * ADR 0008 § 4.2 / § 9.1 OQ-1.A (architect decision A: Habit gets its own column).
 *
 * Slot assignments (from migration and seedBoard):
 *   pomo     → top-left           (top row, col 1)
 *   todo     → top-center         (top row, col 2)
 *   habit    → top-right-pre      (top row, col 3)
 *   calendar → top-right-upper    (top row, col 4 — rightmost)
 *   clock    → top-right-lower    (bottom row, right column beside Canvas)
 *   term     → bottom-strip       (not rendered in station mode)
 *
 * Layout structure (matches user-provided sketch):
 *   ┌─ DOCK TOP ─────────────────────────────────────┐
 *   │ Pomo │ Todo │ Habit │ Calendar                  │
 *   ├──────┴──────┴───────┴─────────────────┬────────┤
 *   │         Embedded Canvas               │ Clock  │
 *   └─ DOCK BOTTOM ──────────────────────────────────┘
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
  // Outer row split: top row (mothers) vs bottom row (canvas + clock).
  // Defaults to 35/65 — mothers fit comfortably without big empty space
  // below (Pomo / Todo / Habit cards have natural heights ~280px) and the
  // canvas gets the lion's share. User can drag the splitter to taste.
  rowPercent: 35,
  canvasPercent: 65,
  // Top-row column widths (must sum to 100): 4 equal columns
  columns: {
    'top-left':        25,   // Pomo
    'top-center':      25,   // Todo
    'top-right-pre':   25,   // Habit
    'top-right-upper': 25,   // Calendar
  },
  // Bottom-row column widths (must sum to 100): canvas + terminal + clock
  bottom: {
    canvas:   60,   // Embedded canvas — widest
    terminal: 15,   // Terminal — hideable via right-click
    clock:    25,   // Clock — mirrors top-row Calendar's column width
  },
  // Minimum sizes (percent)
  minRow:    18,
  minCanvas: 30,
  minColumn: 14,
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
