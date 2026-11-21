// The layouts you pick from the top bar's layout menu and with
// `krnl settings layout` (Decision 54, docs/06-requirements/station-layouts.md).
//
//   Classic  Timer, Todos, Habits, Calendar over the canvas, terminal,
//            analytics and clock. You can swap windows by dragging them.
//   Grid     Timer, Todos, Habits over Calendar and Clock.
//   Planner  Timer, Todos, Habits, Clock over a full-width Calendar.
//   Free     the canvas: put anything anywhere.
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
  label: string;
  /** One line under the name in the menu, and the CLI's description. */
  hint: string;
  /** A line drawing of the arrangement: rectangles [x, y, w, h] in a 20 × 14 box. */
  glyph: ReadonlyArray<readonly [number, number, number, number]>;
}

export const LAYOUT_OPTIONS: readonly LayoutOption[] = [
  {
    id: 'classic',
    label: 'Classic',
    hint: 'Four windows over the canvas, terminal and clock',
    glyph: [[1, 1, 4, 6], [5.5, 1, 4, 6], [10, 1, 4, 6], [14.5, 1, 4.5, 6], [1, 7.5, 11, 5.5], [12.5, 7.5, 6.5, 5.5]],
  },
  {
    id: 'grid',
    label: 'Grid',
    hint: 'Timer, Todos and Habits over Calendar and Clock',
    glyph: [[1, 1, 5.7, 5.5], [7.2, 1, 5.6, 5.5], [13.3, 1, 5.7, 5.5], [1, 7, 11.8, 6], [13.3, 7, 5.7, 6]],
  },
  {
    id: 'planner',
    label: 'Planner',
    hint: 'Timer, Todos and Clock over a wide Calendar',
    glyph: [[1, 1, 5.7, 4.5], [7.2, 1, 5.6, 4.5], [13.3, 1, 5.7, 4.5], [1, 6, 18, 7]],
  },
  {
    id: 'free',
    label: 'Free',
    hint: 'Put anything anywhere on the canvas',
    glyph: [[2, 2, 6, 4], [11, 4, 7, 4], [4, 9, 6, 3.5]],
  },
];

export const STATION_PRESETS: readonly StationPreset[] = ['classic', 'grid', 'planner'];

export function isStationPreset(v: unknown): v is StationPreset {
  return v === 'classic' || v === 'grid' || v === 'planner';
}

/** The saved preset; anything unknown (an older or newer app's value) is Classic. */
export function presetOf(geo: StationGeometry | undefined): StationPreset {
  return isStationPreset(geo?.preset) ? geo!.preset! : 'classic';
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
  const v = raw.trim().toLowerCase();
  if (v === 'free' || v === 'canvas') return 'free';
  if (v === 'station') return current;
  return isStationPreset(v) ? v : null;
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
