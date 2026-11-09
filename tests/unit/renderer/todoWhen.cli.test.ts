/** Decision 40 — `krnl todo when`, `todo deadline` and the `event` name for repeating events. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SysFacade } from '../../../src/sys/SysFacade';
import { seedBoard } from '../../../src/main/persistence/board';
import { dueOnDay } from '../../../src/shared/dueOn';

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test'), getAppPath: vi.fn(() => tmpdir()), on: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}));

describe('krnl todo when / deadline / event', () => {
  let dir = '';
  let boardPath = '';
  let f: SysFacade;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'krnl0-when-'));
    boardPath = join(dir, 'board.json');
    writeFileSync(boardPath, JSON.stringify(seedBoard()), 'utf-8');
    f = new SysFacade({ boardPath, hasOpenRenderer: () => false, onBoardChanged: () => {} });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const board = () => JSON.parse(readFileSync(boardPath, 'utf-8')) as { nodes: Array<{ id: string; kind: string; isMother?: boolean; state: Record<string, unknown> }> };
  const item = (text: string) => (board().nodes.find((n) => n.kind === 'todo' && n.isMother)!.state['items'] as Array<{ text: string; onDay?: string; dueOn?: string; taskNodeId: string }>).find((i) => i.text === text)!;
  const taskOf = (text: string) => board().nodes.find((n) => n.id === item(text).taskNodeId)!.state;

  it('a day alone is any time that day; a time puts it on the Calendar; back to any time takes it off the grid', async () => {
    expect((await f.run(['todo', 'add', 'Groceries'])).ok).toBe(true);
    expect((await f.run(['todo', 'when', 'Groceries', '2026-11-20'])).message).toContain('any time');
    expect(item('Groceries').onDay).toBe('2026-11-20');
    expect((await f.run(['todo', 'when', 'Groceries', '2026-11-20', '10:30'])).ok).toBe(true);
    expect(String(taskOf('Groceries')['scheduledFor'])).toBe('2026-11-20T10:30');
    expect(item('Groceries').onDay).toBeUndefined();
    expect((await f.run(['todo', 'when', 'Groceries', '2026-11-21'])).ok).toBe(true);
    expect(taskOf('Groceries')['scheduledFor']).toBeFalsy();
    expect(item('Groceries').onDay).toBe('2026-11-21');
    expect((await f.run(['todo', 'when', 'Groceries', 'off'])).ok).toBe(true);
    expect(item('Groceries').onDay).toBeUndefined();
    expect((await f.run(['todo', 'when', 'Groceries', '2026-11-21', '25:00'])).ok).toBe(false);
  });

  it('deadline is apart from the When; due is the same command', async () => {
    await f.run(['todo', 'add', 'Essay']);
    await f.run(['todo', 'when', 'Essay', '2026-11-17', '16:00']);
    expect((await f.run(['todo', 'deadline', 'Essay', '2026-11-21'])).message).toContain('deadline 2026-11-21');
    expect(item('Essay').dueOn).toBe('2026-11-21');
    expect(String(taskOf('Essay')['scheduledFor'])).toBe('2026-11-17T16:00');
    expect((await f.run(['todo', 'due', 'Essay', 'off'])).message).toContain('no deadline');
    expect(item('Essay').dueOn).toBeUndefined();
  });

  it('event is the name for repeating events; routine keeps working; event delete removes it', async () => {
    expect((await f.run(['event', 'add', 'Class', '--days', 'mon,wed', '--at', '11:00', '--for', '90'])).ok).toBe(true);
    expect((await f.run(['routine', 'list'])).message).toContain('Class');
    expect((await f.run(['event', 'delete', 'Class'])).ok).toBe(true);
    const habits = board().nodes.find((n) => n.kind === 'habit' && n.isMother)!.state['habits'] as Array<{ name: string }>;
    expect(habits.some((h) => h.name === 'Class')).toBe(false);
  });

  it('the Clock and Welcome back list any-time plans and deadlines of the day', () => {
    const nodes = [{ kind: 'todo', isMother: true, state: { items: [
      { id: 'a', text: 'Groceries', done: false, onDay: '2026-11-08' },
      { id: 'b', text: 'Essay', done: false, dueOn: '2026-11-08' },
      { id: 'c', text: 'Late', done: false, onDay: '2026-11-06' },
    ] } }];
    expect(dueOnDay(nodes, '2026-11-08', '2026-11-08').map((d) => [d.text, d.kind, d.overdue])).toEqual([
      ['Late', 'day', true], ['Essay', 'deadline', false], ['Groceries', 'day', false],
    ]);
  });
});
