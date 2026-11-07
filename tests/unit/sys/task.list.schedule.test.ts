/** `krnl task list` says when each task is planned, so a schedule or a line-up can be checked from the CLI. */
import { it, expect, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SysFacade } from '../../../src/sys/SysFacade';
import { seedBoard } from '../../../src/main/persistence/board';

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test'), getAppPath: vi.fn(() => tmpdir()), on: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}));

it('task list shows the planned time of a scheduled task, and nothing for an unscheduled one', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'krnl0-tasklist-'));
  const boardPath = join(dir, 'board.json');
  writeFileSync(boardPath, JSON.stringify(seedBoard()), 'utf-8');
  const f = new SysFacade({ boardPath, hasOpenRenderer: () => false, onBoardChanged: () => {} });
  try {
    await f.run(['todo', 'add', 'Read chapter A']);
    await f.run(['todo', 'add', 'Groceries']);
    expect((await f.run(['task', 'schedule', 'Read chapter A', '--at', '2026-11-08T10:00'])).ok).toBe(true);
    const out = String((await f.run(['task', 'list'])).message);
    expect(out).toMatch(/Read chapter A {2}@ 2026-11-08 10:00/);
    expect(out).toMatch(/Groceries$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
