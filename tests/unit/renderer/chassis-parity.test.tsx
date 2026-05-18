// @vitest-environment jsdom
/**
 * chassis-parity.test.tsx
 *
 * ADR 0008 § 2.6 / NF8 — chassis split contract.
 *
 * - Canvas mode: ChassisLayer renders CanvasChassis (ViewportPortal-anchored).
 * - Station mode: ChassisLayer renders nothing — StationLayout owns the chassis
 *   chrome by wrapping its root in `.dock-chassis dock-{style}`.
 * - Classic dock style: nothing renders in either mode.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import type { Board } from '../../../src/shared/types';

// EmbeddedCanvasCell pulls in CanvasFlow which imports xyflow CSS; stub it for
// this DOM test so we exercise the StationLayout wrapper without the full
// canvas tree.
vi.mock('../../../src/renderer/components/Station/EmbeddedCanvasCell', () => ({
  EmbeddedCanvasCell: () => React.createElement('div', { 'data-testid': 'embedded-canvas-cell-stub' }),
}));

function makeBoard(layoutMode: 'canvas' | 'station' = 'canvas'): Board {
  return {
    version: 1,
    schemaVersion: 2,
    savedAt: '2026-05-18T00:00:00.000Z',
    viewport: { x: 0, y: 0, zoom: 1 },
    layoutMode,
    nodes: [
      { id: 'mother-pomo', kind: 'pomo', position: { x: -1400, y: 0 }, isMother: true, state: {}, config: {} },
    ],
    edges: [],
  };
}

describe('ChassisLayer split — canvas vs station (ADR 0008 § 2.6)', () => {
  it('CanvasChassis renders dock-chassis + dock-krnl-dock class', async () => {
    useBoardStore.setState({ board: makeBoard('canvas') });
    const { CanvasChassis } = await import('../../../src/renderer/components/ChassisLayer/CanvasChassis');
    const { container } = render(React.createElement(CanvasChassis, { dockStyle: 'krnl-dock' }));
    const chassis = container.querySelector('[data-testid="canvas-chassis"]');
    expect(chassis).not.toBeNull();
    expect(chassis?.className).toContain('dock-chassis');
    expect(chassis?.className).toContain('dock-krnl-dock');
  });

  it('CanvasChassis returns null for classic dock style', async () => {
    const { CanvasChassis } = await import('../../../src/renderer/components/ChassisLayer/CanvasChassis');
    const { container } = render(React.createElement(CanvasChassis, { dockStyle: 'classic' }));
    expect(container.firstChild).toBeNull();
  });

  it('ChassisLayer renders nothing in station mode — StationLayout owns chrome', async () => {
    useBoardStore.setState({ board: makeBoard('station') });
    const { ChassisLayer } = await import('../../../src/renderer/components/ChassisLayer');
    const { container } = render(React.createElement(ChassisLayer, { dockStyle: 'krnl-dock' }));
    expect(container.firstChild).toBeNull();
  });

  it('ChassisLayer renders CanvasChassis in canvas mode', async () => {
    useBoardStore.setState({ board: makeBoard('canvas') });
    const { ChassisLayer } = await import('../../../src/renderer/components/ChassisLayer');
    const { container } = render(React.createElement(ChassisLayer, { dockStyle: 'krnl-dock' }));
    const chassis = container.querySelector('[data-testid="canvas-chassis"]');
    expect(chassis).not.toBeNull();
  });

  // StationLayout class assertion is validated by source-level read since
  // react-resizable-panels can't mount in jsdom (needs ResizeObserver), and
  // visual parity is verified via preview screenshot.
  it('StationLayout source declares `dock-chassis dock-${dockStyle}` className on root', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const src = await fs.readFile(
      path.resolve(process.cwd(), 'src/renderer/components/Station/StationLayout.tsx'),
      'utf8',
    );
    expect(src).toMatch(/className=\{`dock-chassis dock-\$\{dockStyle\}`\}/);
  });
});

beforeEach(() => {
  window.localStorage.clear();
});
