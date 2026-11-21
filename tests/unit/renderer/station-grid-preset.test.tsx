// @vitest-environment jsdom
/**
 * The layout menu (Decisions 54, 59, 60; station-layouts F1, F9, F11):
 *   - the top bar's layout menu lists My layout and Free canvas
 *   - Reset puts My layout back as the owner arranged it: Timer, Clock and
 *     Todos across the top, the Calendar the full width below
 *   - a board saved on a retired preset (Grid, Planner) opens as My layout
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import { StationToolbar } from '../../../src/renderer/components/Station/StationToolbar';
import { LayoutMenu } from '../../../src/renderer/components/ui/LayoutMenu';
import { CLASSIC_HIDDEN, CLASSIC_SLOTS, layoutChoiceOf, parseLayoutChoice, presetOf } from '../../../src/shared/stationLayouts';
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
const cfg = (id: string) => state().nodes.find((n) => n.id === id)!.config as { stationSlot?: string; stationHidden?: boolean };
const has = (label: string) => screen.queryByRole('button', { name: new RegExp(`^${label}$`, 'i') }) !== null;

beforeEach(() => useBoardStore.setState({ board: board() }));
afterEach(() => { cleanup(); useBoardStore.setState({ board: null }); });

describe('The layout menu (Decision 60, F11)', () => {
  it('names the layout in use and lists My layout and Free canvas', () => {
    render(<LayoutMenu />);
    const btn = screen.getByTestId('layout-menu');
    expect(btn.getAttribute('data-layout')).toBe('classic');
    fireEvent.click(btn);
    const items = screen.getAllByRole('menuitemradio');
    expect(items.map((i) => i.getAttribute('data-testid'))).toEqual(['layout-option-classic', 'layout-option-free']);
    expect(items[0]!.textContent).toContain('My layout');
    expect(items[1]!.textContent).toContain('Free canvas');
    expect(screen.getByTestId('layout-option-classic').getAttribute('aria-checked')).toBe('true');
  });

  it('Free canvas leaves the Station; My layout brings it back with its sizes', () => {
    render(<LayoutMenu />);
    fireEvent.click(screen.getByTestId('layout-menu'));
    fireEvent.click(screen.getByTestId('layout-option-free'));
    expect(state().layoutMode).toBe('canvas');
    fireEvent.click(screen.getByTestId('layout-menu'));
    fireEvent.click(screen.getByTestId('layout-option-classic'));
    expect(state().layoutMode).toBe('station');
    expect(station().rowFraction).toBe(0.4);
    expect(station().bottomFractions).toEqual({ 'station-bottom-canvas': 0.55 });
  });

  it('Reset: Timer, Clock and Todos on top, the Calendar the full width below, the rest hidden (F9)', () => {
    render(<LayoutMenu />);
    fireEvent.click(screen.getByTestId('layout-menu'));
    fireEvent.click(screen.getByTestId('layout-reset-mine'));
    expect(cfg('mother-pomo').stationSlot).toBe('top-left');
    expect(cfg('mother-clock').stationSlot).toBe('top-center');
    expect(cfg('mother-todo').stationSlot).toBe('top-right-pre');
    expect(cfg('mother-calendar').stationSlot).toBe('top-right-lower');
    expect(cfg('mother-habit').stationHidden).toBe(true);
    expect(cfg('mother-analytics').stationHidden).toBe(true);
    expect(cfg('mother-calendar').stationHidden).toBe(false);
    expect(station().canvasHidden).toBe(true);
    expect(station().bottomFractions).toBeUndefined();
    expect(CLASSIC_SLOTS['calendar']).toBe('top-right-lower');
    expect(CLASSIC_HIDDEN.has('habit')).toBe(true);
  });

  it('Ctrl+Shift+L still flips Station and Free', () => {
    render(<LayoutMenu />);
    fireEvent.keyDown(window, { key: 'L', ctrlKey: true, shiftKey: true });
    expect(state().layoutMode).toBe('canvas');
  });
});

describe('Retired presets (Decision 60)', () => {
  it('a board saved on Grid or Planner opens as My layout, with every toggle', () => {
    for (const preset of ['grid', 'planner']) {
      useBoardStore.setState({ board: board('station', preset) });
      expect(presetOf(station())).toBe('classic');
      render(<StationToolbar />);
      for (const w of ['Timer', 'Todos', 'Habits', 'Calendar', 'Clock', 'Analytics', 'Canvas']) expect(has(w)).toBe(true);
      cleanup();
    }
  });

  it('swapping two windows swaps their places in My layout', () => {
    useBoardStore.setState({ board: board('station', 'planner') });
    useBoardStore.getState().swapMotherSlots('mother-clock', 'mother-calendar');
    expect(cfg('mother-clock').stationSlot).toBe('top-right-upper');
    expect(cfg('mother-calendar').stationSlot).toBe('top-right-lower');
  });

  it('the CLI words: classic, mine, station, canvas; grid and planner are refused', () => {
    expect(layoutChoiceOf('canvas', undefined)).toBe('free');
    expect(parseLayoutChoice('station', 'classic')).toBe('classic');
    expect(parseLayoutChoice('mine', 'classic')).toBe('classic');
    expect(parseLayoutChoice('canvas', 'classic')).toBe('free');
    expect(parseLayoutChoice('Planner', 'classic')).toBeNull();
    expect(parseLayoutChoice('grid', 'classic')).toBeNull();
  });
});
