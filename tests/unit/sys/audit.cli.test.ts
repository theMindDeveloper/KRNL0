/**
 * Audit 2026-11-09, group D — terminal commands that did something other
 * than what they said.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SysFacade } from '../../../src/sys/SysFacade';
import { SysParser, parseLengthMin } from '../../../src/sys/parser';
import { seedBoard } from '../../../src/main/persistence/board';
import { parseStopAt } from '../../../src/sys/commands/pomo';

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test'), getAppPath: vi.fn(() => tmpdir()), on: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}));

let dir = '';
let boardPath = '';
let f: SysFacade;
const board = () => JSON.parse(readFileSync(boardPath, 'utf-8')) as { nodes: Array<{ id: string; kind: string; isMother?: boolean; state: Record<string, unknown> }> };
const habits = () => board().nodes.find((n) => n.kind === 'habit' && n.isMother)!.state['habits'] as Array<{ name: string; schedule?: { durationMin?: number }; counts?: Record<string, number>; amount?: unknown }>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'krnl-audit-d-'));
  boardPath = join(dir, 'board.json');
  writeFileSync(boardPath, JSON.stringify(seedBoard()), 'utf-8');
  f = new SysFacade({ boardPath, hasOpenRenderer: () => false, onBoardChanged: () => {} });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('lengths and times', () => {
  it('--for reads 90, 90m, 2h, 1.5h and 1h30; anything else is refused, not 60', async () => {
    expect([parseLengthMin('90'), parseLengthMin('90m'), parseLengthMin('2h'), parseLengthMin('1.5h'), parseLengthMin('1h30')]).toEqual([90, 90, 120, 90, 90]);
    expect(Number.isNaN(parseLengthMin('two hours'))).toBe(true);
    expect((await f.run(['event', 'add', 'Shift', '--days', 'mon', '--at', '9:00', '--for', '2h'])).ok).toBe(true);
    expect(habits()[0]!.schedule?.durationMin).toBe(120);
    expect((await f.run(['event', 'add', 'Bad', '--days', 'mon', '--at', '10:00', '--for', 'lots'])).ok).toBe(false);
  });

  it('rescheduling an event keeps its length', async () => {
    await f.run(['event', 'add', 'Shift', '--days', 'mon', '--at', '09:00', '--for', '480']);
    expect((await f.run(['habit', 'schedule', 'Shift', '--weekly', '--days', '2,4', '--at', '21:00'])).ok).toBe(true);
    expect(habits()[0]!.schedule?.durationMin).toBe(480);
  });

  it('pomo stop --at 23:50 after midnight is last night', () => {
    const now = new Date(2026, 10, 10, 0, 10).getTime();
    expect(parseStopAt('23:50', now)).toBe(new Date(2026, 10, 9, 23, 50).getTime());
  });

  it('impossible dates are refused', async () => {
    await f.run(['event', 'add', 'Class', '--days', 'mon', '--at', '10:00']);
    expect((await f.run(['event', 'end', 'Class', '--on', '2026-02-31'])).ok).toBe(false);
  });
});

describe('habit done', () => {
  it('a repeating event is never ticked; an amount habit gets its full amount', async () => {
    await f.run(['event', 'add', 'Class', '--days', 'mon', '--at', '10:00']);
    expect((await f.run(['habit', 'done', 'Class'])).ok).toBe(false);
    await f.run(['habit', 'add', 'Water']);
    await f.run(['habit', 'amount', 'Water', '8', 'glasses']);
    expect((await f.run(['habit', 'done', 'Water'])).ok).toBe(true);
    expect(Object.values(habits().find((h) => h.name === 'Water')!.counts ?? {})).toContain(8);
    await f.run(['habit', 'undo', 'Water']);
    expect(Object.values(habits().find((h) => h.name === 'Water')!.counts ?? {}).every((c) => c === 0)).toBe(true);
  });
});

describe('cal show', () => {
  it('lists repeating events next to plans', async () => {
    await f.run(['event', 'add', 'Class', '--days', 'mon,tue,wed,thu,fri,sat,sun', '--at', '10:00', '--for', '90']);
    const out = String((await f.run(['cal', 'show'])).message);
    expect(out).toContain('[E]');
    expect(out).toContain('Class');
  });
});

describe('parsing', () => {
  it('--off takes no value; text add takes its words; help event works', async () => {
    expect(SysParser.parse(['habit', 'rest', '--off', 'Run'])).toMatchObject({ ref: 'Run', off: true });
    expect(SysParser.parse(['text', 'add', 'hello world'])).toMatchObject({ text: 'hello world' });
    expect(SysParser.parse(['text', 'look', '--note', 'abcd'])).toMatchObject({ id: 'abcd' });
    expect((await f.run(['help', 'event'])).ok).toBe(true);
  });
});
