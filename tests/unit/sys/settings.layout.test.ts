/** `settings mode` / `settings layout` — the UI preferences the top bar sets, from the CLI. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SysFacade } from '../../../src/sys/SysFacade';

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test'), getAppPath: vi.fn(() => tmpdir()), on: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}));

let dir = '';
let boardPath = '';
const read = () => JSON.parse(readFileSync(boardPath, 'utf-8')) as { layoutMode?: string; uiMode?: string };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'krnl0-settings-'));
  boardPath = join(dir, 'board.json');
  writeFileSync(boardPath, JSON.stringify({ version: 1, schemaVersion: 2, layoutMode: 'canvas', viewport: { x: 0, y: 0, zoom: 1 }, nodes: [], edges: [] }), 'utf-8');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const facade = (onBoardChanged = vi.fn()) => new SysFacade({ boardPath, hasOpenRenderer: () => false, onBoardChanged });

describe('settings layout (Decision 54: the layout menu)', () => {
  const geo = () => (JSON.parse(readFileSync(boardPath, 'utf-8')) as { layoutGeometry?: { station?: { preset?: string } } }).layoutGeometry?.station;
  it('shows the current layout and lists My layout, Free canvas and reset (Decision 60)', async () => {
    const res = await facade().run(['settings', 'layout']);
    expect(res.message.split('\n')[0]).toBe('layout: free — Free canvas (canvas)');
    for (const o of ['classic', 'free', 'reset']) expect(res.message).toContain(`  ${o}`);
    expect(res.message).not.toContain('  grid');
    expect(res.message).not.toContain('  planner');
  });

  it('the old word "station" opens the Station and tells the window', async () => {
    const changed = vi.fn();
    const res = await facade(changed).run(['settings', 'layout', 'station']);
    expect(res.ok).toBe(true);
    expect(read().layoutMode).toBe('station');
    expect(geo()?.preset).toBe('classic');
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('mine opens My layout; free goes back to the canvas; grid and planner are refused (Decision 60)', async () => {
    expect((await facade().run(['settings', 'layout', 'mine'])).message).toBe('layout: classic — My layout (Station)');
    expect(read().layoutMode).toBe('station');
    expect((await facade().run(['settings', 'layout', 'planner'])).ok).toBe(false);
    expect((await facade().run(['settings', 'layout', 'grid'])).ok).toBe(false);
    expect(read().layoutMode).toBe('station');
    expect((await facade().run(['settings', 'layout', 'free'])).ok).toBe(true);
    expect(read().layoutMode).toBe('canvas');
    expect((await facade().run(['settings', 'layout', 'station'])).message).toBe('layout: classic — My layout (Station)');
  });

  it('reset puts My layout back: Timer, Clock and Todos over a full-width Calendar (F9)', async () => {
    writeFileSync(boardPath, JSON.stringify({ version: 1, schemaVersion: 2, layoutMode: 'canvas', viewport: { x: 0, y: 0, zoom: 1 }, edges: [], nodes: [
      { id: 'mother-pomo', kind: 'pomo', isMother: true, position: { x: 0, y: 0 }, config: { stationSlot: 'top-center' }, state: {} },
      { id: 'mother-calendar', kind: 'calendar', isMother: true, position: { x: 0, y: 0 }, config: { stationSlot: 'top-right-upper' }, state: {} },
      { id: 'mother-habit', kind: 'habit', isMother: true, position: { x: 0, y: 0 }, config: { stationSlot: 'top-right-pre' }, state: {} },
    ] }), 'utf-8');
    const res = await facade().run(['settings', 'layout', 'reset']);
    expect(res.ok).toBe(true);
    const b = JSON.parse(readFileSync(boardPath, 'utf-8')) as { layoutMode: string; nodes: Array<{ kind: string; config: { stationSlot?: string; stationHidden?: boolean } }>; layoutGeometry: { station: { canvasHidden?: boolean } } };
    const c = (k: string) => b.nodes.find((n) => n.kind === k)!.config;
    expect(b.layoutMode).toBe('station');
    expect(c('pomo').stationSlot).toBe('top-left');
    expect(c('calendar').stationSlot).toBe('top-right-lower');
    expect(c('habit').stationHidden).toBe(true);
    expect(b.layoutGeometry.station.canvasHidden).toBe(true);
  });

  it('rejects anything else and writes nothing', async () => {
    const res = await facade().run(['settings', 'layout', 'masonry']);
    expect(res.ok).toBe(false);
    expect(read().layoutMode).toBe('canvas');
  });
});

describe('settings mode', () => {
  it('sets easy / advanced', async () => {
    expect((await facade().run(['settings', 'mode', 'easy'])).ok).toBe(true);
    expect(read().uiMode).toBe('easy');
    expect((await facade().run(['settings', 'mode', 'nope'])).ok).toBe(false);
  });
});

describe('clock half / cal zoom', () => {
  const seed = () => writeFileSync(boardPath, JSON.stringify({
    version: 1, schemaVersion: 2, layoutMode: 'canvas', viewport: { x: 0, y: 0, zoom: 1 }, edges: [],
    nodes: [
      { id: 'mother-clock', kind: 'clock', isMother: true, position: { x: 0, y: 0 }, config: {}, state: { selectedDate: '2026-11-03', viewWindow: 0 } },
      { id: 'mother-calendar', kind: 'calendar', isMother: true, position: { x: 0, y: 0 }, config: { view: 'week' }, state: { selectedDate: null, anchorDate: '2026-11-03' } },
    ],
  }), 'utf-8');
  const node = (id: string) => (JSON.parse(readFileSync(boardPath, 'utf-8')) as { nodes: Array<{ id: string; state: Record<string, unknown> }> }).nodes.find((n) => n.id === id)!;

  it('clock half sets AM / PM and toggles', async () => {
    seed();
    expect((await facade().run(['clock', 'half', 'pm'])).ok).toBe(true);
    expect(node('mother-clock').state['viewWindow']).toBe(1);
    await facade().run(['clock', 'half']);
    expect(node('mother-clock').state['viewWindow']).toBe(0);
    expect((await facade().run(['clock', 'half', 'noon'])).ok).toBe(false);
  });

  it('cal zoom sets the hour height within 1–6', async () => {
    seed();
    expect((await facade().run(['cal', 'zoom', '4'])).ok).toBe(true);
    expect(node('mother-calendar').state['zoom']).toBe(4);
    expect((await facade().run(['cal', 'zoom', '9'])).ok).toBe(false);
  });

  it('cal layers shows and switches the recorded rail and habit pills', async () => {
    seed();
    const changed = vi.fn();
    expect((await facade().run(['cal', 'layers'])).message).toBe('recorded on · habits on · routines on · linked on');
    const off = await facade(changed).run(['cal', 'layers', 'habits', 'off']);
    expect(off.ok).toBe(true);
    expect(node('mother-calendar').state['layers']).toEqual({ recorded: true, habits: false, routines: true, linked: true });
    expect(changed).toHaveBeenCalled();
    expect((await facade().run(['cal', 'layers', 'habits', 'maybe'])).ok).toBe(false);
    expect((await facade().run(['cal', 'layers', 'pomo', 'on'])).ok).toBe(false);
  });
});

describe('settings grid — Align to grid (align-grid.md F4)', () => {
  const grid = () => (JSON.parse(readFileSync(boardPath, 'utf-8')) as { alignGrid?: string }).alignGrid;
  it('is off by default', async () => {
    expect((await facade().run(['settings', 'grid'])).message).toBe('grid: off');
  });
  it('cards only, everything, off — and tells the window', async () => {
    const changed = vi.fn();
    expect((await facade(changed).run(['settings', 'grid', 'on'])).ok).toBe(true);
    expect(grid()).toBe('cards');
    expect((await facade(changed).run(['settings', 'grid', 'all'])).ok).toBe(true);
    expect(grid()).toBe('all');
    expect((await facade(changed).run(['settings', 'grid', 'off'])).ok).toBe(true);
    expect(grid()).toBeUndefined();
    expect(changed).toHaveBeenCalledTimes(3);
  });
  it('rejects anything else and writes nothing', async () => {
    expect((await facade().run(['settings', 'grid', 'maybe'])).ok).toBe(false);
    expect(grid()).toBeUndefined();
  });
});
