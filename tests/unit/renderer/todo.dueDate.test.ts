/** Review 2.1 — "tax form due Friday": a due day apart from the planned time. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { parseDue, dueLabel } from '../../../src/shared/due';
import { todoSetDue } from '../../../src/renderer/components/nodes/TodoNode/commands';
import type { TodoItem, TodoState } from '../../../src/renderer/components/nodes/TodoNode/types';
import { SysFacade } from '../../../src/sys/SysFacade';
import { seedBoard } from '../../../src/main/persistence/board';

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test'), getAppPath: vi.fn(() => tmpdir()), on: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}));

const TODAY = '2026-11-08'; // a Sunday

describe('parseDue', () => {
  it('reads days, words and weekdays (the next one; today counts)', () => {
    expect(parseDue('2026-11-13', TODAY)).toBe('2026-11-13');
    expect(parseDue('today', TODAY)).toBe(TODAY);
    expect(parseDue('Tomorrow', TODAY)).toBe('2026-11-09');
    expect(parseDue('fri', TODAY)).toBe('2026-11-13');
    expect(parseDue('sunday', TODAY)).toBe(TODAY);
    expect(parseDue('off', TODAY)).toBeNull();
    expect(parseDue('soon', TODAY)).toBeUndefined();
    expect(parseDue('2026-02-30', TODAY)).toBeUndefined();
  });
});

describe('dueLabel', () => {
  it('says how close it is', () => {
    expect(dueLabel('2026-11-06', TODAY)).toEqual({ text: 'overdue · Fri 6', tone: 'over' });
    expect(dueLabel(TODAY, TODAY).tone).toBe('today');
    expect(dueLabel('2026-11-09', TODAY).text).toBe('due tomorrow');
    expect(dueLabel('2026-11-13', TODAY).text).toBe('due Fri');
    expect(dueLabel('2026-11-20', TODAY)).toEqual({ text: 'due 20 Nov', tone: 'later' });
  });
});

describe('todoSetDue', () => {
  const item: TodoItem = { id: 'a', text: 'Tax form', done: false, createdAt: '2026-11-01T08:00:00.000Z', completedAt: null, taskNodeId: null };
  const s: TodoState = { items: [item] };
  it('sets, clears, and ignores a bad day', () => {
    const on = todoSetDue(s, { id: 'a', dueOn: '2026-11-13' });
    expect(on.items[0]!.dueOn).toBe('2026-11-13');
    expect('dueOn' in todoSetDue(on, { id: 'a', dueOn: null }).items[0]!).toBe(false);
    expect(todoSetDue(s, { id: 'a', dueOn: 'friday' })).toBe(s);
  });
});

describe('krnl todo due', () => {
  let dir = '';
  let boardPath = '';
  let f: SysFacade;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'krnl0-due-'));
    boardPath = join(dir, 'board.json');
    writeFileSync(boardPath, JSON.stringify(seedBoard()), 'utf-8');
    f = new SysFacade({ boardPath, hasOpenRenderer: () => false, onBoardChanged: () => {} });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const items = () => (JSON.parse(readFileSync(boardPath, 'utf-8')).nodes.find((n: { kind: string; isMother?: boolean }) => n.kind === 'todo' && n.isMother).state.items as TodoItem[]);

  it('sets and clears a due day; refuses words it cannot read', async () => {
    expect((await f.run(['todo', 'add', 'Send the tax form'])).ok).toBe(true);
    const id = items().find((i) => i.text === 'Send the tax form')!.id;
    const r = await f.run(['todo', 'due', id, '2026-12-01']);
    expect(r.ok).toBe(true);
    expect(items().find((i) => i.id === id)!.dueOn).toBe('2026-12-01');
    expect((await f.run(['todo', 'due', id, 'someday'])).ok).toBe(false);
    expect((await f.run(['todo', 'due', id, 'off'])).ok).toBe(true);
    expect(items().find((i) => i.id === id)!.dueOn).toBeUndefined();
  });
});
