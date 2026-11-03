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

describe('settings layout', () => {
  it('shows the current layout', async () => {
    expect((await facade().run(['settings', 'layout'])).message).toBe('layout: canvas');
  });

  it('switches to station and tells the window', async () => {
    const changed = vi.fn();
    const res = await facade(changed).run(['settings', 'layout', 'station']);
    expect(res.ok).toBe(true);
    expect(read().layoutMode).toBe('station');
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('rejects anything else and writes nothing', async () => {
    const res = await facade().run(['settings', 'layout', 'grid']);
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
});
