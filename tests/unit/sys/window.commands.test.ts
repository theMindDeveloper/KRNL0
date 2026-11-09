/**
 * Audit #52 (rule 8) — window actions that had no krnl command.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SysFacade } from '../../../src/sys/SysFacade';
import { seedBoard } from '../../../src/main/persistence/board';

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test'), getAppPath: vi.fn(() => tmpdir()), on: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}));

type N = { id: string; kind: string; isMother?: boolean; position: { x: number; y: number }; config: Record<string, unknown>; state: Record<string, unknown> };
let dir = '';
let boardPath = '';
let f: SysFacade;
const nodes = () => (JSON.parse(readFileSync(boardPath, 'utf-8')) as { nodes: N[] }).nodes;
const mother = (kind: string) => nodes().find((n) => n.kind === kind && n.isMother)!;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'krnl-window-'));
  boardPath = join(dir, 'board.json');
  const b = seedBoard() as { nodes: N[]; uiMode?: string };
  b.uiMode = 'advanced';
  b.nodes.push({ id: 'media-1234abcd', kind: 'media', position: { x: 0, y: 0 }, config: {}, state: { title: 'old' } });
  b.nodes.push({ id: 'image-1234abcd', kind: 'image', position: { x: 0, y: 0 }, config: {}, state: {} });
  writeFileSync(boardPath, JSON.stringify(b), 'utf-8');
  f = new SysFacade({ boardPath, hasOpenRenderer: () => false, onBoardChanged: () => {} });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('krnl window', () => {
  it('hides and shows a window, and lists it', async () => {
    expect((await f.run(['window', 'hide', 'calendar'])).ok).toBe(true);
    expect(mother('calendar').config['stationHidden']).toBe(true);
    expect(String((await f.run(['window', 'list'])).message)).toMatch(/calendar\s+hidden/);
    expect((await f.run(['window', 'show', 'calendar'])).ok).toBe(true);
    expect(mother('calendar').config['stationHidden']).toBe(false);
    expect((await f.run(['window', 'hide', 'kitchen'])).ok).toBe(false);
  });

  it('swaps two windows\' places', async () => {
    const before = { todo: mother('todo').position, clock: mother('clock').position };
    expect((await f.run(['window', 'swap', 'todo', 'clock'])).ok).toBe(true);
    expect(mother('todo').position).toEqual(before.clock);
    expect(mother('clock').position).toEqual(before.todo);
  });
});

describe('labels and settings', () => {
  it('pomo label names what the timer records', async () => {
    expect((await f.run(['pomo', 'label', 'Reading'])).ok).toBe(true);
    expect(JSON.stringify(mother('pomo').state)).toContain('Reading');
  });

  it('analytics set changes the page and range, and refuses nonsense', async () => {
    expect((await f.run(['analytics', 'set', '--view', 'time', '--range', '90'])).ok).toBe(true);
    const a = nodes().find((n) => n.kind === 'analytics')!;
    expect(a.state).toMatchObject({ view: 'time', rangeDays: 90 });
    expect((await f.run(['analytics', 'set', '--range', '12'])).ok).toBe(false);
  });

  it('media title and image alt', async () => {
    expect((await f.run(['media', 'title', 'media-12', 'Lecture 3'])).ok).toBe(true);
    expect(nodes().find((n) => n.id === 'media-1234abcd')!.state['title']).toBe('Lecture 3');
    expect((await f.run(['image', 'alt', 'image-12', 'A whiteboard sketch'])).ok).toBe(true);
    expect(nodes().find((n) => n.id === 'image-1234abcd')!.state['alt']).toBe('A whiteboard sketch');
  });
});
