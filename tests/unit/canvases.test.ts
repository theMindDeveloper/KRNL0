/**
 * canvases.test.ts — Decision 33 / docs/06-requirements/canvases.md.
 * Migration, visibility filtering, store actions, CLI round trip and the
 * delete-keeps-mother-data guarantee.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  DEFAULT_CANVAS_ID,
  addCanvas,
  deleteCanvas,
  edgesOnCanvas,
  isOnCanvas,
  normalizeCanvases,
  resolveCanvas,
  switchCanvas,
  visibleNodeIds,
} from '../../src/shared/canvas';
import { loadBoardFrom } from '../../src/main/persistence/board';
import { useBoardStore } from '../../src/renderer/store/boardStore';
import type { Board, Node, Edge } from '../../src/shared/types';

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test') },
  ipcMain: { handle: vi.fn() },
  protocol: { handle: vi.fn(), registerSchemesAsPrivileged: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

const mother = (id: string, kind: string): Node => ({ id, kind, position: { x: 0, y: 0 }, isMother: true, state: {}, config: {} });
const free = (id: string, kind: string, canvasId?: string): Node => ({
  id, kind, position: { x: 0, y: 500 }, isMother: false, state: {}, config: {}, ...(canvasId ? { canvasId } : {}),
});
const link = (id: string, from: string, to: string): Edge => ({
  id, from: { nodeId: from, event: 'link' }, to: { nodeId: to, command: 'link' }, enabled: true,
});

function board(partial: Partial<Board> = {}): Board {
  return {
    version: 1, schemaVersion: 2, savedAt: '2026-11-02T00:00:00.000Z', viewport: { x: 0, y: 0, zoom: 1 },
    layoutMode: 'canvas', nodes: [], edges: [], ...partial,
  };
}

/** Two canvases: Main (text-a) and Scratch (text-b, image-b, strokes, task link). */
function twoCanvasBoard(): Board {
  return normalizeCanvases(board({
    canvases: [{ id: 'canvas-main', name: 'Main' }, { id: 'c-scratch', name: 'Scratch' }],
    activeCanvasId: 'c-scratch',
    nodes: [
      mother('mother-pomo', 'pomo'),
      { ...mother('mother-todo', 'todo'), state: { items: [{ id: 'i1', taskNodeId: 'task-1' }] } },
      { ...free('task-1', 'todo.task'), state: { text: 'Write', done: true, completedAt: '2026-11-01T10:00:00.000Z' } },
      free('lane-1', 'habit.lane'),
      free('text-a', 'text', 'canvas-main'),
      free('text-b', 'text', 'c-scratch'),
      free('image-b', 'image', 'c-scratch'),
    ],
    edges: [link('e-ab', 'text-a', 'text-a'), link('e-task-b', 'task-1', 'text-b'), link('e-b', 'text-b', 'image-b')],
    drawings: [
      { id: 's-main', tool: 'pen', color: '#fff', size: 2, points: [[0, 0, 0.5]], createdAt: '', canvasId: 'canvas-main' },
      { id: 's-scratch', tool: 'pen', color: '#fff', size: 2, points: [[0, 0, 0.5]], createdAt: '', canvasId: 'c-scratch' },
    ],
    completions: [{ taskId: 'task-1', text: 'Write', plannedMin: 25, completedAt: '2026-11-01T10:00:00.000Z' }],
  }));
}

// ── F4 migration ─────────────────────────────────────────────────────────────

describe('F4 — migration', () => {
  let tmp = '';
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'krnl0-canvas-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('legacy board lands on Main; shared nodes get no canvasId; idempotent', () => {
    const path = join(tmp, 'board.json');
    writeFileSync(path, JSON.stringify({
      version: 1, schemaVersion: 1, savedAt: '2026-01-01T00:00:00.000Z', viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        free('t1', 'text'),
        { ...free('task-1', 'todo.task'), canvasId: 'bogus' },
        free('lane-1', 'habit.lane'),
      ],
      edges: [],
      drawings: [{ id: 's1', tool: 'pen', color: '#fff', size: 2, points: [], createdAt: '' }],
    }));
    const loaded = loadBoardFrom(path) as Board;
    expect(loaded.canvases).toEqual([{ id: DEFAULT_CANVAS_ID, name: 'Main' }]);
    expect(loaded.activeCanvasId).toBe(DEFAULT_CANVAS_ID);
    const byId = new Map(loaded.nodes.map((n) => [n.id, n]));
    expect(byId.get('t1')!.canvasId).toBe(DEFAULT_CANVAS_ID);
    expect(byId.get('task-1')!.canvasId).toBeUndefined();
    expect(byId.get('lane-1')!.canvasId).toBeUndefined();
    expect(byId.get('mother-analytics')!.canvasId).toBeUndefined();
    expect(loaded.drawings![0]!.canvasId).toBe(DEFAULT_CANVAS_ID);

    writeFileSync(path, JSON.stringify(loaded));
    expect(loadBoardFrom(path)).toEqual(loaded);
  });

  it('unstamped / unknown free nodes land on the active canvas', () => {
    const b = normalizeCanvases(board({
      canvases: [{ id: 'canvas-main', name: 'Main' }, { id: 'c2', name: 'Two' }],
      activeCanvasId: 'c2',
      nodes: [free('n1', 'text'), free('n2', 'image', 'gone'), free('n3', 'frame', 'canvas-main')],
    }));
    expect(b.nodes.map((n) => n.canvasId)).toEqual(['c2', 'c2', 'canvas-main']);
  });
});

