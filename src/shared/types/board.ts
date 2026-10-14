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
  // Whether the embedded canvas panel is hidden (toggled via StationToolbar).
  // Mother visibility is stored per-node on config.stationHidden; canvas isn't
  // a node so it lives on the geometry object instead.
  canvasHidden?: boolean;
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

// #169 — completion ledger entry. Written the moment a task is marked done,
// independent of the task node, so deleting the node never erases the record
// of work actually completed. Keyed by taskId (upsert). Removed when the task
// is reopened (done → undone). Analytics reads this ledger, not live nodes, so:
//   - created + done + deleted   → retained (entry survives node removal)
//   - created + undone + deleted → dropped (no entry was ever written)
//   - created by mistake, deleted → dropped (never completed)
export interface CompletionRecord {
  taskId: string;       // the todo.task node id this completion came from
  text: string;         // task text at completion time (node may be gone later)
  plannedMin: number;   // budgeted minutes at completion time
  completedAt: string;  // ISO 8601
}

export interface Board {
  version: 1;
  schemaVersion: 2;            // bumped from 1 (ADR 0008 § 4.1)
  savedAt: string;             // ISO 8601
  viewport: BoardViewport;
  nodes: Node[];
  edges: Edge[];
  // #169 — durable completion ledger (see CompletionRecord). Optional so legacy
  // boards load unchanged; migration backfills from existing done tasks.
  completions?: CompletionRecord[];
  // ADR 0008 § 2.1 / § 4.1: layout mode, required (migration sets to 'canvas' for legacy)
  layoutMode: LayoutMode;
  // ADR 0008 § 4.1: station geometry; absent until user resizes panels
  layoutGeometry?: {
    station?: StationGeometry;
  };
}
