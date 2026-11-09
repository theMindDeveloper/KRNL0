/** Review 3.1 — "Gym 3 times a week, any days": the streak counts weeks, so a rest day never breaks it. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { calcWeekStreak, bestWeekStreak, ticksThisWeek, habitSetTarget, habitAdd } from '../../../src/renderer/components/nodes/HabitNode/commands';
import { weeklyTarget, type Habit, type HabitState } from '../../../src/renderer/components/nodes/HabitNode/types';
import { cardToAnswer, cardSummary, DEFAULT_CARD } from '../../../src/renderer/components/nodes/HabitNode/HabitAddAsk';
import { computeCatchup } from '../../../src/renderer/launch/catchup';
import { SysFacade } from '../../../src/sys/SysFacade';
import { seedBoard } from '../../../src/main/persistence/board';

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test'), getAppPath: vi.fn(() => tmpdir()), on: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}));

// Weeks (Mon–Sun): 19–25 Oct, 26 Oct–1 Nov, 2–8 Nov. "Today" is Wed 4 Nov.
const TODAY = '2026-11-04';

describe('week streak', () => {
  const log = [
    '2026-10-19', '2026-10-21', '2026-10-24', // 3 in week 1
    '2026-10-26', '2026-10-30', '2026-11-01', // 3 in week 2 (Mon, Fri, Sun)
    '2026-11-02', //                           1 so far this week
  ];

  it('counts weeks that reached the target; this week is still open, so it does not break the run', () => {
    expect(ticksThisWeek(log, TODAY)).toBe(1);
    expect(calcWeekStreak(log, TODAY, 3)).toBe(2);
  });

  it('this week counts as soon as the target is reached', () => {
    expect(calcWeekStreak([...log, '2026-11-03', '2026-11-04'], TODAY, 3)).toBe(3);
  });

  it('a week below the target ends the run; best keeps the longest', () => {
    const gap = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-12', ...log]; // week of 12 Oct has 1
    expect(calcWeekStreak(gap, TODAY, 3)).toBe(2);
    expect(bestWeekStreak(gap, 3)).toBe(2);
    expect(bestWeekStreak(gap, 1)).toBe(5);
  });
});

describe('model', () => {
  const env = { uuid: () => 'h1', now: () => '2026-11-01T08:00:00.000Z' };
  it('habit.add keeps a 1–6 target; a routine never gets one', () => {
    const s: HabitState = { habits: [] };
    expect(habitAdd(s, { name: 'Gym', schedule: { kind: 'daily' }, perWeek: 3 }, env).habits[0]!.perWeek).toBe(3);
    expect(habitAdd(s, { name: 'Gym', perWeek: 9 }, env).habits[0]!.perWeek).toBeUndefined();
    const r = habitAdd(s, { name: 'Class', kind: 'routine', schedule: { kind: 'weekly', days: [1], timeOfDay: '10:00', durationMin: 60 }, perWeek: 2 }, env).habits[0]!;
    expect(r.perWeek).toBeUndefined();
    expect(weeklyTarget(r)).toBeNull();
  });
  it('setTarget sets and clears', () => {
    const h: Habit = { id: 'h1', name: 'Gym', createdAt: '2026-11-01T08:00:00.000Z', log: [], archived: false, color: 'acid' };
    const on = habitSetTarget({ habits: [h] }, { id: 'h1', perWeek: 4 });
    expect(on.habits[0]!.perWeek).toBe(4);
    expect('perWeek' in habitSetTarget(on, { id: 'h1', perWeek: null }).habits[0]!).toBe(false);
  });
  it('Welcome back counts a weekly-target habit in weeks', () => {
    const log = ['2026-10-19', '2026-10-21', '2026-10-23', '2026-10-26', '2026-10-28', '2026-10-30'];
    const board = { nodes: [{ id: 'h', kind: 'habit', isMother: true, state: { habits: [{ id: 'g', name: 'Gym', log, archived: false, perWeek: 3 }] } }], edges: [] };
    const hs = computeCatchup(board as never, '2026-11-04').habits;
    expect(hs).toHaveLength(1);
    expect(hs[0]).toMatchObject({ current: 2, unit: 'week', broken: false });
  });

  it('Welcome back never lists a weekly-target habit as a broken day streak', () => {
    const board = { nodes: [{ id: 'h', kind: 'habit', isMother: true, state: { habits: [{ id: 'g', name: 'Gym', log: ['2026-10-20', '2026-10-21'], archived: false, perWeek: 3 }] } }], edges: [] };
    expect(computeCatchup(board as never, '2026-11-04').habits).toEqual([]);
  });
});

describe('add card: times a week', () => {
  it('any days, the target; adds an any-time daily habit with it', () => {
    const d = { ...DEFAULT_CARD, mode: 'week' as const, perWeek: 3 };
    expect(cardSummary(d)).toBe('3× a week');
    expect(cardToAnswer(d)).toEqual({ kind: 'habit', schedule: { kind: 'daily' }, perWeek: 3 });
  });
});

describe('krnl habit target', () => {
  let dir = '';
  let boardPath = '';
  let f: SysFacade;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'krnl0-target-'));
    boardPath = join(dir, 'board.json');
    writeFileSync(boardPath, JSON.stringify(seedBoard()), 'utf-8');
    f = new SysFacade({ boardPath, hasOpenRenderer: () => false, onBoardChanged: () => {} });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const gym = () => (JSON.parse(readFileSync(boardPath, 'utf-8')).nodes.find((n: { kind: string; isMother?: boolean }) => n.kind === 'habit' && n.isMother).state.habits as Habit[]).find((h) => h.name === 'Gym');

  it('sets, rejects bad values, and clears', async () => {
    expect((await f.run(['habit', 'add', 'Gym'])).ok).toBe(true);
    const r = await f.run(['habit', 'target', 'Gym', '3']);
    expect(r.ok).toBe(true);
    expect(r.message).toContain('3× a week');
    expect(gym()?.perWeek).toBe(3);
    expect((await f.run(['habit', 'target', 'Gym', '9'])).ok).toBe(false);
    expect((await f.run(['habit', 'target', 'Gym', 'off'])).ok).toBe(true);
    expect(gym()?.perWeek).toBeUndefined();
  });
});
