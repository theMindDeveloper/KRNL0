/** `settings station-layout` (Decision 52) — the Station's Classic / Grid preset from the CLI. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SysFacade } from '../../../src/sys/SysFacade';
import { BoardSchema } from '../../../src/shared/schemas/board.schema';

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test'), getAppPath: vi.fn(() => tmpdir()), on: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}));

type Station = { preset?: string; rowFraction?: number; bottomFractions?: Record<string, number>; grid?: { rowFraction?: number } };
let dir = '';
let boardPath = '';
const read = () => JSON.parse(readFileSync(boardPath, 'utf-8')) as { layoutGeometry?: { station?: Station } };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'krnl0-station-preset-'));
  boardPath = join(dir, 'board.json');
  writeFileSync(boardPath, JSON.stringify({
    version: 1, schemaVersion: 2, layoutMode: 'station', viewport: { x: 0, y: 0, zoom: 1 }, nodes: [], edges: [],
    layoutGeometry: { station: { rowFraction: 0.4, columnFractions: [0.25, 0.25, 0.25, 0.25], rightColumnSplit: 0.6, bottomFractions: { 'station-bottom-canvas': 0.5 } } },
  }), 'utf-8');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const facade = (onBoardChanged = vi.fn()) => new SysFacade({ boardPath, hasOpenRenderer: () => false, onBoardChanged });

describe('settings station-layout (Decision 52)', () => {
  it('is classic until set', async () => {
    expect((await facade().run(['settings', 'station-layout'])).message).toBe('station layout: classic');
  });

  it('switches to grid, keeps the Classic sizes, tells the window', async () => {
    const changed = vi.fn();
    const res = await facade(changed).run(['settings', 'station-layout', 'grid']);
    expect(res.ok).toBe(true);
    const st = read().layoutGeometry?.station;
    expect(st?.preset).toBe('grid');
    expect(st?.rowFraction).toBe(0.4);
    expect(st?.bottomFractions).toEqual({ 'station-bottom-canvas': 0.5 });
    expect(changed).toHaveBeenCalledTimes(1);
    expect((await facade().run(['settings', 'station-layout', 'classic'])).ok).toBe(true);
    expect(read().layoutGeometry?.station?.preset).toBe('classic');
  });

  it('rejects anything else and writes nothing', async () => {
    const res = await facade().run(['settings', 'station-layout', 'masonry']);
    expect(res.ok).toBe(false);
    expect(read().layoutGeometry?.station?.preset).toBeUndefined();
  });

  it('the board schema accepts the preset and the Grid sizes', () => {
    const station = { rowFraction: 0.4, columnFractions: [0.25], rightColumnSplit: 0.6, preset: 'grid', grid: { rowFraction: 0.5, top: [0.3, 0.3, 0.4], bottom: [0.66, 0.34] } };
    const shape = BoardSchema.shape.layoutGeometry.unwrap().shape.station.unwrap();
    expect(shape.safeParse(station).success).toBe(true);
    expect(shape.safeParse({ ...station, preset: 'masonry' }).success).toBe(false);
  });
});
