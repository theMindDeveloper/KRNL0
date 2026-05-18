// @vitest-environment jsdom
/**
 * narrow-viewport-fallback.test.tsx
 *
 * ADR 0008 § 9.5 — below 1024×640 with saved layoutMode='station', the
 * effective mode is 'canvas', the saved value in the store remains 'station',
 * the statusbar notice is shown, and restoring the viewport size resumes station.
 *
 * Tests the useStationViewportGate hook and the boardStore contract.
 * StatusBar DOM is tested for the fallback notice text.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, act } from '@testing-library/react';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import type { Board } from '../../../src/shared/types';

function makeBoard(layoutMode: 'canvas' | 'station'): Board {
  return {
    version: 1,
    schemaVersion: 2,
    savedAt: '2026-05-18T00:00:00.000Z',
    viewport: { x: 0, y: 0, zoom: 1 },
    layoutMode,
    nodes: [],
    edges: [],
  };
}

// Helper to simulate window dimensions.
function setWindowSize(w: number, h: number) {
  Object.defineProperty(window, 'innerWidth',  { writable: true, configurable: true, value: w });
  Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: h });
  window.dispatchEvent(new Event('resize'));
}

describe('useStationViewportGate (ADR 0008 § 9.5)', () => {
  const origW = window.innerWidth;
  const origH = window.innerHeight;

  beforeEach(() => {
    useBoardStore.setState({ board: makeBoard('station') });
    // Start above the threshold.
    setWindowSize(1440, 900);
  });

  afterEach(() => {
    setWindowSize(origW, origH);
  });

  it('at 1440×900 (above threshold), effective mode is station', async () => {
    const { useStationViewportGate } = await import('../../../src/renderer/components/Station/useStationViewportGate');
    let result: ReturnType<typeof useStationViewportGate> | null = null;
    function Harness() {
      result = useStationViewportGate();
      return null;
    }
    render(React.createElement(Harness));
    expect(result?.effectiveMode).toBe('station');
    expect(result?.isFallingBack).toBe(false);
  });

  it('at 800×600 (below threshold), effective mode falls back to canvas', async () => {
    setWindowSize(800, 600);
    const { useStationViewportGate } = await import('../../../src/renderer/components/Station/useStationViewportGate');
    let result: ReturnType<typeof useStationViewportGate> | null = null;
    function Harness() {
      result = useStationViewportGate();
      return null;
    }
    render(React.createElement(Harness));
    expect(result?.effectiveMode).toBe('canvas');
    expect(result?.isFallingBack).toBe(true);
  });

  it('saved layoutMode remains station even when falling back', async () => {
    setWindowSize(800, 600);
    const { useStationViewportGate } = await import('../../../src/renderer/components/Station/useStationViewportGate');
    function Harness() {
      useStationViewportGate();
      return null;
    }
    render(React.createElement(Harness));
    // The persisted value in the store is unchanged.
    expect(useBoardStore.getState().board?.layoutMode).toBe('station');
  });

  it('restores station mode on resize back above threshold', async () => {
    setWindowSize(800, 600);
    const { useStationViewportGate } = await import('../../../src/renderer/components/Station/useStationViewportGate');
    let result: ReturnType<typeof useStationViewportGate> | null = null;
    function Harness() {
      result = useStationViewportGate();
      return null;
    }
    render(React.createElement(Harness));
    expect(result?.effectiveMode).toBe('canvas');

    // Resize back above threshold.
    act(() => setWindowSize(1440, 900));
    expect(result?.effectiveMode).toBe('station');
    expect(result?.isFallingBack).toBe(false);
  });

  it('with saved canvas mode, narrow viewport returns canvas (no fallback flag)', async () => {
    useBoardStore.setState({ board: makeBoard('canvas') });
    setWindowSize(800, 600);
    const { useStationViewportGate } = await import('../../../src/renderer/components/Station/useStationViewportGate');
    let result: ReturnType<typeof useStationViewportGate> | null = null;
    function Harness() {
      result = useStationViewportGate();
      return null;
    }
    render(React.createElement(Harness));
    expect(result?.effectiveMode).toBe('canvas');
    expect(result?.isFallingBack).toBe(false);
  });
});

describe('StatusBar — fallback notice (ADR 0008 § 9.5)', () => {
  it('StatusBar shows the fallback notice when fallbackNotice=true', async () => {
    const { StatusBar } = await import('../../../src/renderer/components/StatusBar/index');
    // Need RF store for zoom — mock it.
    const { render: rtlRender } = await import('@testing-library/react');
    const { container } = rtlRender(React.createElement(StatusBar, { fallbackNotice: true }));
    const notice = container.querySelector('[data-testid="statusbar-station-fallback"]');
    expect(notice).not.toBeNull();
    expect(notice?.textContent).toContain('1024');
  });

  it('StatusBar does not show fallback notice when fallbackNotice=false', async () => {
    const { StatusBar } = await import('../../../src/renderer/components/StatusBar/index');
    const { render: rtlRender } = await import('@testing-library/react');
    const { container } = rtlRender(React.createElement(StatusBar, { fallbackNotice: false }));
    const notice = container.querySelector('[data-testid="statusbar-station-fallback"]');
    expect(notice).toBeNull();
  });
});
