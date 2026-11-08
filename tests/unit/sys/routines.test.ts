/**
 * Decision 39 / routines.md — routines (repeat at a time, never ticked) and
 * any-time habits, through the model and the `krnl` CLI.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SysFacade } from '../../../src/sys/SysFacade';
import { seedBoard } from '../../../src/main/persistence/board';
import { habitToggleDay, habitMarkDone, habitSetKind, routineSkip, routineMove, routineEnd, routineRestart } from '../../../src/renderer/components/nodes/HabitNode/commands';
import { routineOccurrence, isRoutine, type Habit, type HabitState } from '../../../src/renderer/components/nodes/HabitNode/types';
import { computeCatchup } from '../../../src/renderer/launch/catchup';
import { parseRoutineDays } from '../../../src/sys/commands/habit';

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test'), getAppPath: vi.fn(() => tmpdir()), on: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}));

const routine = (extra: Partial<Habit> = {}): Habit => ({
  id: 'r1', name: 'Class', createdAt: '2026-11-01T08:00:00.000Z', log: [], archived: false, color: 'amber',
  kind: 'routine', schedule: { kind: 'weekly', days: [1, 3], timeOfDay: '10:00', durationMin: 120 }, ...extra,
});
const state = (h: Habit): HabitState => ({ habits: [h] });

describe('model', () => {
  it('F4 — a routine is never ticked (toggle and mark-done do nothing)', () => {
    const s = state(routine());
    expect(habitToggleDay(s, { id: 'r1', date: '2026-11-02' }).habits[0]!.log).toEqual([]);
    expect(habitMarkDone(s, { id: 'r1' }).habits[0]!.log).toEqual([]);
  });

  it('occurrences: its days only, from its first day, until its end; skip and move apply to one date', () => {
    const h = routine();
    expect(routineOccurrence(h, '2026-11-02')).toMatchObject({ startMin: 600, endMin: 720, skipped: false }); // Mon
    expect(routineOccurrence(h, '2026-11-03')).toBeNull(); // Tue
    // Added on Sunday 1 Nov: it shows across that whole week (Mon 26 Oct)...
    expect(routineOccurrence(h, '2026-10-26')).toMatchObject({ startMin: 600 });
    // ...but not in the weeks before it.
    expect(routineOccurrence(h, '2026-10-19')).toBeNull();
    const skipped = routineSkip(state(h), { id: 'r1', date: '2026-11-09' }).habits[0]!;
    expect(routineOccurrence(skipped, '2026-11-09')?.skipped).toBe(true);
    expect(routineOccurrence(skipped, '2026-11-16')?.skipped).toBe(false);
    const moved = routineMove(state(h), { id: 'r1', date: '2026-11-04', at: '13:30' }).habits[0]!;
    expect(routineOccurrence(moved, '2026-11-04')).toMatchObject({ startMin: 810, endMin: 930, moved: true });
    const ended = routineEnd(state(h), { id: 'r1', date: '2026-11-04' }).habits[0]!;
    expect(routineOccurrence(ended, '2026-11-09')).toBeNull();
    expect(routineOccurrence(routineRestart(state(ended), { id: 'r1' }).habits[0]!, '2026-11-09')).not.toBeNull();
  });

  it('F10 — turning a habit into a routine needs a time; turning back keeps the log', () => {
    const untimed: Habit = { ...routine(), kind: undefined, schedule: { kind: 'daily' }, log: ['2026-11-01'] } as unknown as Habit;
    delete (untimed as { kind?: unknown }).kind;
    expect(isRoutine(habitSetKind(state(untimed), { id: 'r1', kind: 'routine' }).habits[0])).toBe(false);
    const back = habitSetKind(state(routine({ log: ['2026-11-01'] })), { id: 'r1', kind: 'habit' }).habits[0]!;
    expect(isRoutine(back)).toBe(false);
    expect(back.log).toEqual(['2026-11-01']);
  });

  it('F4 — Welcome back never lists a routine as a broken streak', () => {
    const board = { nodes: [{ id: 'h', kind: 'habit', isMother: true, state: { habits: [routine({ log: ['2026-11-02'] })] } }], edges: [] };
    expect(computeCatchup(board as never, '2026-11-08').habits).toEqual([]);
  });

  it('CLI day lists: names, numbers, daily, weekdays', () => {
    expect(parseRoutineDays('mon,wed')).toEqual({ kind: 'weekly', days: [1, 3] });
    expect(parseRoutineDays('5,1')).toEqual({ kind: 'weekly', days: [1, 5] });
    expect(parseRoutineDays('weekdays')).toEqual({ kind: 'weekdays' });
    expect('error' in parseRoutineDays('mon,funday')).toBe(true);
  });
});

describe('krnl routine / habit kind / any-time habits', () => {
  let dir = '';
  let boardPath = '';
  let f: SysFacade;
  const habits = () => (JSON.parse(readFileSync(boardPath, 'utf-8')).nodes.find((n: { kind: string; isMother?: boolean }) => n.kind === 'habit' && n.isMother).state.habits) as Habit[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'krnl0-routine-'));
    boardPath = join(dir, 'board.json');
    writeFileSync(boardPath, JSON.stringify(seedBoard()), 'utf-8');
    f = new SysFacade({ boardPath, hasOpenRenderer: () => false, onBoardChanged: () => {} });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('adds, lists, skips, moves, ends and restarts a routine', async () => {
    expect((await f.run(['routine', 'add', 'Class', '--days', 'mon,wed', '--at', '10:00', '--for', '120'])).ok).toBe(true);
    const h = habits()[0]!;
    expect(h.kind).toBe('routine');
    expect(h.schedule).toEqual({ kind: 'weekly', days: [1, 3], timeOfDay: '10:00', durationMin: 120 });
    expect(String((await f.run(['routine', 'list'])).message)).toContain('Class');
    expect((await f.run(['routine', 'skip', 'Class', '--on', '2026-12-07'])).ok).toBe(true);
    expect(habits()[0]!.exceptions).toEqual([{ date: '2026-12-07', skip: true }]);
    expect((await f.run(['routine', 'skip', 'Class', '--on', '2026-12-08'])).ok).toBe(false); // a Tuesday
    expect((await f.run(['routine', 'move', 'Class', '--on', '2026-12-09', '--at', '13:00'])).ok).toBe(true);
    expect((await f.run(['routine', 'end', 'Class', '--on', '2026-12-20'])).ok).toBe(true);
    expect(habits()[0]!.endsOn).toBe('2026-12-20');
    expect((await f.run(['routine', 'restart', 'Class'])).ok).toBe(true);
    expect(habits()[0]!.endsOn).toBeUndefined();
    expect((await f.run(['habit', 'done', 'Class'])).ok).toBe(true);
    expect(habits()[0]!.log).toEqual([]); // never ticked
  });

  it('a habit can be scheduled with no time (any time); a routine cannot', async () => {
    await f.run(['habit', 'add', 'No sugar']);
    expect((await f.run(['habit', 'schedule', 'No sugar', '--daily'])).ok).toBe(true);
    expect(habits()[0]!.schedule).toEqual({ kind: 'daily' });
    expect((await f.run(['habit', 'kind', 'No sugar', 'routine'])).ok).toBe(false); // no time yet
    await f.run(['routine', 'add', 'Shift', '--days', 'tue', '--at', '14:00', '--for', '240']);
    expect((await f.run(['habit', 'schedule', 'Shift', '--daily'])).ok).toBe(false);
  });

  it('habit kind turns a timed habit into a routine and back', async () => {
    await f.run(['habit', 'add', 'Gym class']);
    await f.run(['habit', 'schedule', 'Gym class', '--weekly', '--days', '2,4', '--at', '18:00', '--duration', '60']);
    expect((await f.run(['habit', 'kind', 'Gym class', 'routine'])).ok).toBe(true);
    expect(habits()[0]!.kind).toBe('routine');
    expect((await f.run(['habit', 'kind', 'Gym class', 'habit'])).ok).toBe(true);
    expect(habits()[0]!.kind).toBeUndefined();
  });
});
