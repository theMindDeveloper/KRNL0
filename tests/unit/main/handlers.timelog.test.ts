/**
 * Decision 35 — `timelog:append` / `timelog:query` IPC handlers and the
 * startup backfill, through the real handler module (electron mocked).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
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

const dir = mkdtempSync(join(tmpdir(), 'krnl0-timelog-ipc-'));
const boardPath = join(dir, 'board.json');
process.env['KRNL0_BOARD_DIR'] = dir;

const invoke = (channel: string, ...args: unknown[]) => ipcHandlers.get(channel)!({ sender: {} }, ...args);
let backfillTimeLogAtStartup: () => number;

beforeAll(async () => {
  const { seedBoard, saveBoardTo } = await import('../../../src/main/persistence/board');
  const board = seedBoard() as unknown as { nodes: Array<Record<string, unknown>> };
  const pomo = board.nodes.find((n) => n['kind'] === 'pomo')!;
  pomo['state'] = {
    ...(pomo['state'] as object),
    history: [{ id: 'old-span', startedAt: '2026-10-20T09:00:00.000Z', endedAt: '2026-10-20T10:00:00.000Z', durationMin: 60, label: 'x', completed: true, taskId: null, kind: 'work' }],
  };
  saveBoardTo(boardPath, board);
  const handlers = await import('../../../src/main/ipc/handlers');
  handlers.registerHandlers();
  backfillTimeLogAtStartup = handlers.backfillTimeLogAtStartup;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('timelog IPC', () => {
  it('the startup backfill writes the board history once', () => {
    expect(backfillTimeLogAtStartup()).toBe(1);
    expect(existsSync(join(dir, 'timelog', '.backfilled'))).toBe(true);
    expect(existsSync(join(dir, 'timelog', '2026-10.jsonl'))).toBe(true);
    expect(backfillTimeLogAtStartup()).toBe(0);
  });

  it('timelog:append validates, stamps and stores; timelog:query returns what a fold needs', async () => {
    const res = await invoke('timelog:append', [
      { type: 'span.edited', spanId: 'old-span', startedAt: '2026-10-20T09:00:00.000Z', endedAt: '2026-10-20T09:30:00.000Z', at: '2026-11-05T10:00:00.000Z' },
      { type: 'nonsense' },
    ]);
    expect(res).toEqual({ ok: false, written: 1 });
    const entries = (await invoke('timelog:query', '2026-10-01', '2026-10-31')) as Array<{ type: string; id: string }>;
    // The October span and its November correction both come back.
    expect(entries.map((e) => e.type)).toEqual(['span.closed', 'span.edited']);
    expect(entries.every((e) => typeof e.id === 'string' && e.id.length > 0)).toBe(true);
  });

  it('timelog:query rejects bad dates', async () => {
    expect(() => invoke('timelog:query', '2026-10', '2026-10-31')).toThrow();
  });
});
