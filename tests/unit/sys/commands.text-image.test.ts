/**
 * commands.text-image.test.ts — exercises the sys CLI text/image dispatch
 * against a temp board.json. `electron` is mocked so the main-process imports
 * don't blow up under Node-only vitest.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test') },
  ipcMain: { handle: vi.fn() },
  protocol: { handle: vi.fn(), registerSchemesAsPrivileged: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

let tmp = '';
let boardPath = '';

function seedBoard(): void {
  writeFileSync(
    boardPath,
    JSON.stringify({
      version: 1,
      schemaVersion: 1,
      savedAt: '2026-05-12T00:00:00.000Z',
      viewport: { x: 0, y: 220, zoom: 1 },
      nodes: [],
      edges: [],
    }),
    'utf-8',
  );
}

function readBoard(): {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
} {
  return JSON.parse(readFileSync(boardPath, 'utf-8'));
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'krnl0-sys-'));
  boardPath = join(tmp, 'board.json');
  process.env.KRNL0_BOARD_DIR = tmp;
  seedBoard();
  vi.resetModules();
});

afterEach(() => {
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    // best-effort
  }
});

const PNG_MAGIC = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ...new Array(20).fill(0),
]);

describe('sys text', () => {
  it('text add creates a TextNode in board.json', async () => {
    const { SysFacade } = await import('../../../src/sys/SysFacade');
    const facade = new SysFacade();
    const res = await facade.run([
      'text', 'add', '--text', 'hello', '--at', '100,200',
    ]);
    expect(res.ok).toBe(true);
    const board = readBoard();
    expect(board.nodes).toHaveLength(1);
    const node = board.nodes[0] as Record<string, unknown>;
    expect(node['kind']).toBe('text');
    expect(node['position']).toEqual({ x: 100, y: 200 });
    expect((node['state'] as { text: string }).text).toBe('hello');
  });

  it('text set updates an existing TextNode', async () => {
    const { SysFacade } = await import('../../../src/sys/SysFacade');
    const facade = new SysFacade();
    const add = await facade.run(['text', 'add', '--text', 'orig']);
    const id = (add.data as { id: string }).id;
    const res = await facade.run(['text', 'set', id, '--text', 'changed']);
    expect(res.ok).toBe(true);
    const board = readBoard();
    expect((board.nodes[0] as Record<string, unknown>)['state']).toMatchObject({
      text: 'changed',
    });
  });

  it('text resize writes width/height', async () => {
    const { SysFacade } = await import('../../../src/sys/SysFacade');
    const facade = new SysFacade();
    const add = await facade.run(['text', 'add']);
    const id = (add.data as { id: string }).id;
    const res = await facade.run([
      'text', 'resize', id, '--w', '500', '--h', '300',
    ]);
    expect(res.ok).toBe(true);
    const board = readBoard();
    const state = (board.nodes[0] as Record<string, unknown>)['state'] as {
      width: number;
      height: number;
    };
    expect(state.width).toBe(500);
    expect(state.height).toBe(300);
  });

  it('text set / resize accept the short id a listing prints, and reject a non-positive size', async () => {
    const { SysFacade } = await import('../../../src/sys/SysFacade');
    const facade = new SysFacade();
    const add = await facade.run(['text', 'add', '--text', 'orig']);
    const id = (add.data as { id: string }).id;
    const prefix = id.slice(0, id.length - 3);
    expect((await facade.run(['text', 'set', prefix, '--text', 'via prefix'])).ok).toBe(true);
    expect(((readBoard().nodes[0] as Record<string, unknown>)['state'] as { text: string }).text).toBe('via prefix');
    expect((await facade.run(['text', 'resize', prefix, '--w', '-100', '--h', '0'])).ok).toBe(false);
  });
});

describe('sys image', () => {
  it('image add copies the file to assets/ and creates an ImageNode', async () => {
    const srcPath = join(tmp, 'sample.png');
    writeFileSync(srcPath, PNG_MAGIC);
    const { SysFacade } = await import('../../../src/sys/SysFacade');
    const facade = new SysFacade();
    const res = await facade.run([
      'image', 'add', srcPath, '--at', '50,60',
    ]);
    expect(res.ok).toBe(true);
    const assetsDir = join(tmp, 'assets');
    expect(existsSync(assetsDir)).toBe(true);
    expect(readdirSync(assetsDir).length).toBe(1);
    const board = readBoard();
    const node = board.nodes[0] as Record<string, unknown>;
    expect(node['kind']).toBe('image');
    expect(node['position']).toEqual({ x: 50, y: 60 });
    const state = node['state'] as { assetId: string | null };
    expect(state.assetId).toMatch(/^[A-Z0-9]{20,32}$/);
  });

  it('image add rejects an invalid file (no magic bytes)', async () => {
    const srcPath = join(tmp, 'bogus.png');
    writeFileSync(srcPath, new Uint8Array([0, 0, 0, 0]));
    const { SysFacade } = await import('../../../src/sys/SysFacade');
    const facade = new SysFacade();
    const res = await facade.run(['image', 'add', srcPath]);
    expect(res.ok).toBe(false);
  });

  it('image clear nulls the assetId field', async () => {
    const srcPath = join(tmp, 'pic.png');
    writeFileSync(srcPath, PNG_MAGIC);
    const { SysFacade } = await import('../../../src/sys/SysFacade');
    const facade = new SysFacade();
    const add = await facade.run(['image', 'add', srcPath]);
    const id = (add.data as { id: string }).id;
    const res = await facade.run(['image', 'clear', id]);
    expect(res.ok).toBe(true);
    const board = readBoard();
    const state = (board.nodes[0] as Record<string, unknown>)['state'] as {
      assetId: string | null;
    };
    expect(state.assetId).toBeNull();
  });
});

describe('sys text look', () => {
  it('turns a note into a sticky, a shape, and back', async () => {
    const { SysFacade } = await import('../../../src/sys/SysFacade');
    const facade = new SysFacade();
    await facade.run(['text', 'add', '--text', 'idea', '--at', '0,0']);
    const id = readBoard().nodes[0]!['id'] as string;
    const look = () => (readBoard().nodes[0]!['state'] as { look?: { kind: string; color?: string } }).look;
    expect((await facade.run(['text', 'look', id, '--sticky', '--color', '#ffb3c7'])).ok).toBe(true);
    expect(look()).toEqual({ kind: 'sticky', color: '#ffb3c7' });
    expect((await facade.run(['text', 'look', id, '--shape', 'ellipse'])).ok).toBe(true);
    expect(look()?.kind).toBe('ellipse');
    expect((await facade.run(['text', 'look', id, '--shape', 'hexagon'])).ok).toBe(false);
    expect((await facade.run(['text', 'look', id])).ok).toBe(false);
  });
});

describe('sys analytics cards', () => {
  it('lists, hides, shows and resets chart cards', async () => {
    writeFileSync(boardPath, JSON.stringify({
      version: 1, schemaVersion: 2, viewport: { x: 0, y: 0, zoom: 1 }, edges: [],
      nodes: [{ id: 'mother-analytics', kind: 'analytics', isMother: true, position: { x: 0, y: 0 }, state: {}, config: {} }],
    }), 'utf-8');
    const { SysFacade } = await import('../../../src/sys/SysFacade');
    const facade = new SysFacade();
    const list = await facade.run(['analytics', 'cards', '--json']);
    const rows = list.data as Array<{ id: string; shown: boolean }>;
    expect(rows.length).toBeGreaterThan(3);
    const first = rows[0]!.id;
    expect((await facade.run(['analytics', 'hide', first])).ok).toBe(true);
    const hidden = () => (readBoard().nodes[0]!['state'] as { hiddenCards?: string[] }).hiddenCards ?? [];
    expect(hidden()).toContain(first);
    expect((await facade.run(['analytics', 'unhide', first])).ok).toBe(true);
    expect(hidden()).not.toContain(first);
    await facade.run(['analytics', 'hide', first]);
    expect((await facade.run(['analytics', 'reset-cards'])).ok).toBe(true);
    expect(hidden()).toEqual([]);
    expect((await facade.run(['analytics', 'hide', 'no-such-card'])).ok).toBe(false);
  });
});

describe('sys media resize / page, draw stroke, analytics clear-history', () => {
  const seedWith = (extra: Record<string, unknown>) => writeFileSync(boardPath, JSON.stringify({
    version: 1, schemaVersion: 2, viewport: { x: 0, y: 0, zoom: 1 }, edges: [], nodes: [], ...extra,
  }), 'utf-8');

  it('media resize and page', async () => {
    seedWith({ nodes: [{ id: 'node-pdf-1234', kind: 'media', isMother: false, position: { x: 0, y: 0 }, config: {}, state: { media: 'pdf', src: 'x.pdf', title: 'x', width: 300, height: 400 } }] });
    const { SysFacade } = await import('../../../src/sys/SysFacade');
    const f = new SysFacade();
    expect((await f.run(['media', 'resize', 'node-pdf', '--w', '500', '--h', '600'])).ok).toBe(true);
    expect((await f.run(['media', 'page', 'node-pdf', '3'])).ok).toBe(true);
    const st = readBoard().nodes[0]!['state'] as { width: number; height: number; page: number };
    expect([st.width, st.height, st.page]).toEqual([500, 600, 3]);
    expect((await f.run(['media', 'page', 'node-pdf', '0'])).ok).toBe(false);
  });

  it('draw stroke adds a stroke through the given points', async () => {
    seedWith({});
    const { SysFacade } = await import('../../../src/sys/SysFacade');
    const f = new SysFacade();
    const res = await f.run(['draw', 'stroke', '--points', '0,0 100,50 200,0', '--tool', 'arrow', '--color', '#ff5d8f']);
    expect(res.ok).toBe(true);
    const d = (readBoard() as unknown as { drawings: Array<{ tool: string; color: string; points: number[][] }> }).drawings;
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ tool: 'arrow', color: '#ff5d8f' });
    expect(d[0]!.points.map((p) => [p[0], p[1]])).toEqual([[0, 0], [100, 50], [200, 0]]);
    expect((await f.run(['draw', 'stroke', '--points', '5,5'])).ok).toBe(false);
  });

  it('analytics clear-history needs --yes, then wipes spans and the ledger', async () => {
    seedWith({
      completions: [{ taskId: 't', text: 'a', plannedMin: 25, completedAt: '2026-11-01T10:00:00.000Z' }],
      nodes: [{ id: 'mother-pomo', kind: 'pomo', isMother: true, position: { x: 0, y: 0 }, config: {}, state: { history: [{ id: 's1' }] } }],
    });
    const { SysFacade } = await import('../../../src/sys/SysFacade');
    const f = new SysFacade();
    expect((await f.run(['analytics', 'clear-history'])).ok).toBe(false);
    expect(((readBoard().nodes[0]!['state']) as { history: unknown[] }).history).toHaveLength(1);
    expect((await f.run(['analytics', 'clear-history', '--yes'])).ok).toBe(true);
    const b = readBoard() as unknown as { completions?: unknown[]; nodes: Array<{ state: { history: unknown[] } }> };
    expect(b.nodes[0]!.state.history).toEqual([]);
    expect(b.completions ?? []).toEqual([]);
  });
});
