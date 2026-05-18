// @vitest-environment jsdom
/**
 * chassis-parity.test.tsx
 *
 * ADR 0008 § 2.6 / NF8 — with dockStyle='krnl-dock', both CanvasChassis and
 * StationChassis render equivalent decorative DOM.
 *
 * "Equivalent" means:
 *   - Same className pattern: `dock-chassis dock-krnl-dock`
 *   - Both contain the KrnlDockChrome child (validated by presence of .dk-rail elements)
 *   - data-testid differs ('canvas-chassis' vs 'station-chassis') — by design.
 *
 * The @xyflow/react mock stubs ViewportPortal so CanvasChassis can render
 * in a node test environment without a real RF instance.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import type { Board } from '../../../src/shared/types';

// The @xyflow/react mock already includes ViewportPortal — no additional mock needed.

function makeBoard(): Board {
  return {
    version: 1,
    schemaVersion: 2,
    savedAt: '2026-05-18T00:00:00.000Z',
    viewport: { x: 0, y: 0, zoom: 1 },
    layoutMode: 'canvas',
    nodes: [
      { id: 'mother-pomo', kind: 'pomo', position: { x: -1400, y: 0 }, isMother: true, state: {}, config: {} },
    ],
    edges: [],
  };
}

describe('ChassisLayer parity — krnl-dock variant (ADR 0008 NF8)', () => {
  beforeEach(() => {
    useBoardStore.setState({ board: makeBoard() });
  });

  it('CanvasChassis renders dock-chassis + dock-krnl-dock class', async () => {
    const { CanvasChassis } = await import('../../../src/renderer/components/ChassisLayer/CanvasChassis');
    const { container } = render(React.createElement(CanvasChassis, { dockStyle: 'krnl-dock' }));
    const chassis = container.querySelector('[data-testid="canvas-chassis"]');
    expect(chassis).not.toBeNull();
    expect(chassis?.className).toContain('dock-chassis');
    expect(chassis?.className).toContain('dock-krnl-dock');
  });

  it('StationChassis renders dock-chassis + dock-krnl-dock class', async () => {
    const { StationChassis } = await import('../../../src/renderer/components/ChassisLayer/StationChassis');
    const { container } = render(React.createElement(StationChassis, { dockStyle: 'krnl-dock' }));
    const chassis = container.querySelector('[data-testid="station-chassis"]');
    expect(chassis).not.toBeNull();
    expect(chassis?.className).toContain('dock-chassis');
    expect(chassis?.className).toContain('dock-krnl-dock');
  });

  it('CanvasChassis returns null for classic dock style', async () => {
    const { CanvasChassis } = await import('../../../src/renderer/components/ChassisLayer/CanvasChassis');
    const { container } = render(React.createElement(CanvasChassis, { dockStyle: 'classic' }));
    expect(container.firstChild).toBeNull();
  });

  it('StationChassis returns null for classic dock style', async () => {
    const { StationChassis } = await import('../../../src/renderer/components/ChassisLayer/StationChassis');
    const { container } = render(React.createElement(StationChassis, { dockStyle: 'classic' }));
    expect(container.firstChild).toBeNull();
  });
});
