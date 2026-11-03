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
