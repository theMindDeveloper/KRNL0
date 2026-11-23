// Runs the REAL krnl command code (SysFacade) headlessly against a temp board and records each command's output.
import { it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SysFacade } from '../../../../src/sys/SysFacade';
import { seedBoard } from '../../../../src/main/persistence/board';

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test'), getAppPath: vi.fn(() => tmpdir()), on: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}));

it('records command outputs', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-24T10:30:00'));
  const dir = mkdtempSync(join(tmpdir(), 'krnl-post09-'));
  const boardPath = join(dir, 'board.json');
  writeFileSync(boardPath, JSON.stringify(seedBoard()), 'utf-8');
  const f = new SysFacade({ boardPath, hasOpenRenderer: () => false, onBoardChanged: () => {} });
  const script: string[][] = JSON.parse(readFileSync(join(__dirname, 'commands.json'), 'utf-8'));
  const out: Array<{ cmd: string; ok: boolean; message: string }> = [];
  for (const argv of script) {
    const r = await f.run(argv);
    out.push({ cmd: argv.join(' '), ok: r.ok, message: r.message ?? '' });
  }
  writeFileSync(join(__dirname, 'outputs.json'), JSON.stringify(out, null, 1));
}, 60000);
