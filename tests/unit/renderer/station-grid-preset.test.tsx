// @vitest-environment jsdom
/**
 * Decision 54 — the layout menu and the Station's presets (station-layouts F1–F3):
 *   - the top bar's layout menu lists Classic, Grid, Planner and Free, and
 *     picking one keeps every saved size
 *   - Grid and Planner offer only the windows they arrange; Free offers all
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import { StationToolbar } from '../../../src/renderer/components/Station/StationToolbar';
import { LayoutMenu } from '../../../src/renderer/components/ui/LayoutMenu';
import { ROWS_PRESETS, layoutChoiceOf, parseLayoutChoice, presetKinds, presetOf } from '../../../src/shared/stationLayouts';
import type { Board } from '../../../src/shared/types';

if (typeof global.ResizeObserver === 'undefined') {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}

const mother = (id: string, kind: string, slot: string) => ({ id, kind, position: { x: 0, y: 0 }, isMother: true, state: {}, config: { stationSlot: slot } });
function board(layoutMode: 'station' | 'canvas' = 'station', preset?: string): Board {
  return {
    version: 1, schemaVersion: 2, savedAt: '2026-11-20T00:00:00.000Z', layoutMode,
    viewport: { x: 0, y: 0, zoom: 1 }, edges: [],
    layoutGeometry: { station: { rowFraction: 0.4, columnFractions: [0.25, 0.25, 0.25, 0.25], rightColumnSplit: 0.6, bottomFractions: { 'station-bottom-canvas': 0.55 }, ...(preset ? { preset } : {}) } },
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

const state = () => useBoardStore.getState().board!;
const station = () => state().layoutGeometry!.station!;
const has = (label: string) => screen.queryByRole('button', { name: new RegExp(`^${label}$`, 'i') }) !== null;

beforeEach(() => useBoardStore.setState({ board: board() }));
afterEach(() => { cleanup(); useBoardStore.setState({ board: null }); });

describe('The layout menu (Decision 54, F1)', () => {
  it('names the layout in use and lists the four layouts', () => {
    render(<LayoutMenu />);
    const btn = screen.getByTestId('layout-menu');
    expect(btn.getAttribute('data-layout')).toBe('classic');
    fireEvent.click(btn);
    const items = screen.getAllByRole('menuitemradio');
    expect(items.map((i) => i.getAttribute('data-testid'))).toEqual(['layout-option-classic', 'layout-option-grid', 'layout-option-planner', 'layout-option-free']);
    expect(screen.getByTestId('layout-option-classic').getAttribute('aria-checked')).toBe('true');
  });

  it('picking Planner keeps the Classic sizes; Free leaves the Station and remembers Planner', () => {
    render(<LayoutMenu />);
    fireEvent.click(screen.getByTestId('layout-menu'));
    fireEvent.click(screen.getByTestId('layout-option-planner'));
    expect(station().preset).toBe('planner');
    expect(station().rowFraction).toBe(0.4);
    expect(station().bottomFractions).toEqual({ 'station-bottom-canvas': 0.55 });
    expect(screen.getByTestId('layout-menu').getAttribute('data-layout')).toBe('planner');
    fireEvent.click(screen.getByTestId('layout-menu'));
    fireEvent.click(screen.getByTestId('layout-option-free'));
    expect(state().layoutMode).toBe('canvas');
    expect(station().preset).toBe('planner');
  });

  it('from Free, a Station layout opens the Station with that preset', () => {
    useBoardStore.setState({ board: board('canvas') });
    render(<LayoutMenu />);
    expect(screen.getByTestId('layout-menu').getAttribute('data-layout')).toBe('free');
    fireEvent.click(screen.getByTestId('layout-menu'));
    fireEvent.click(screen.getByTestId('layout-option-grid'));
    expect(state().layoutMode).toBe('station');
    expect(station().preset).toBe('grid');
  });

  it('Ctrl+Shift+L still flips Station and Free', () => {
    render(<LayoutMenu />);
    fireEvent.keyDown(window, { key: 'L', ctrlKey: true, shiftKey: true });
    expect(state().layoutMode).toBe('canvas');
  });
});

describe('The toolbar follows the preset (F2)', () => {
  it('Grid and Planner show only their five windows and no canvas toggle', () => {
    for (const preset of ['grid', 'planner']) {
      useBoardStore.setState({ board: board('station', preset) });
      render(<StationToolbar />);
      for (const w of ['Timer', 'Todos', 'Habits', 'Calendar', 'Clock']) expect(has(w)).toBe(true);
      expect(has('Analytics')).toBe(false);
      expect(has('Canvas')).toBe(false);
      cleanup();
    }
  });

  it('in Free every window has its toggle, whatever the Station preset', () => {
    useBoardStore.setState({ board: board('canvas', 'planner') });
    render(<StationToolbar />);
    expect(has('Analytics')).toBe(true);
  });
});

describe('Layout names (shared with the CLI)', () => {
  it('Planner puts Timer, Todos, Habits and Clock over a full-width Calendar', () => {
    expect(ROWS_PRESETS.planner.top).toEqual(['pomo', 'todo', 'habit', 'clock']);
    expect(ROWS_PRESETS.planner.bottom).toEqual(['calendar']);
    expect([...presetKinds('planner')!].sort()).toEqual(['calendar', 'clock', 'habit', 'pomo', 'todo']);
    expect(presetKinds('classic')).toBeNull();
  });

  it('an unknown saved preset opens as Classic; old CLI words still work', () => {
    expect(presetOf({ rowFraction: 0.4, columnFractions: [], rightColumnSplit: 0.6, preset: 'masonry' as never })).toBe('classic');
    expect(layoutChoiceOf('canvas', undefined)).toBe('free');
    expect(parseLayoutChoice('station', 'grid')).toBe('grid');
    expect(parseLayoutChoice('canvas', 'grid')).toBe('free');
    expect(parseLayoutChoice('Planner', 'classic')).toBe('planner');
    expect(parseLayoutChoice('masonry', 'classic')).toBeNull();
  });
});
