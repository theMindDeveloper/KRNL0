import type { Node } from './node';
import type { Edge } from './edge';

export interface BoardViewport {
  x: number;
  y: number;
  zoom: number;
}

// ADR 0008 — Station Mode layout type. Per-board, persisted to board.json.
export type LayoutMode = 'canvas' | 'station';

// ADR 0008 § 4.2 / § 9.1 (OQ-1.A decision A): Habit gets its own column
// ('top-right-pre') between Todo and the Calendar/Clock right-rail.
// Slot order in the station shell:
//   top-left        → Pomo
//   top-center      → Todo
//   top-right-pre   → Habit   (OQ-1.A, 5-column layout)
//   top-right-upper → Calendar
//   top-right-lower → Clock
//   bottom-strip    → Term
export type StationSlot =
  | 'top-left'
  | 'top-center'
  | 'top-right-pre'
  | 'top-right-upper'
  | 'top-right-lower'
  | 'bottom-strip';

// ADR 0008 § 2.4 — station geometry (rowFraction, columnFractions,
// rightColumnSplit) persisted per-board only when user resizes panels.
// Defaults are applied at render-time if absent.
export interface StationGeometry {
  rowFraction: number;         // [0..1] mother-row height as fraction of viewport
  columnFractions: number[];   // length matches station column count (4 columns)
  rightColumnSplit: number;    // [0..1] split between Calendar (upper) and Clock (lower)
}

// Structural mixin for mother-node config objects.
// Step 4 (StationCell rendering) will rely on this contract to read stationSlot.
export interface MotherNodeConfig {
  stationSlot?: StationSlot;
  // When true, StationCell renders a small "show" placeholder instead of the
  // mother UI — user-toggleable via right-click → Hide on the drag handle.
  // Hidden mothers still exist on the canvas; only the station-mode
  // rendering is suppressed.
  stationHidden?: boolean;
}

export interface Board {
  version: 1;
  schemaVersion: 2;            // bumped from 1 (ADR 0008 § 4.1)
  savedAt: string;             // ISO 8601
  viewport: BoardViewport;
  nodes: Node[];
  edges: Edge[];
  // ADR 0008 § 2.1 / § 4.1: layout mode, required (migration sets to 'canvas' for legacy)
  layoutMode: LayoutMode;
  // ADR 0008 § 4.1: station geometry; absent until user resizes panels
  layoutGeometry?: {
    station?: StationGeometry;
  };
}
