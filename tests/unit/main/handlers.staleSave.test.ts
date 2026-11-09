/**
 * board:save through the real IPC handler when another writer (the CLI)
 * changed board.json since the renderer's last load or save (Decision 34).
 * Both edits must survive, and a node the user deleted must stay deleted.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type IpcHandler = (event: unknown, ...args: unknown[]) => unknown;
const ipcHandlers = new Map<string, IpcHandler>();

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test'), getAppPath: vi.fn(() => tmpdir()), on: vi.fn() },
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => { ipcHandlers.set(channel, handler); }),
    on: vi.fn(),
  },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  clipboard: { readText: vi.fn(() => ''), writeText: vi.fn() },
}));
vi.mock('node-pty', () => ({ spawn: vi.fn() }));

const dir = mkdtempSync(join(tmpdir(), 'krnl0-stale-save-'));
const boardPath = join(dir, 'board.json');
process.env['KRNL0_BOARD_DIR'] = dir;

type Board = Record<string, unknown> & { nodes: Array<Record<string, unknown>> };
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const readFile = (): Board => JSON.parse(readFileSync(boardPath, 'utf-8')) as Board;
const ids = (b: Board) => b.nodes.map((n) => n['id']);
const invoke = (channel: string, ...args: unknown[]) => ipcHandlers.get(channel)!({ sender: {} }, ...args);

/** What `krnl text add` amounts to: a write by another process, with a newer mtime. */
function cliAddsNote(id: string): void {
  const b = readFile();
  b.nodes.push({ id, kind: 'text', isMother: false, position: { x: 0, y: 1400 }, state: { text: 'from cli' }, config: {} });
  writeFileSync(boardPath, JSON.stringify(b), 'utf-8');
  const later = new Date(Date.now() + 5_000);
  utimesSync(boardPath, later, later);
}

beforeAll(async () => {
  const { seedBoard, saveBoardTo } = await import('../../../src/main/persistence/board');
  saveBoardTo(boardPath, seedBoard());
  const { registerHandlers } = await import('../../../src/main/ipc/handlers');
  registerHandlers();
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('board:save after a CLI write', () => {
  it('keeps the CLI note and the user deletion of a node created since load', async () => {
    const loaded = (await invoke('board:load')) as Board;
    // The renderer creates a task in its own (un-migrated) shape and saves it.
    const task = { id: 'task-new', kind: 'todo.task', isMother: false, position: { x: 900, y: 900 }, state: { text: 'draft', done: false }, config: {} };
    const withTask = { ...clone(loaded), nodes: [...clone(loaded).nodes, task] };
    await invoke('board:save', withTask);
    expect(ids(readFile())).toContain('task-new');

    cliAddsNote('node-cli-1');

    // The user deletes the task; this save is stale.
    await invoke('board:save', { ...clone(withTask), nodes: clone(withTask).nodes.filter((n) => n['id'] !== 'task-new') });
    const after = readFile();
    expect(ids(after)).toContain('node-cli-1');
    expect(ids(after)).not.toContain('task-new');
  });

  it('a save already in flight before the reload merges too, instead of reverting', async () => {
    const loaded = (await invoke('board:load')) as Board;
    cliAddsNote('node-cli-2');
    const edited = clone(loaded);
    edited['uiMode'] = 'advanced';
    await invoke('board:save', edited);       // stale → merged, awaiting reload
    await invoke('board:save', clone(edited)); // still before the reload
    const after = readFile();
    expect(ids(after)).toContain('node-cli-2');
    expect(after['uiMode']).toBe('advanced');
  });
});

describe('board:save when board.json was damaged meanwhile (audit 2026-11-09)', () => {
  it('writes the window\'s board back as it is, never merged with an empty board', async () => {
    const loaded = (await invoke('board:load')) as Board;
    const note = { id: 'note-keep', kind: 'text', isMother: false, position: { x: 0, y: 0 }, state: { text: 'keep me' }, config: {} };
    const mine = { ...clone(loaded), uiMode: 'advanced', nodes: [...clone(loaded).nodes, note] };
    await invoke('board:save', mine);
    // Someone breaks the file (a bad hand edit): newer mtime, not JSON.
    writeFileSync(boardPath, '{"nodes": [ {"id"', 'utf-8');
    const later = new Date(Date.now() + 10_000);
    utimesSync(boardPath, later, later);
    // The user's next edit (a stale save) must keep everything.
    await invoke('board:save', clone(mine));
    const after = readFile();
    expect(ids(after)).toContain('note-keep');
    expect(after['uiMode']).toBe('advanced');
  });
});
