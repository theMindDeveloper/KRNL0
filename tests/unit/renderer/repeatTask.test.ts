/** Review 5.3 — repeating plans: ticking one off brings the next; no backlog for days gone by. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { nextRepeatDay, parseRepeat, describeTaskRepeat, repeatsBehind } from '../../../src/shared/repeatTask';
import { todoSetRepeat } from '../../../src/renderer/components/nodes/TodoNode/commands';
import type { TodoItem } from '../../../src/renderer/components/nodes/TodoNode/types';
import { SysFacade } from '../../../src/sys/SysFacade';
import { seedBoard } from '../../../src/main/persistence/board';

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test'), getAppPath: vi.fn(() => tmpdir()), on: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}));

// Sun 8 Nov 2026.
const TODAY = '2026-11-08';

describe('nextRepeatDay', () => {
  it('every day: the next day; a late tick lands on today, never in the past', () => {
    expect(nextRepeatDay({ kind: 'daily' }, TODAY, TODAY)).toBe('2026-11-09');
    expect(nextRepeatDay({ kind: 'daily' }, '2026-11-05', TODAY)).toBe(TODAY);
  });
  it('weekdays skip the weekend', () => {
    expect(nextRepeatDay({ kind: 'weekdays' }, '2026-11-06', '2026-11-06')).toBe('2026-11-09'); // Fri → Mon
  });
  it('weekly: the same weekday next week; overdue ones jump to the next one ahead', () => {
    expect(nextRepeatDay({ kind: 'weekly', day: 7 }, TODAY, TODAY)).toBe('2026-11-15');
    expect(nextRepeatDay({ kind: 'weekly', day: 1 }, '2026-10-19', TODAY)).toBe('2026-11-09');
  });
  it('parse and words', () => {
    expect(parseRepeat({ kind: 'weekly', day: 9 })).toBeNull();
    expect(describeTaskRepeat({ kind: 'weekly', day: 7 })).toBe('every Sunday');
  });
});

describe('todoSetRepeat', () => {
  const item: TodoItem = { id: 'a', text: 'Weekly review', done: false, createdAt: '2026-11-01T08:00:00.000Z', completedAt: null, taskNodeId: null };
  it('sets, refuses junk, clears', () => {
    const on = todoSetRepeat({ items: [item] }, { id: 'a', repeat: { kind: 'weekly', day: 7 } });
    expect(on.items[0]!.repeat).toEqual({ kind: 'weekly', day: 7 });
    expect(todoSetRepeat({ items: [item] }, { id: 'a', repeat: { kind: 'hourly' } }).items[0]!.repeat).toBeUndefined();
    expect('repeat' in todoSetRepeat(on, { id: 'a', repeat: null }).items[0]!).toBe(false);
  });
});

describe('krnl todo repeat + check', () => {
  let dir = '';
  let boardPath = '';
  let f: SysFacade;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'krnl0-repeat-'));
    boardPath = join(dir, 'board.json');
    writeFileSync(boardPath, JSON.stringify(seedBoard()), 'utf-8');
    f = new SysFacade({ boardPath, hasOpenRenderer: () => false, onBoardChanged: () => {} });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const items = () => (JSON.parse(readFileSync(boardPath, 'utf-8')).nodes.find((n: { kind: string; isMother?: boolean }) => n.kind === 'todo' && n.isMother).state.items as TodoItem[]);

  it('ticking a repeating plan off adds the next one, which carries the repeat', async () => {
    await f.run(['todo', 'add', 'Water the plants']);
    const first = items().find((i) => i.text === 'Water the plants')!;
    expect((await f.run(['todo', 'repeat', first.id, 'daily'])).ok).toBe(true);
    const r = await f.run(['todo', 'check', first.id]);
    expect(r.message).toContain('Next one');
    const all = items().filter((i) => i.text === 'Water the plants');
    expect(all).toHaveLength(2);
    const next = all.find((i) => !i.done)!;
    expect(next.repeat).toEqual({ kind: 'daily' });
    expect(next.dueOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(all.find((i) => i.done)!.repeat).toBeUndefined();
    expect((await f.run(['todo', 'repeat', next.id, 'hourly'])).ok).toBe(false);
    // The assistant sees what the row shows.
    const list = String((await f.run(['todo', 'list'])).message);
    expect(list).toContain('repeats every day');
    expect(list).toMatch(/due \d{4}-\d{2}-\d{2}/);
  });
  it('a plan with no day gets its first matching day when it starts repeating', async () => {
    await f.run(['todo', 'add', 'Stretch']);
    const it0 = items().find((i) => i.text === 'Stretch')!;
    expect(it0.dueOn).toBeUndefined();
    const r = await f.run(['todo', 'repeat', it0.id, 'daily']);
    expect(r.message).toContain('first due');
    expect(items().find((i) => i.id === it0.id)!.dueOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('dropping a repeating plan skips it: the next one stays', async () => {
    await f.run(['todo', 'add', 'Gym 18:00 every monday']);
    const it0 = items().find((i) => i.text === 'Gym')!;
    const r = await f.run(['todo', 'drop', it0.id]);
    expect(r.message).toContain('Skipped "Gym" this time');
    expect(r.message).toContain('18:00');
    const all = items().filter((i) => i.text === 'Gym');
    expect(all).toHaveLength(2);
    expect(all.find((i) => i.id === it0.id)!.droppedAt).toBeDefined();
    expect(all.find((i) => i.id !== it0.id)!.repeat).toEqual({ kind: 'weekly', day: 1 });
  });
  it('the next one keeps the reminder and the kind (event)', async () => {
    await f.run(['todo', 'add', 'Team sync']);
    const it0 = items().find((i) => i.text === 'Team sync')!;
    await f.run(['task', 'kind', it0.taskNodeId!, 'event']);
    await f.run(['task', 'remind', it0.taskNodeId!, '10']);
    await f.run(['todo', 'repeat', it0.id, 'weekly']);
    await f.run(['todo', 'check', it0.id]);
    const next = items().find((i) => i.text === 'Team sync' && !i.done)!;
    const task = (JSON.parse(readFileSync(boardPath, 'utf-8')).nodes as Array<{ id: string; state: { kind?: string; remindMin?: number } }>).find((n) => n.id === next.taskNodeId)!;
    expect(task.state.kind).toBe('event');
    expect(task.state.remindMin).toBe(10);
  });
});

describe('repeatsBehind', () => {
  const sched: Record<string, string> = { t1: '2026-11-07T09:00', t2: '2026-11-08T09:00' };
  const day = (id: string) => sched[id]?.slice(0, 10);
  it('finds open repeating plans whose day passed, and only those', () => {
    const items = [
      { id: 'a', done: false, repeat: { kind: 'daily' }, taskNodeId: 't1' },                  // yesterday, unticked
      { id: 'b', done: false, repeat: { kind: 'daily' }, taskNodeId: 't2' },                  // today
      { id: 'c', done: true, repeat: { kind: 'daily' }, taskNodeId: 't1' },                   // ticked
      { id: 'd', done: false, droppedAt: 'x', repeat: { kind: 'daily' }, taskNodeId: 't1' },  // dropped
      { id: 'e', done: false, taskNodeId: 't1' },                                            // no repeat
      { id: 'f', done: false, repeat: { kind: 'weekdays' }, dueOn: '2026-11-06', taskNodeId: null }, // due day passed
      { id: 'g', done: false, repeat: { kind: 'daily' }, taskNodeId: null },                  // no day at all
    ];
    expect(repeatsBehind(items, day, '2026-11-08')).toEqual(['a', 'f']);
  });
});
