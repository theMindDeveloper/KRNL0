// @vitest-environment jsdom
/**
 * A hidden bottom panel comes back at the width the user gave it.
 *
 * Hiding the terminal saves the bottom row as canvas 75 % + clock 25 %; the
 * terminal keeps its own saved width. The old restore rescaled all saved
 * widths together (canvas .75 + terminal .2 → terminal 15.8 %… or under the
 * 14 % minimum → defaults), so every show came back at 60/15.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { restoredSizesAround } from '../../../src/renderer/components/Station/restoredSizes';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import type { Board, StationGeometry } from '../../../src/shared/types';

vi.mock('../../../src/renderer/components/Station/EmbeddedCanvasCell', () => ({
  EmbeddedCanvasCell: () => React.createElement('div', { 'data-testid': 'canvas-cell' }),
}));
vi.mock('../../../src/renderer/components/Station/StationCell', () => ({
  StationCell: ({ slot }: { slot: string }) => React.createElement('div', { 'data-testid': `cell-${slot}` }),
}));

// jsdom has no layout, so the real library would split panels evenly; this
// stand-in renders the `defaultSize` StationLayout hands each Panel.
vi.mock('react-resizable-panels', () => ({
  Group: ({ children }: { children?: React.ReactNode }) => React.createElement('div', { 'data-group': true }, children),
  Panel: ({ id, defaultSize, children }: { id: string; defaultSize?: number; children?: React.ReactNode }) =>
    React.createElement('div', { 'data-panel': true, id, 'data-default-size': String(defaultSize) }, children),
  Separator: () => React.createElement('div', { 'data-separator': true }),
}));

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
}

const CANVAS = 'station-bottom-canvas';
const TERM = 'station-bottom-terminal';
const ANALYTICS = 'station-bottom-analytics';
const CLOCK = 'station-bottom-clock';

describe('restoredSizesAround — the canvas absorbs, the others keep their width', () => {
  const ids = [CANVAS, TERM];
  const defaults = [60, 15];
  const mins = [30, 14];

  it('hide → show: the terminal comes back at the width the user gave it', () => {
    // Saved while the terminal was hidden: the canvas filled its space.
    const afterHide = { [CANVAS]: 0.75, [TERM]: 0.2, [CLOCK]: 0.25 };
    expect(restoredSizesAround(CANVAS, ids, defaults, mins, afterHide, 75)).toEqual([55, 20]);
  });

  it('reload with everything visible: the saved widths come back as they were', () => {
    const saved = { [CANVAS]: 0.52, [TERM]: 0.23, [CLOCK]: 0.25 };
    const out = restoredSizesAround(CANVAS, ids, defaults, mins, saved, 75);
    expect(out[0]).toBeCloseTo(52);
    expect(out[1]).toBeCloseTo(23);
  });

  it('a panel never saved (or saved under its minimum) gets its default', () => {
    expect(restoredSizesAround(CANVAS, ids, defaults, mins, { [CANVAS]: 0.75 }, 75)).toEqual([60, 15]);
    expect(restoredSizesAround(CANVAS, ids, defaults, mins, { [CANVAS]: 0.75, [TERM]: 0.05 }, 75)).toEqual([60, 15]);
    expect(restoredSizesAround(CANVAS, ids, defaults, mins, undefined, 75)).toEqual([60, 15]);
  });

  it('several panels: each keeps its width, the canvas takes the rest', () => {
    const out = restoredSizesAround(CANVAS, [CANVAS, TERM, ANALYTICS], [35, 15, 25], [30, 14, 14],
      { [CANVAS]: 0.75, [TERM]: 0.2, [ANALYTICS]: 0.18 }, 75);
    expect(out.map((v) => Math.round(v * 1000) / 1000)).toEqual([37, 20, 18]);
  });

  it('falls back to defaults when the canvas would be squeezed under its minimum', () => {
    const out = restoredSizesAround(CANVAS, [CANVAS, TERM, ANALYTICS], [35, 15, 25], [30, 14, 14],
      { [TERM]: 0.3, [ANALYTICS]: 0.3 }, 75);
    expect(out).toEqual([35, 15, 25]);
  });

  it('without the canvas the saved widths are shared out proportionally', () => {
    const out = restoredSizesAround(CANVAS, [TERM, ANALYTICS], [50, 50], [14, 14], { [TERM]: 0.2, [ANALYTICS]: 0.2 }, 75);
    expect(out).toEqual([37.5, 37.5]);
  });
});

// ── StationLayout: the Panel's defaultSize follows the remembered width ─────

function board(termHidden: boolean, geometry: StationGeometry): Board {
  return {
    version: 1, schemaVersion: 2, savedAt: '2026-11-05T00:00:00.000Z', layoutMode: 'station',
    viewport: { x: 0, y: 0, zoom: 1 }, edges: [],
    layoutGeometry: { station: geometry },
    nodes: [
      { id: 'mother-pomo', kind: 'pomo', position: { x: 0, y: 0 }, isMother: true, state: {}, config: { stationSlot: 'top-left' } },
      { id: 'mother-clock', kind: 'clock', position: { x: 0, y: 0 }, isMother: true, state: {}, config: { stationSlot: 'top-right-lower' } },
      { id: 'mother-term', kind: 'term', position: { x: 0, y: 0 }, isMother: true, state: {}, config: { stationSlot: 'bottom-strip', stationHidden: termHidden } },
      { id: 'mother-analytics', kind: 'analytics', position: { x: 0, y: 0 }, isMother: true, state: {}, config: { stationSlot: 'bottom-right-pre', stationHidden: true } },
    ],
  } as Board;
}

/** The `defaultSize` StationLayout gave the panel. */
function panelSize(id: string): number {
  const el = document.querySelector<HTMLElement>(`[data-panel][id="${id}"]`);
  return el ? Number(el.dataset['defaultSize']) : NaN;
}

