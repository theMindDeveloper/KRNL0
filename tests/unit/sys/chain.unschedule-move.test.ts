/**
 * What you do to ONE task in a chain happens to that task (2026-11-07 bugs):
 *  - "Unschedule" on a chained task unscheduled the whole chain;
 *  - "Unschedule" on a chained task with its own time left it on the
 *    calendar (it fell back behind its predecessor);
 *  - moving a chained task to another day did nothing ("placed at 12:50").
 * Same rules in the app (scheduleActions / commandDispatch) and the CLI.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SysFacade } from '../../../src/sys/SysFacade';
import { seedBoard } from '../../../src/main/persistence/board';
import { selectSchedule } from '../../../src/renderer/store/scheduleSelector';
import type { Board } from '../../../src/shared/types';

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test'), getAppPath: vi.fn(() => tmpdir()), on: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}));

let dir = '';
let boardPath = '';
let f: SysFacade;
const board = () => JSON.parse(readFileSync(boardPath, 'utf-8')) as Board;
const idOf = (text: string) => board().nodes.find((n) => n.kind === 'todo.task' && (n.state as { text: string }).text === text)!.id;
const at = (text: string) => selectSchedule(board()).placements.get(idOf(text))?.startISO.slice(0, 16) ?? null;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'krnl0-chain-'));
  boardPath = join(dir, 'board.json');
  writeFileSync(boardPath, JSON.stringify(seedBoard()), 'utf-8');
  f = new SysFacade({ boardPath, hasOpenRenderer: () => false, onBoardChanged: () => {} });
  // Thesis → Standup → Gym, Thesis timed; Gym also has its own (later) time.
  await f.run(['todo', 'add', 'Thesis']);
  await f.run(['task', 'addNext', 'Thesis', 'Standup']);
  await f.run(['task', 'addNext', 'Standup', 'Gym']);
  await f.run(['task', 'schedule', 'Thesis', '--at', '2026-11-12T11:00', '--duration', '60']);
  await f.run(['task', 'schedule', 'Gym', '--at', '2026-11-12T15:00']);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('one task, not its chain', () => {
  it('setup: the chain is on the calendar', () => {
    expect(at('Thesis')).toBe('2026-11-12T11:00');
    expect(at('Standup')).toBe('2026-11-12T12:00');
    expect(at('Gym')).toBe('2026-11-12T15:00');
  });

  it('unscheduling a task timed by the chain takes only it off; the others keep their times', async () => {
    expect((await f.run(['task', 'unschedule', 'Standup'])).ok).toBe(true);
    expect(at('Standup')).toBeNull();
    expect(at('Thesis')).toBe('2026-11-12T11:00');
    expect(at('Gym')).toBe('2026-11-12T15:00');
  });

  it('unscheduling a chained task with its own time takes it off at once (it does not fall back behind its predecessor)', async () => {
    await f.run(['task', 'unschedule', 'Gym']);
    expect(at('Gym')).toBeNull();
    // A second unschedule changes nothing else (it used to clear the whole chain).
    await f.run(['task', 'unschedule', 'Gym']);
    expect(at('Thesis')).toBe('2026-11-12T11:00');
    expect(at('Standup')).toBe('2026-11-12T12:00');
  });

  it('moving a chained task to an earlier day lands it there (it is no longer pushed behind its predecessor)', async () => {
    await f.run(['task', 'schedule', 'Gym', '--at', '2026-11-10T09:00']);
    expect(at('Gym')).toBe('2026-11-10T09:00');
    expect(at('Thesis')).toBe('2026-11-12T11:00');
    expect(at('Standup')).toBe('2026-11-12T12:00');
  });

  it('moving a task later than its predecessor keeps the chain (nothing is unlinked)', async () => {
    const before = board().edges.length;
    await f.run(['task', 'schedule', 'Gym', '--at', '2026-11-12T17:00']);
    expect(at('Gym')).toBe('2026-11-12T17:00');
    expect(board().edges.length).toBe(before);
  });
});
