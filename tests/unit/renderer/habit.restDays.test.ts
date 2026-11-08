/** Review 3.3 — rest days (sick, away, a planned break) never break a streak. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { calcStreak, bestStreak, repairableDay, calcWeekStreak, habitSetRest } from '../../../src/renderer/components/nodes/HabitNode/commands';
import type { Habit } from '../../../src/renderer/components/nodes/HabitNode/types';
import { SysFacade } from '../../../src/sys/SysFacade';
import { seedBoard } from '../../../src/main/persistence/board';

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test'), getAppPath: vi.fn(() => tmpdir()), on: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}));

const TODAY = '2026-11-08';

describe('rest days in a daily streak', () => {
  // Ticked 1–4 Nov, sick 5–6 Nov, ticked 7–8 Nov.
  const log = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-07', '2026-11-08'];
  const rest = ['2026-11-05', '2026-11-06'];

  it('without rest days the streak is broken by the sick days', () => {
    expect(calcStreak(log, TODAY)).toBe(2);
  });
  it('rest days are stepped over: the run carries on', () => {
    expect(calcStreak(log, TODAY, undefined, rest)).toBe(6);
    expect(bestStreak(log, undefined, rest)).toBe(6);
  });
  it('a rest day never asks "did it yesterday?"', () => {
    const l = ['2026-11-05', '2026-11-06'];
    expect(repairableDay(l, TODAY)).toBe('2026-11-07');
    expect(repairableDay(l, TODAY, undefined, ['2026-11-07'])).toBeNull();
  });
});

describe('rest days with a weekly target', () => {
  it('a short week with rest days is skipped, not broken', () => {
    // 3 a week: week of 19 Oct met, 26 Oct only 1 tick but away 28–31 Oct, 2 Nov week met.
    const log = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-26', '2026-11-02', '2026-11-03', '2026-11-04'];
    expect(calcWeekStreak(log, TODAY, 3)).toBe(1);
    expect(calcWeekStreak(log, TODAY, 3, ['2026-10-28', '2026-10-29'])).toBe(2);
  });
});

describe('habitSetRest', () => {
  const h: Habit = { id: 'h1', name: 'Run', createdAt: '2026-11-01T08:00:00.000Z', log: [], archived: false, color: 'acid' };
  it('adds, keeps sorted, removes, and drops the empty list', () => {
    let s = habitSetRest({ habits: [h] }, { id: 'h1', date: '2026-11-06', rest: true });
    s = habitSetRest(s, { id: 'h1', date: '2026-11-05', rest: true });
    expect(s.habits[0]!.rest).toEqual(['2026-11-05', '2026-11-06']);
    s = habitSetRest(s, { id: 'h1', date: '2026-11-05', rest: false });
    s = habitSetRest(s, { id: 'h1', date: '2026-11-06', rest: false });
    expect('rest' in s.habits[0]!).toBe(false);
    expect(habitSetRest({ habits: [h] }, { id: 'h1', date: 'soon', rest: true }).habits[0]!.rest).toBeUndefined();
  });
});

describe('krnl habit rest', () => {
  let dir = '';
  let boardPath = '';
  let f: SysFacade;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'krnl0-rest-'));
    boardPath = join(dir, 'board.json');
    writeFileSync(boardPath, JSON.stringify(seedBoard()), 'utf-8');
    f = new SysFacade({ boardPath, hasOpenRenderer: () => false, onBoardChanged: () => {} });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const run = () => (JSON.parse(readFileSync(boardPath, 'utf-8')).nodes.find((n: { kind: string; isMother?: boolean }) => n.kind === 'habit' && n.isMother).state.habits as Habit[]).find((x) => x.name === 'Run');

  it('marks a range, clears it, and refuses bad dates', async () => {
    await f.run(['habit', 'add', 'Run']);
    const r = await f.run(['habit', 'rest', 'Run', '--on', '2026-12-20', '--to', '2026-12-22']);
    expect(r.ok).toBe(true);
    expect(run()?.rest).toEqual(['2026-12-20', '2026-12-21', '2026-12-22']);
    expect((await f.run(['habit', 'rest', 'Run', '--on', '2026-12-21', '--off'])).ok).toBe(true);
    expect(run()?.rest).toEqual(['2026-12-20', '2026-12-22']);
    expect((await f.run(['habit', 'rest', 'Run', '--on', '2026-13-01'])).ok).toBe(false);
    expect((await f.run(['habit', 'rest', 'Run', '--on', '2026-12-22', '--to', '2026-12-20'])).ok).toBe(false);
  });
});
