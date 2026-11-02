// @vitest-environment jsdom
/**
 * Decision 32 — Analytics as a fixed window (analytics-window F1..F5).
 *   - its own Station panel beside the terminal, shown by default
 *   - toolbar toggle hides/shows it; the Canvas toggle is independent
 *   - its slot hosts the dashboard in a MotherFrame with the usual swap handle
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import { StationToolbar } from '../../../src/renderer/components/Station/StationToolbar';
import { isStationHidden } from '../../../src/renderer/components/Station/stationVisibility';
import { isAnalyticsShown, setAnalyticsShown } from '../../../src/renderer/store/analyticsMother';
import type { Board } from '../../../src/shared/types';

if (typeof global.ResizeObserver === 'undefined') {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}

function board(analyticsCfg: Record<string, unknown> = { stationSlot: 'bottom-right-pre' }): Board {
  return {
    version: 1, schemaVersion: 2, savedAt: '2026-11-02T00:00:00.000Z', layoutMode: 'station',
    viewport: { x: 0, y: 0, zoom: 1 }, edges: [],
    nodes: [
      { id: 'mother-pomo', kind: 'pomo', position: { x: -1400, y: 0 }, isMother: true, state: {}, config: { stationSlot: 'top-left' } },
      { id: 'mother-analytics', kind: 'analytics', position: { x: 1960, y: 0 }, isMother: true, state: { view: 'overview', rangeDays: 30, metric: 'taskCount' }, config: analyticsCfg },
    ],
  } as Board;
}

const analytics = () => useBoardStore.getState().board!.nodes.find((n) => n.id === 'mother-analytics')!;
const pressed = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label}$`, 'i') }).getAttribute('aria-pressed');

beforeEach(() => useBoardStore.setState({ board: board() }));
afterEach(() => { cleanup(); useBoardStore.setState({ board: null }); });

describe('Analytics window — visibility', () => {
  it('is shown by default in Station mode', () => {
    expect(isStationHidden(analytics())).toBe(false);
    expect(isAnalyticsShown(useBoardStore.getState().board)).toBe(true);
  });

  it('setAnalyticsShown writes stationHidden on the mother', () => {
    setAnalyticsShown(false);
    expect(analytics().config).toMatchObject({ stationSlot: 'bottom-right-pre', stationHidden: true });
    setAnalyticsShown(true);
    expect(analytics().config).toMatchObject({ stationHidden: false });
  });
});

describe('Analytics window — toolbar toggles', () => {
  it('Analytics and Canvas toggle independently', () => {
    render(<StationToolbar />);
    expect(pressed('Analytics')).toBe('true');
    expect(pressed('Canvas')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: /^Analytics$/i }));
    expect(isAnalyticsShown(useBoardStore.getState().board)).toBe(false);
    expect(pressed('Analytics')).toBe('false');
    expect(pressed('Canvas')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: /^Canvas$/i }));
    expect(pressed('Canvas')).toBe('false');
    expect(isAnalyticsShown(useBoardStore.getState().board)).toBe(false);
  });
});

describe('Analytics window — station cell', () => {
  it('its slot hosts the dashboard in a mother frame', async () => {
    useBoardStore.setState({ board: board({ stationSlot: 'bottom-right-pre', stationHidden: false }) });
    const { StationCell } = await import('../../../src/renderer/components/Station/StationCell');
    render(React.createElement(StationCell, { slot: 'bottom-right-pre' }));
    expect(document.querySelector('.mother-frame [data-testid="analytics-mother"] [data-testid="analytics-node-root"]')).not.toBeNull();
    expect(document.querySelector('.station-drag-handle')).not.toBeNull();
  });
});