// ── F3 filtering ─────────────────────────────────────────────────────────────

describe('F3 — visibility', () => {
  it('shared nodes everywhere, free nodes and edges only on their canvas', () => {
    const b = twoCanvasBoard();
    const main = visibleNodeIds(b.nodes, 'canvas-main');
    expect([...main].sort()).toEqual(['lane-1', 'mother-pomo', 'mother-todo', 'task-1', 'text-a']);
    expect(edgesOnCanvas(b.edges, main).map((e) => e.id)).toEqual(['e-ab']);
    const scratch = visibleNodeIds(b.nodes, 'c-scratch');
    expect(edgesOnCanvas(b.edges, scratch).map((e) => e.id).sort()).toEqual(['e-b', 'e-task-b']);
    expect(isOnCanvas(free('task-x', 'todo.task', 'c-scratch'), 'canvas-main')).toBe(true);
  });

  it('resolveCanvas matches id, name (case-insensitive) and id prefix', () => {
    const list = [{ id: 'canvas-main', name: 'Main' }, { id: 'canvas-x1', name: 'Ideas' }];
    expect(resolveCanvas(list, 'ideas')).toEqual(list[1]);
    expect(resolveCanvas(list, 'canvas-x')).toEqual(list[1]);
    expect(resolveCanvas(list, 'canvas-')).toBe('ambiguous');
    expect(resolveCanvas(list, 'nope')).toBeNull();
  });
});

// ── F6 delete keeps mother data ──────────────────────────────────────────────

describe('F6 — delete keeps mother data', () => {
  it('removes only the canvas, its free nodes, strokes and touching edges', () => {
    const before = twoCanvasBoard();
    const after = deleteCanvas(before, 'c-scratch')!;
    expect(after.canvases).toEqual([{ id: 'canvas-main', name: 'Main' }]);
    expect(after.activeCanvasId).toBe('canvas-main');
    expect(after.nodes.map((n) => n.id)).toEqual(['mother-pomo', 'mother-todo', 'task-1', 'lane-1', 'text-a']);
    expect(after.edges.map((e) => e.id)).toEqual(['e-ab']);
    expect(after.drawings!.map((d) => d.id)).toEqual(['s-main']);
    // Mother data untouched.
    expect(after.completions).toEqual(before.completions);
    for (const id of ['mother-pomo', 'mother-todo', 'task-1', 'lane-1']) {
      expect(after.nodes.find((n) => n.id === id)).toEqual(before.nodes.find((n) => n.id === id));
    }
  });

  it('refuses to delete the last canvas or an unknown one', () => {
    const one = normalizeCanvases(board({ nodes: [free('t', 'text')] }));
    expect(deleteCanvas(one, DEFAULT_CANVAS_ID)).toBeNull();
    expect(deleteCanvas(twoCanvasBoard(), 'nope')).toBeNull();
  });
});

// ── Store ────────────────────────────────────────────────────────────────────

