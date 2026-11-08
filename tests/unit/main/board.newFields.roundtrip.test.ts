/**
 * Today's new fields are all optional and must survive a load through the
 * real loader (migrations included) — an update must never drop a user's
 * due dates, old repeats (still loaded), reminders, targets, amounts or rest days.
 */
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadBoardFrom, seedBoard } from '../../../src/main/persistence/board';

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test'), getAppPath: vi.fn(() => tmpdir()), on: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}));

describe('new optional fields survive a load', () => {
  it('todo items, task nodes and habits keep every new field', () => {
    const board = seedBoard() as unknown as { nodes: Array<{ id: string; kind: string; isMother?: boolean; state: Record<string, unknown> }> };
    const todo = board.nodes.find((n) => n.kind === 'todo' && n.isMother)!;
    todo.state['items'] = [{
      id: 'i1', text: 'Weekly review', done: false, createdAt: '2026-11-01T08:00:00.000Z', completedAt: null, taskNodeId: 't1',
      dueOn: '2026-11-15', repeat: { kind: 'weekly', day: 7 }, droppedAt: '2026-11-08T09:00:00.000Z',
    }];
    board.nodes.push({ id: 't1', kind: 'todo.task', state: { text: 'Weekly review', done: false, kind: 'event', remindMin: 10 } } as never);
    const habit = board.nodes.find((n) => n.kind === 'habit' && n.isMother)!;
    habit.state['habits'] = [
      { id: 'h1', name: 'Water', createdAt: '2026-11-01T08:00:00.000Z', log: [], archived: false, color: 'cyan', perWeek: 3, amount: { target: 8, unit: 'glasses' }, counts: { '2026-11-08': 3 }, rest: ['2026-11-06'] },
      { id: 'r1', name: 'Shift', createdAt: '2026-11-01T08:00:00.000Z', log: [], archived: false, color: 'moss', kind: 'routine', schedule: { kind: 'weekly', days: [5], timeOfDay: '22:00', durationMin: 480 }, remindMin: 15, exceptions: [{ date: '2026-11-13', skip: true }] },
    ];
    const dir = mkdtempSync(join(tmpdir(), 'krnl0-roundtrip-'));
    try {
      const p = join(dir, 'board.json');
      writeFileSync(p, JSON.stringify(board), 'utf-8');
      const loaded = loadBoardFrom(p) as typeof board;
      const item = (loaded.nodes.find((n) => n.kind === 'todo' && n.isMother)!.state['items'] as Array<Record<string, unknown>>)[0]!;
      expect(item).toMatchObject({ dueOn: '2026-11-15', repeat: { kind: 'weekly', day: 7 }, droppedAt: '2026-11-08T09:00:00.000Z' });
      expect(loaded.nodes.find((n) => n.id === 't1')!.state).toMatchObject({ remindMin: 10, kind: 'event' });
      const habits = loaded.nodes.find((n) => n.kind === 'habit' && n.isMother)!.state['habits'] as Array<Record<string, unknown>>;
      expect(habits[0]).toMatchObject({ perWeek: 3, amount: { target: 8, unit: 'glasses' }, counts: { '2026-11-08': 3 }, rest: ['2026-11-06'] });
      expect(habits[1]).toMatchObject({ kind: 'routine', remindMin: 15, schedule: { durationMin: 480 }, exceptions: [{ date: '2026-11-13', skip: true }] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