const geometry = (bottomFractions: Record<string, number>): StationGeometry => ({
  rowFraction: 0.4, columnFractions: [0.25, 0.25, 0.25, 0.25], rightColumnSplit: 0.55, bottomFractions,
});

beforeEach(() => {
  // The user had dragged the terminal to 20 %, then hid it (canvas filled in).
  useBoardStore.setState({ board: board(true, geometry({ [CANVAS]: 0.75, [TERM]: 0.2, [CLOCK]: 0.25 })) });
});
afterEach(() => { cleanup(); useBoardStore.setState({ board: null }); });

describe('StationLayout — show the terminal again', () => {
  it('shows it at the remembered 20 %, the clock stays at 25 %', async () => {
    const { StationLayout } = await import('../../../src/renderer/components/Station/StationLayout');
    render(React.createElement(StationLayout));
    expect(document.querySelector(`[id="${TERM}"]`)).toBeNull();

    act(() => { useBoardStore.getState().updateNode('mother-term', { config: { stationSlot: 'bottom-strip', stationHidden: false } }); });
    expect(panelSize(TERM)).toBeCloseTo(20);
    expect(panelSize(CANVAS)).toBeCloseTo(55);
    expect(panelSize(CLOCK)).toBeCloseTo(25);
  });

  it('after a reload with the terminal shown it keeps the saved width, and rendering saves nothing', async () => {
    useBoardStore.setState({ board: board(false, geometry({ [CANVAS]: 0.55, [TERM]: 0.2, [CLOCK]: 0.25 })) });
    const before = useBoardStore.getState().board!.layoutGeometry;
    const { StationLayout } = await import('../../../src/renderer/components/Station/StationLayout');
    render(React.createElement(StationLayout));
    expect(panelSize(TERM)).toBeCloseTo(20);
    expect(panelSize(CANVAS)).toBeCloseTo(55);
    expect(useBoardStore.getState().board!.layoutGeometry).toBe(before);
  });
});
