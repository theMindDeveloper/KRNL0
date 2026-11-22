// The layouts you pick from the top bar's layout menu and with
// `krnl settings layout` (Decisions 54, 59, 60; docs/06-requirements/station-layouts.md).
//
// Decision 60 — the owner kept two: My layout (with Reset) and Free canvas.
// The ready-made Grid / Planner arrangements below are no longer offered; a
// board saved on one opens as My layout (presetOf). Their code stays dormant.
//
//   My layout         (id classic) yours to arrange: drag, resize, show and
//                     hide windows; it stays as you leave it. Reset puts it back.
//   Calendar & Clock  (id grid)    ready-made: Timer, Todos, Habits over
//                     Calendar and Clock.
//   Wide Calendar     (id planner) ready-made: Timer, Clock, Todos, Habits over
//                     a full-width Calendar.
//   Free canvas       (id free)    put anything anywhere.
//
// A ready-made layout can be changed while you use it, and comes back exactly
// as designed each time you pick it (Decision 59).
//
// Classic, Grid and Planner are the Station (`layoutMode: 'station'`) with a
// preset (`layoutGeometry.station.preset`); Free is `layoutMode: 'canvas'`.
// Shared by the renderer and the `krnl` CLI so both speak the same names.

import type { StationGeometry, StationPreset } from './types/board';

export type LayoutChoice = StationPreset | 'free';

/** The window kinds a fixed preset arranges, in rows (Grid and Planner). */
export interface RowsPreset {
  id: Exclude<StationPreset, 'classic'>;
  top: readonly RowsKind[];
  bottom: readonly RowsKind[];
  /** Default widths in percent, one per kind (the visible ones are scaled to fill the row). */
  topSizes: readonly number[];
  bottomSizes: readonly number[];
  /** Default height of the top row in percent. */
  rowPercent: number;
}

export type RowsKind = 'pomo' | 'todo' | 'habit' | 'calendar' | 'clock';

/** Every window a Station can hold; 'canvas' is the embedded canvas (not a node). */
export const STATION_WINDOWS = ['pomo', 'todo', 'habit', 'calendar', 'clock', 'analytics', 'term', 'canvas'] as const;
export type StationWindow = (typeof STATION_WINDOWS)[number];

export const ROWS_PRESETS: Record<RowsPreset['id'], RowsPreset> = {
  grid: {
    id: 'grid',
    top: ['pomo', 'todo', 'habit'],
    bottom: ['calendar', 'clock'],
    topSizes: [100 / 3, 100 / 3, 100 / 3],
    bottomSizes: [66.67, 33.33],
    rowPercent: 52,
  },
  // Owner, 2026-11-21: the clock in the middle of the top row.
  planner: {
    id: 'planner',
    top: ['pomo', 'clock', 'todo', 'habit'],
    bottom: ['calendar'],
    topSizes: [26, 24, 28, 22],
    bottomSizes: [100],
    rowPercent: 36,
  },
};

export interface LayoutOption {
  id: LayoutChoice;
  /** Decision 59 — yours (kept as you leave it), ready-made (back as designed each time), or the canvas. */
  group: 'yours' | 'ready' | 'canvas';
  label: string;
  /** One line under the name in the menu, and the CLI's description. */
  hint: string;
  /** A line drawing of the arrangement: rectangles [x, y, w, h] in a 20 × 14 box. */
  glyph: ReadonlyArray<readonly [number, number, number, number]>;
}

export const LAYOUT_OPTIONS: readonly LayoutOption[] = [
  {
    id: 'classic',
    group: 'yours',
    label: 'My layout',
    hint: 'Arrange it your way — it stays as you leave it',
    glyph: [[1, 1, 4, 6], [5.5, 1, 4, 6], [10, 1, 4, 6], [14.5, 1, 4.5, 6], [1, 7.5, 11, 5.5], [12.5, 7.5, 6.5, 5.5]],
  },
  {
    id: 'free',
    group: 'canvas',
    label: 'Free canvas',
    hint: 'Put anything anywhere on the canvas',
    glyph: [[2, 2, 6, 4], [11, 4, 7, 4], [4, 9, 6, 3.5]],
  },
];

export const STATION_PRESETS: readonly StationPreset[] = ['classic'];

export function isStationPreset(v: unknown): v is StationPreset {
  return v === 'classic' || v === 'grid' || v === 'planner';
}

/** The Station's arrangement: My layout (Decision 60 — Grid and Planner were retired; a board saved on one opens as My layout). */
export function presetOf(geo: StationGeometry | undefined): StationPreset {
  void geo;
  return 'classic';
}

/** What the layout menu shows as chosen. */
export function layoutChoiceOf(layoutMode: string | undefined, geo: StationGeometry | undefined): LayoutChoice {
  return layoutMode === 'station' ? presetOf(geo) : 'free';
}

/**
 * A name typed in the CLI: the four options, plus the older words
 * `station` (the Station with its current preset) and `canvas` (Free).
 */
