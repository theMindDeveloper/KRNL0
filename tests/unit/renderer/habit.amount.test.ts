/** Review 3.2 — "8 glasses of water": a day counts once its amount is reached. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { habitToggleDay, habitMarkDone, habitSetAmount, habitSetCount, calcStreak } from '../../../src/renderer/components/nodes/HabitNode/commands';
import { countOn, type Habit, type HabitState } from '../../../src/renderer/components/nodes/HabitNode/types';
import { SysFacade } from '../../../src/sys/SysFacade';
import { seedBoard } from '../../../src/main/persistence/board';

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test'), getAppPath: vi.fn(() => tmpdir()), on: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}));

const TODAY = '2026-11-08';
const env = { uuid: () => 'x', now: () => `${TODAY}T10:00:00.000Z`, today: () => TODAY };
const water: Habit = { id: 'w', name: 'Water', createdAt: '2026-11-01T08:00:00.000Z', log: ['2026-11-07'], archived: false, color: 'cyan' };
const st = (h: Habit): HabitState => ({ habits: [h] });

describe('amounts', () => {
  const eight = habitSetAmount(st(water), { id: 'w', target: 8, unit: 'glasses' }).habits[0]!;

  it('a tick adds one; the day is done at the target; one more starts again from 0', () => {
    let s = st(eight);
    for (let i = 0; i < 7; i++) s = habitToggleDay(s, { id: 'w', date: TODAY }, env);
    expect(countOn(s.habits[0]!, TODAY)).toBe(7);
    expect(s.habits[0]!.log).not.toContain(TODAY);
    s = habitToggleDay(s, { id: 'w', date: TODAY }, env);
    expect(countOn(s.habits[0]!, TODAY)).toBe(8);
    expect(s.habits[0]!.log).toContain(TODAY);
    s = habitToggleDay(s, { id: 'w', date: TODAY }, env);
    expect(countOn(s.habits[0]!, TODAY)).toBe(0);
    expect(s.habits[0]!.log).not.toContain(TODAY);
  });

  it('a day ticked before the amount was set counts as full, so streaks carry over', () => {
    expect(countOn(eight, '2026-11-07')).toBe(8);
    const s = habitSetCount(st(eight), { id: 'w', date: TODAY, count: 8 }, env);
    expect(calcStreak(s.habits[0]!.log, TODAY)).toBe(2);
  });

  it('markDone (a Pomo edge) fills the day; setCount refuses the future; off clears counts', () => {
    expect(countOn(habitMarkDone(st(eight), { id: 'w' }, env).habits[0]!, TODAY)).toBe(8);
    const s = habitSetCount(st(eight), { id: 'w', date: '2026-11-09', count: 3 }, env);
    expect(s.habits[0]!.counts).toBeUndefined();
    const withCount = habitSetCount(st(eight), { id: 'w', date: TODAY, count: 3 }, env);
    const off = habitSetAmount(withCount, { id: 'w', target: null }).habits[0]!;
    expect(off.amount).toBeUndefined();
    expect(off.counts).toBeUndefined();
  });

  it('a target of 1 or a routine is refused', () => {
    expect(habitSetAmount(st(water), { id: 'w', target: 1 }).habits[0]!.amount).toBeUndefined();
    expect(habitSetAmount(st({ ...water, kind: 'routine' }), { id: 'w', target: 8 }).habits[0]!.amount).toBeUndefined();
  });
});

describe('krnl habit amount / count', () => {
  let dir = '';
  let boardPath = '';
  let f: SysFacade;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'krnl0-amount-'));
    boardPath = join(dir, 'board.json');
    writeFileSync(boardPath, JSON.stringify(seedBoard()), 'utf-8');
    f = new SysFacade({ boardPath, hasOpenRenderer: () => false, onBoardChanged: () => {} });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const water2 = () => (JSON.parse(readFileSync(boardPath, 'utf-8')).nodes.find((n: { kind: string; isMother?: boolean }) => n.kind === 'habit' && n.isMother).state.habits as Habit[]).find((h) => h.name === 'Water');

  it('sets an amount with a unit, counts a day, and refuses counting without an amount', async () => {
    await f.run(['habit', 'add', 'Water']);
    expect((await f.run(['habit', 'count', 'Water', '3'])).ok).toBe(false);
    const r = await f.run(['habit', 'amount', 'Water', '8', 'glasses']);
    expect(r.ok).toBe(true);
    expect(water2()?.amount).toEqual({ target: 8, unit: 'glasses' });
    const c = await f.run(['habit', 'count', 'Water', '8']);
    expect(c.message).toContain('done');
    expect((await f.run(['habit', 'amount', 'Water', 'off'])).ok).toBe(true);
    expect(water2()?.amount).toBeUndefined();
  });
});
