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
