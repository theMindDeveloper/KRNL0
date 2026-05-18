// @vitest-environment jsdom
/**
 * new-dock-chromes-smoke.test.tsx
 *
 * Smoke test — directly render each new chrome component to catch any
 * runtime errors. Mocks useReactFlow so we don't need a full RF instance.
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import type { Board } from '../../../src/shared/types';

vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@xyflow/react');
  return {
    ...actual,
    useReactFlow: () => ({
      getZoom: () => 1,
      getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
      setViewport: () => undefined,
      fitView: () => undefined,
      setCenter: () => undefined,
    }),
    // ViewportPortal renders children inline in tests (no host RF instance).
    ViewportPortal: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

function makeBoard(): Board {
  return {
    version: 1,
    schemaVersion: 2,
    savedAt: '2026-05-18T12:00:00.000Z',
    viewport: { x: 0, y: 0, zoom: 1 },
    layoutMode: 'canvas',
    nodes: [
      { id: 'mother-pomo',     kind: 'pomo',     position: { x: -1400, y: 0 }, isMother: true, state: {}, config: { stationSlot: 'top-left' } },
      { id: 'mother-todo',     kind: 'todo',     position: { x: -840,  y: 0 }, isMother: true, state: {}, config: { stationSlot: 'top-center' } },
      { id: 'mother-habit',    kind: 'habit',    position: { x: -280,  y: 0 }, isMother: true, state: {}, config: { stationSlot: 'top-right-pre' } },
      { id: 'mother-calendar', kind: 'calendar', position: { x:  280,  y: 0 }, isMother: true, state: {}, config: { stationSlot: 'top-right-upper' } },
      { id: 'mother-clock',    kind: 'clock',    position: { x:  840,  y: 0 }, isMother: true, state: {}, config: { stationSlot: 'top-right-lower' } },
      { id: 'mother-term',     kind: 'term',     position: { x: 1400,  y: 0 }, isMother: true, state: {}, config: { stationSlot: 'bottom-strip' } },
    ],
    edges: [],
  };
}

describe('new dock chromes — smoke', () => {
  for (const dockStyle of ['blueprint', 'macintosh', 'submarine'] as const) {
    it(`${dockStyle} chrome mounts and renders without error`, async () => {
      useBoardStore.setState({ board: makeBoard() });
      const { CanvasChassis } = await import('../../../src/renderer/components/ChassisLayer/CanvasChassis');
      const { container } = render(React.createElement(CanvasChassis, { dockStyle }));
      const chassis = container.querySelector('[data-testid="canvas-chassis"]');
      expect(chassis).not.toBeNull();
      expect(chassis?.className).toContain(`dock-${dockStyle}`);
    });
  }
});