describe('store canvas actions', () => {
  beforeEach(() => useBoardStore.getState().setBoard(twoCanvasBoard()));

  it('addNode stamps the active canvas (overwriting a copied canvasId); shared nodes stay unstamped', () => {
    const s = useBoardStore.getState();
    s.switchCanvas('canvas-main');
    s.addNode(free('pasted', 'text', 'c-scratch'));
    s.addNode(free('task-2', 'todo.task'));
    const nodes = useBoardStore.getState().board!.nodes;
    expect(nodes.find((n) => n.id === 'pasted')!.canvasId).toBe('canvas-main');
    expect(nodes.find((n) => n.id === 'task-2')!.canvasId).toBeUndefined();
  });

  it('add / rename / delete canvas; undo restores the delete', () => {
    const s = useBoardStore.getState();
    const id = s.addCanvas('Ideas')!;
    expect(useBoardStore.getState().board!.activeCanvasId).toBe(id);
    useBoardStore.getState().renameCanvas(id, 'Notes');
    expect(useBoardStore.getState().board!.canvases!.find((c) => c.id === id)!.name).toBe('Notes');
    expect(useBoardStore.getState().deleteCanvas('c-scratch')).toBe(true);
    expect(useBoardStore.getState().board!.nodes.some((n) => n.id === 'text-b')).toBe(false);
    useBoardStore.getState().undo();
    expect(useBoardStore.getState().board!.nodes.some((n) => n.id === 'text-b')).toBe(true);
  });

  it('clearDrawings only clears the active canvas', () => {
    useBoardStore.getState().switchCanvas('canvas-main');
    useBoardStore.getState().clearDrawings();
    expect(useBoardStore.getState().board!.drawings!.map((d) => d.id)).toEqual(['s-scratch']);
  });

  it('switchCanvas ignores unknown ids', () => {
    useBoardStore.getState().switchCanvas('nope');
    expect(useBoardStore.getState().board!.activeCanvasId).toBe('c-scratch');
    expect(switchCanvas(addCanvas(twoCanvasBoard(), 'X', 'cx'), 'cx').activeCanvasId).toBe('cx');
  });
});

// ── F8 CLI ───────────────────────────────────────────────────────────────────

describe('F8 — krnl canvas CLI', () => {
  let tmp = '';
  let boardPath = '';
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'krnl0-canvas-cli-'));
    boardPath = join(tmp, 'board.json');
    process.env.KRNL0_BOARD_DIR = tmp;
    writeFileSync(boardPath, JSON.stringify(twoCanvasBoard()));
    vi.resetModules();
  });
  afterEach(() => {
    delete process.env.KRNL0_BOARD_DIR;
    rmSync(tmp, { recursive: true, force: true });
  });

  const read = (): Board => JSON.parse(readFileSync(boardPath, 'utf-8')) as Board;

  it('list, add, rename, switch, delete round trip', async () => {
    const { SysFacade } = await import('../../src/sys/SysFacade');
    const sys = new SysFacade();

    const list = await sys.run(['canvas', 'list', '--json']);
    expect(list.ok).toBe(true);
    expect((list.data as Array<{ name: string; active: boolean; nodes: number }>)).toEqual([
      expect.objectContaining({ name: 'Main', active: false, nodes: 1 }),
      expect.objectContaining({ name: 'Scratch', active: true, nodes: 2 }),
    ]);

    const add = await sys.run(['canvas', 'add', 'My', 'Ideas']);
    expect(add.ok).toBe(true);
    const id = (add.data as { id: string }).id;
    expect(read().activeCanvasId).toBe(id);
    expect(read().canvases!.at(-1)!.name).toBe('My Ideas');

    expect((await sys.run(['canvas', 'rename', id, 'Notes'])).ok).toBe(true);
    expect(read().canvases!.find((c) => c.id === id)!.name).toBe('Notes');

    expect((await sys.run(['canvas', 'switch', 'main'])).ok).toBe(true);
    expect(read().activeCanvasId).toBe('canvas-main');

    const del = await sys.run(['canvas', 'delete', 'Scratch']);
    expect(del.ok).toBe(true);
    const after = read();
    expect(after.canvases!.map((c) => c.name)).toEqual(['Main', 'Notes']);
    expect(after.nodes.some((n) => n.id === 'text-b' || n.id === 'image-b')).toBe(false);
    expect(after.nodes.some((n) => n.id === 'task-1')).toBe(true);
    expect(after.completions).toEqual(twoCanvasBoard().completions);
  });

  it('errors: unknown canvas, missing name, last canvas', async () => {
    const { SysFacade } = await import('../../src/sys/SysFacade');
    const sys = new SysFacade();
    expect((await sys.run(['canvas', 'switch', 'nope'])).ok).toBe(false);
    expect((await sys.run(['canvas', 'add'])).ok).toBe(false);
    expect((await sys.run(['canvas', 'delete', 'Scratch'])).ok).toBe(true);
    const last = await sys.run(['canvas', 'delete', 'Main']);
    expect(last.ok).toBe(false);
    expect(last.message).toMatch(/last canvas/);
  });
});