export function parseLayoutChoice(raw: string, current: StationPreset): LayoutChoice | null {
  const v = raw.trim().toLowerCase().replace(/[\s_&]+/g, '-').replace(/-+/g, '-');
  if (v === 'free' || v === 'canvas' || v === 'free-canvas') return 'free';
  if (v === 'station') return current;
  // Decision 59 — the menu's names work too.
  if (v === 'mine' || v === 'my' || v === 'my-layout' || v === 'yours' || v === 'custom') return 'classic';
  return v === 'classic' ? 'classic' : null;
}

/** The menu's name for a layout id. */
export function layoutLabel(id: LayoutChoice): string {
  return LAYOUT_OPTIONS.find((o) => o.id === id)?.label ?? id;
}

/** Decision 59 — the windows a ready-made layout shows: its own set until you change it. */
export function presetWindows(preset: RowsPreset['id'], saved?: { windows?: readonly string[] }): Set<string> {
  const def = ROWS_PRESETS[preset];
  return new Set<string>(saved?.windows ?? [...def.top, ...def.bottom]);
}

/** The Station geometry with one window shown or hidden in a ready-made layout. */
export function withPresetWindow(geo: StationGeometry | undefined, preset: RowsPreset['id'], kind: string, show: boolean): StationGeometry {
  const set = presetWindows(preset, geo?.[preset]);
  if (show) set.add(kind); else set.delete(kind);
  return { ...withPreset(geo, preset), [preset]: { ...geo?.[preset], windows: [...set] } };
}

/**
 * Decision 59 — picking a ready-made layout: it comes back exactly as designed
 * (its own windows, places and sizes); My layout keeps what you left.
 */
export function freshLayout(geo: StationGeometry | undefined, preset: StationPreset): StationGeometry {
  const next = withPreset(geo, preset);
  if (preset === 'classic') return next;
  const { [preset]: _dropped, ...rest } = next;
  void _dropped;
  return { ...rest, rev: (geo?.rev ?? 0) + 1 };
}

/**
 * Decision 60 — My layout as Reset makes it (the owner's own arrangement):
 * Timer, Clock and Todos across the top, the Calendar the full width below.
 * Habits, Analytics, the terminal and the embedded canvas start hidden (the
 * toolbar shows them; Free canvas is the canvas).
 */
export const CLASSIC_SLOTS: Readonly<Record<string, string>> = {
  pomo: 'top-left', clock: 'top-center', todo: 'top-right-pre', habit: 'top-right-upper',
  calendar: 'top-right-lower', term: 'bottom-strip', analytics: 'bottom-right-pre',
};
/** The windows Reset hides (the rest are shown). */
export const CLASSIC_HIDDEN: ReadonlySet<string> = new Set(['habit', 'term', 'analytics']);

/** My layout's sizes back to the Reset arrangement (window places come from CLASSIC_SLOTS). */
export function resetClassicGeometry(geo: StationGeometry | undefined): StationGeometry {
  const { bottomFractions: _b, ...rest } = geo ?? ({} as Partial<StationGeometry>);
  void _b;
  return { ...rest, rowFraction: 0.45, columnFractions: [], rightColumnSplit: 0.6, canvasHidden: true, preset: 'classic', rev: (geo?.rev ?? 0) + 1 };
}

/** The Station geometry with `preset` set, keeping every other saved field (NF1). */
export function withPreset(geo: StationGeometry | undefined, preset: StationPreset): StationGeometry {
  return {
    ...geo,
    rowFraction: geo?.rowFraction ?? 0.35,
    columnFractions: geo?.columnFractions ?? [],
    rightColumnSplit: geo?.rightColumnSplit ?? 0.6,
    preset,
  };
}

/**
 * The windows the toolbar can show or hide in a preset: every one, always
 * (Decision 58 — a preset is a starting arrangement, never a cage).
 */
export function presetKinds(_preset: StationPreset): ReadonlySet<string> | null {
  return null;
}

export interface PresetRows { top: StationWindow[]; bottom: StationWindow[] }

/**
 * A preset's arrangement (Decision 58): the saved order when there is one,
 * else the preset's own; any window it does not place yet joins the end of
 * the bottom row (it shows there once you show it).
 */
export function presetRows(preset: RowsPreset['id'], saved?: { top?: readonly string[]; bottom?: readonly string[] }): PresetRows {
  const def = ROWS_PRESETS[preset];
  const isWin = (k: string): k is StationWindow => (STATION_WINDOWS as readonly string[]).includes(k);
  const seen = new Set<string>();
  const clean = (xs: readonly string[]): StationWindow[] => xs.filter((k) => isWin(k) && !seen.has(k) && (seen.add(k), true)) as StationWindow[];
  const top = clean(saved?.top ?? def.top);
  const bottom = clean(saved?.bottom ?? def.bottom);
  for (const k of STATION_WINDOWS) if (!seen.has(k)) { seen.add(k); bottom.push(k); }
  return { top, bottom };
}

/** The arrangement with two windows trading places (dragging one onto the other, or `krnl window swap`). */
export function swapInRows(rows: PresetRows, a: string, b: string): PresetRows {
  const swap = (xs: StationWindow[]): StationWindow[] => xs.map((k) => (k === a ? (b as StationWindow) : k === b ? (a as StationWindow) : k));
  return { top: swap(rows.top), bottom: swap(rows.bottom) };
}
