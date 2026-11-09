/**
 * Audit 2026-11-09, group A — paths that could lose the user's data.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBoardFrom, migrateBoard, seedBoard, BoardCorruptError } from '../../../src/main/persistence/board';
import { SysFacade } from '../../../src/sys/SysFacade';

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test'), getAppPath: vi.fn(() => tmpdir()), on: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}));

let dir = '';
let boardPath = '';
const BROKEN = '{"nodes": [ {"id": "mine"';
const backups = () => readdirSync(dir).filter((f) => f.startsWith('board.json.corrupt-'));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'krnl-audit-a-'));
  boardPath = join(dir, 'board.json');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('a damaged board.json', () => {
  it('writers get an error, never an empty board to merge with or save over', () => {
    writeFileSync(boardPath, BROKEN, 'utf-8');
    expect(() => loadBoardFrom(boardPath, { seedIfCorrupt: false })).toThrow(BoardCorruptError);
    expect(readFileSync(boardPath, 'utf-8')).toBe(BROKEN);
  });

  it('is copied aside once per version, not on every read (the reminder check reads every 30 s)', () => {
    writeFileSync(boardPath, BROKEN, 'utf-8');
    for (let i = 0; i < 5; i++) loadBoardFrom(boardPath);
    expect(backups()).toHaveLength(1);
  });

  it('a terminal command changes nothing and says why', async () => {
    writeFileSync(boardPath, BROKEN, 'utf-8');
    const f = new SysFacade({ boardPath, hasOpenRenderer: () => false, onBoardChanged: () => {} });
    const res = await f.run(['habit', 'add', 'Read']);
    expect(res.ok).toBe(false);
    expect(res.message).toContain('damaged');
    expect(readFileSync(boardPath, 'utf-8')).toBe(BROKEN);
    expect((await f.run(['help'])).ok).toBe(true);
  });
});

describe('event delete', () => {
  it('deletes a repeating event, and never a habit with the same name', async () => {
    writeFileSync(boardPath, JSON.stringify(seedBoard()), 'utf-8');
    const f = new SysFacade({ boardPath, hasOpenRenderer: () => false, onBoardChanged: () => {} });
    await f.run(['habit', 'add', 'Gym']);
    await f.run(['routine', 'add', 'Class', '--days', 'mon', '--at', '10:00', '--for', '60']);
    const names = () => (JSON.parse(readFileSync(boardPath, 'utf-8')).nodes.find((n: { kind: string; isMother?: boolean }) => n.kind === 'habit' && n.isMother).state.habits as Array<{ name: string }>).map((h) => h.name);
    const res = await f.run(['event', 'delete', 'Gym']);
    expect(res.ok).toBe(false);
    expect(res.message).toContain('not a repeating event');
    expect(names()).toContain('Gym');
    expect((await f.run(['event', 'delete', 'Class'])).ok).toBe(true);
    expect(names()).toEqual(['Gym']);
  });
});

describe('Clear focus history', () => {
  it('stays cleared after the next load (the ledger backfill skips what was cleared)', () => {
    const board = seedBoard() as { nodes: Array<Record<string, unknown>>; completions?: unknown[]; completionsClearedAt?: string };
    board.nodes.push({ id: 't1', kind: 'todo.task', position: { x: 0, y: 0 }, state: { text: 'Done thing', done: true, completedAt: '2026-11-08T10:00:00.000Z' }, config: {} });
    const before = migrateBoard(structuredClone(board)) as { completions: unknown[] };
    expect(before.completions).toHaveLength(1);
    board.completions = [];
    board.completionsClearedAt = '2026-11-09T09:00:00.000Z';
    const after = migrateBoard(structuredClone(board)) as { completions: unknown[] };
    expect(after.completions).toEqual([]);
  });
});
