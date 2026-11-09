/** Review 4.1 — "remind me 10 minutes before": which reminders fall due, once each. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { dueReminders, leadWords } from '../../../src/shared/reminders';
import { taskSetRemind } from '../../../src/renderer/components/nodes/TaskNode/commands';
import { habitSetRemind } from '../../../src/renderer/components/nodes/HabitNode/commands';
import type { HabitState } from '../../../src/renderer/components/nodes/HabitNode/types';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';
import type { Board } from '../../../src/shared/types';
import { SysFacade } from '../../../src/sys/SysFacade';
import { seedBoard } from '../../../src/main/persistence/board';

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test'), getAppPath: vi.fn(() => tmpdir()), on: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}));

const task = (id: string, extra: Partial<TaskState>): Record<string, unknown> => ({
  id, kind: 'todo.task', isMother: false, position: { x: 0, y: 0 }, config: { showDuration: true },
  state: {
    text: id, done: false, durationMin: 30, eta: '~30 min', sequenceNumber: 1, layer: 0, createdAt: '2026-11-08T08:00:00.000Z',
    parentTodoId: 'todo', parentTaskId: null, todoItemId: null, pomoSessionsCompleted: 0, plannedMin: 30,
    secondsAccumulated: 0, currentSessionElapsedSec: 0, kind: 'event', ...extra,
  },
});
const at = (hhmm: string) => new Date(`2026-11-09T${hhmm}:00`).getTime();

describe('dueReminders', () => {
  const board = {
    nodes: [
      task('Dentist', { scheduledFor: '2026-11-09T14:00', remindMin: 10 }),
      task('Gym', { scheduledFor: '2026-11-09T18:00', remindMin: 0 }),
      task('No reminder', { scheduledFor: '2026-11-09T14:00' }),
      task('Done one', { scheduledFor: '2026-11-09T14:00', remindMin: 10, done: true }),
      task('Not on the calendar', { remindMin: 10 }),
    ],
    edges: [],
  } as unknown as Board;

  it('fires in the window that holds start − lead, and only for live, planned, reminded plans', () => {
    const r = dueReminders(board, at('13:49'), at('13:50'));
    expect(r.map((x) => x.title)).toEqual(['Dentist']);
    expect(r[0]!.body).toBe('Starts in 10 min · 14:00');
    expect(dueReminders(board, at('13:50'), at('13:51'))).toEqual([]);
    expect(dueReminders(board, at('17:59'), at('18:00')).map((x) => x.body)).toEqual(['Starts now · 18:00']);
  });

  it('a key is stable per plan, start and lead (so it shows once)', () => {
    const a = dueReminders(board, at('13:00'), at('13:55'))[0]!;
    expect(a.key).toBe('Dentist@2026-11-09T14:00-10');
  });

  it('words', () => {
    expect(leadWords(0)).toBe('now');
    expect(leadWords(90)).toBe('in 1 h 30 min');
    expect(leadWords(60)).toBe('in 1 h');
  });
});

describe('routine reminders', () => {
  // Class Mon & Wed 10:00 for 2 h, remind 10 min before; Wed 11 Nov skipped.
  const klass = {
    id: 'r-class', name: 'Class', createdAt: '2026-11-01T08:00:00.000Z', log: [], archived: false, color: 'amber', kind: 'routine',
    schedule: { kind: 'weekly', days: [1, 3], timeOfDay: '10:00', durationMin: 120 }, remindMin: 10, exceptions: [{ date: '2026-11-11', skip: true }],
  };
  const board = { nodes: [{ id: 'mother-habit', kind: 'habit', isMother: true, state: { habits: [klass] } }], edges: [] } as unknown as Board;
  const t = (d: string, hhmm: string) => new Date(`${d}T${hhmm}:00`).getTime();

  it('fires 10 min before each class, never on a skipped day or a day without class', () => {
    const r = dueReminders(board, t('2026-11-09', '09:49'), t('2026-11-09', '09:50'));
    expect(r.map((x) => [x.title, x.body])).toEqual([['Class', 'Starts in 10 min · 10:00']]);
    expect(dueReminders(board, t('2026-11-11', '09:49'), t('2026-11-11', '09:50'))).toEqual([]);
    expect(dueReminders(board, t('2026-11-10', '09:49'), t('2026-11-10', '09:50'))).toEqual([]);
  });

  it('habitSetRemind sets and clears on routines only', () => {
    const s = { habits: [klass, { ...klass, id: 'h', kind: undefined }] } as unknown as HabitState;
    const off = habitSetRemind(s, { id: 'r-class', min: null }).habits[0]!;
    expect('remindMin' in off).toBe(false);
    expect(habitSetRemind(s, { id: 'h', min: 5 }).habits[1]!.remindMin).toBe(10);
  });
});

describe('taskSetRemind', () => {
  const s = task('x', {}).state as TaskState;
  it('sets within 0–240, clears with null', () => {
    expect(taskSetRemind(s, { min: 10 }).remindMin).toBe(10);
    expect(taskSetRemind(s, { min: 999 }).remindMin).toBe(240);
    expect('remindMin' in taskSetRemind(taskSetRemind(s, { min: 5 }), { min: null })).toBe(false);
  });
});

describe('krnl task remind', () => {
  let dir = '';
  let boardPath = '';
  let f: SysFacade;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'krnl0-remind-'));
    boardPath = join(dir, 'board.json');
    const b = seedBoard() as unknown as { nodes: unknown[] };
    b.nodes.push(task('t-dentist', { text: 'Call the dentist', scheduledFor: '2026-12-01T14:00' }));
    writeFileSync(boardPath, JSON.stringify(b), 'utf-8');
    f = new SysFacade({ boardPath, hasOpenRenderer: () => false, onBoardChanged: () => {} });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const remind = () => (JSON.parse(readFileSync(boardPath, 'utf-8')).nodes.find((n: { id: string }) => n.id === 't-dentist').state.remindMin);

  it('sets, refuses nonsense, clears', async () => {
    expect((await f.run(['task', 'remind', 't-dentist', '10'])).ok).toBe(true);
    expect(remind()).toBe(10);
    expect((await f.run(['task', 'remind', 't-dentist', 'soon'])).ok).toBe(false);
    expect((await f.run(['task', 'remind', 't-dentist', 'off'])).ok).toBe(true);
    expect(remind()).toBeUndefined();
  });
});
