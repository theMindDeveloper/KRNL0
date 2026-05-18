/**
 * dockRegistry — single source of truth for dock-frame styles.
 *
 * Every consumer (CanvasChassis bounds, StationLayout padding/chrome, Dock
 * picker tiles, TopBar dark-only gating, useDockStyle persistence) reads from
 * this file. Adding a new dock style is:
 *   1. Add one entry below
 *   2. Write the Chrome component (or omit for a chromeless style)
 *   3. Write the CSS for `.dock-chassis.dock-<id>` in chassis.css
 *
 * NO other file needs editing. TypeScript will narrow `DockStyle` to the new
 * keyset automatically.
 */

import type { ReactNode } from 'react';
import { SynthesizerChrome } from './SynthesizerChrome';
import { TelemetryChrome } from './TelemetryChrome';
import { KrnlDockChrome } from './KrnlDockChrome';

// ── Types ────────────────────────────────────────────────────────────────────

/** How CanvasChassis sizes/positions the chrome rect in flow-space. */
export type DockCanvasBounds =
  // Fixed rectangle in flow-space — used by synth & telemetry.
  | { kind: 'static'; rect: { left: number; top: number; width: number; height: number } }
  // Hugs the mother row's x-span — used by KRNL Dock.
  | { kind: 'fit-mothers'; topOffset: number; height: number; sidePad: number; minWidth: number };

export interface DockStyleDef {
  id: string;
  label: string;
  sublabel: string;
  glyph: ReactNode;
  /** Chrome component shared between canvas & station modes. Omit for the
   *  classic style (no chrome — just the underlying paper). */
  Chrome?: React.ComponentType;
  /** Required when Chrome is defined. */
  canvasBounds?: DockCanvasBounds;
  /** Padding the chrome reserves at top/bottom of the station shell. */
  stationPadding: { top: number; bottom: number };
  /** If set, TopBar hides the light/dark toggle and forces dark. */
  theme?: 'dark-only';
}

// ── Glyphs (24x24 viewBox, shared grid) ──────────────────────────────────────

const CLASSIC_GLYPH = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M7 10h10M7 14h6" opacity="0.7" />
  </svg>
);

const SYNTH_GLYPH = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="14" rx="1.5" />
    <circle cx="7"  cy="14" r="1.6" />
    <circle cx="12" cy="14" r="1.6" />
    <circle cx="17" cy="14" r="1.6" />
    <path d="M5 8h14" opacity="0.5" />
  </svg>
);

const TELEMETRY_GLYPH = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="14" rx="1.5" />
    <path d="M4 13l3-3 3 2 4-5 3 4 3-2" />
    <circle cx="7" cy="10" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="14" cy="7" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);

const KRNL_DOCK_GLYPH = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="16" rx="1" />
    <path d="M3 8h18M3 16h18" />
    <circle cx="6" cy="6" r="0.6" fill="currentColor" stroke="none" />
    <circle cx="18" cy="6" r="0.6" fill="currentColor" stroke="none" />
    <circle cx="6" cy="18" r="0.6" fill="currentColor" stroke="none" />
    <circle cx="18" cy="18" r="0.6" fill="currentColor" stroke="none" />
  </svg>
);

// ── Registry ─────────────────────────────────────────────────────────────────

// Helper preserves literal keys (so DockStyle is a narrow union) while typing
// each value uniformly as DockStyleDef — so optional fields like `Chrome`,
// `canvasBounds`, and `theme` remain accessible at consumer sites even when
// an individual entry omits them.
function defineRegistry<K extends string>(r: Record<K, DockStyleDef>): Record<K, DockStyleDef> {
  return r;
}

export const DOCK_REGISTRY = defineRegistry({
  classic: {
    id: 'classic',
    label: 'Classic',
    sublabel: 'Default frame',
    glyph: CLASSIC_GLYPH,
    stationPadding: { top: 0, bottom: 0 },
  },
  synthesizer: {
    id: 'synthesizer',
    label: 'Synthesizer',
    sublabel: 'Eurorack panel',
    glyph: SYNTH_GLYPH,
    Chrome: SynthesizerChrome,
    canvasBounds: { kind: 'static', rect: { left: -1410, top: -50, width: 3360, height: 678 } },
    stationPadding: { top: 50, bottom: 88 },
  },
  telemetry: {
    id: 'telemetry',
    label: 'Telemetry',
    sublabel: 'Mission control',
    glyph: TELEMETRY_GLYPH,
    Chrome: TelemetryChrome,
    canvasBounds: { kind: 'static', rect: { left: -1410, top: -76, width: 3360, height: 686 } },
    stationPadding: { top: 76, bottom: 70 },
  },
  'krnl-dock': {
    id: 'krnl-dock',
    label: 'KRNL Dock',
    sublabel: 'Rack chassis',
    glyph: KRNL_DOCK_GLYPH,
    Chrome: KrnlDockChrome,
    canvasBounds: { kind: 'fit-mothers', topOffset: -102, height: 744, sidePad: 10, minWidth: 600 },
    stationPadding: { top: 102, bottom: 102 },
    theme: 'dark-only',
  },
});

// ── Derived ──────────────────────────────────────────────────────────────────

export type DockStyle = keyof typeof DOCK_REGISTRY;
export const DOCK_STYLES = Object.keys(DOCK_REGISTRY) as DockStyle[];
export const DEFAULT_DOCK_STYLE: DockStyle = 'classic';

/** Convenience: read theme constraint for a given style (TopBar dark-only). */
export function isDarkOnly(style: DockStyle): boolean {
  return DOCK_REGISTRY[style].theme === 'dark-only';
}
