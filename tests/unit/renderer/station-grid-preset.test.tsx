// @vitest-environment jsdom
/**
 * Decision 52 — the Station's Grid preset (station-layouts F1–F4):
 *   - the toolbar switch picks Classic / Grid and keeps every saved size
 *   - Grid shows only Timer, Todos, Habits, Calendar and Clock toggles
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import { StationToolbar } from '../../../src/renderer/components/Station/StationToolbar';
import type { Board } from '../../../src/shared/types';

if (typeof global.ResizeObserver === 'undefined') {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}

const mother = (id: string, kind: string, slot: string) => ({ id, kind, position: { x: 0, y: 0 }, isMother: true, state: {}, config: { stationSlot: slot } });
function board(): Board {
  return {
    version: 1, schemaVersion: 2, savedAt: '2026-11-20T00:00:00.000Z', layoutMode: 'station',
    viewport: { x: 0, y: 0, zoom: 1 }, edges: [],
    layoutGeometry: { station: { rowFraction: 0.4, columnFractions: [0.25, 0.25, 0.25, 0.25], rightColumnSplit: 0.6, bottomFractions: { 'station-bottom-canvas': 0.55 } } },
    nodes: [
      mother('mother-pomo', 'pomo', 'top-left'),
      mother('mother-todo', 'todo', 'top-center'),
      mother('mother-habit', 'habit', 'top-right-pre'),
      mother('mother-calendar', 'calendar', 'top-right-upper'),
      mother('mother-clock', 'clock', 'top-right-lower'),
      mother('mother-analytics', 'analytics', 'bottom-right-pre'),
    ],
  } as unknown as Board;
}

const station = () => useBoardStore.getState().board!.layoutGeometry!.station!;
const has = (label: string) => screen.queryByRole('button', { name: new RegExp(`^${label}$`, 'i') }) !== null;

beforeEach(() => useBoardStore.setState({ board: board() }));
afterEach(() => { cleanup(); useBoardStore.setState({ board: null }); });

describe('Station preset switch (Decision 52)', () => {
  it('starts on Classic and switches to Grid without losing the Classic sizes', () => {
    render(<StationToolbar />);
    expect(screen.getByRole('radio', { name: /classic/i }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: /grid/i }));
    expect(station().preset).toBe('grid');
    expect(station().rowFraction).toBe(0.4);
    expect(station().bottomFractions).toEqual({ 'station-bottom-canvas': 0.55 });
  });

  it('Grid shows only the five grid windows and no canvas toggle', () => {
    useBoardStore.setState({ board: { ...board(), layoutGeometry: { station: { ...board().layoutGeometry!.station!, preset: 'grid' } } } as Board });
    render(<StationToolbar />);
    for (const w of ['Timer', 'Todos', 'Habits', 'Calendar', 'Clock']) expect(has(w)).toBe(true);
    expect(has('Analytics')).toBe(false);
    expect(has('Canvas')).toBe(false);
  });
});
