/** Review 6.1 — "not doing this any more": dropped is neither done nor deleted. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { todoDrop, todoUndrop, todoBuckets, todoClearArchived } from '../../../src/renderer/components/nodes/TodoNode/commands';
import type { TodoItem, TodoState } from '../../../src/renderer/components/nodes/TodoNode/types';
import { SysFacade } from '../../../src/sys/SysFacade';
import { seedBoard } from '../../../src/main/persistence/board';

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test'), getAppPath: vi.fn(() => tmpdir()), on: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}));

const env = { uuid: () => 'x', now: () => '2026-11-08T10:00:00.000Z' };
const item = (id: string, extra: Partial<TodoItem> = {}): TodoItem => ({ id, text: id, done: false, createdAt: '2026-11-01T08:00:00.000Z', completedAt: null, taskNodeId: null, ...extra });

describe('drop / undrop', () => {
  const s: TodoState = { items: [item('a'), item('b', { done: true, completedAt: '2026-11-08T09:00:00.000Z' })] };

  it('a dropped item leaves the open list for the archive, and is not done', () => {
    const d = todoDrop(s, { id: 'a' }, env);
    const a = d.items.find((i) => i.id === 'a')!;
    expect(a.droppedAt).toBe(env.now());
    expect(a.done).toBe(false);
    expect(a.completedAt).toBeNull();
    const b = todoBuckets(d, Date.parse('2026-11-08T12:00:00'));
    expect(b.active.map((i) => i.id)).toEqual([]);
    expect(b.archived.map((i) => i.id)).toEqual(['a']);
  });

  it('a done item cannot be dropped; undrop brings it back to the list', () => {
    expect(todoDrop(s, { id: 'b' }, env)).toBe(s);
    const back = todoUndrop(todoDrop(s, { id: 'a' }, env), { id: 'a' });
    expect(todoBuckets(back, Date.parse('2026-11-08T12:00:00')).active.map((i) => i.id)).toEqual(['a']);
    expect('droppedAt' in back.items[0]!).toBe(false);
  });

  it('clearing the archive clears dropped items too', () => {
    const d = todoDrop(s, { id: 'a' }, env);
    expect(todoClearArchived(d, Date.parse('2026-11-08T12:00:00')).items.map((i) => i.id)).toEqual(['b']);
  });
});

describe('krnl todo drop', () => {
  let dir = '';
  let boardPath = '';
  let f: SysFacade;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'krnl0-drop-'));
    boardPath = join(dir, 'board.json');
    writeFileSync(boardPath, JSON.stringify(seedBoard()), 'utf-8');
    f = new SysFacade({ boardPath, hasOpenRenderer: () => false, onBoardChanged: () => {} });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const items = () => (JSON.parse(readFileSync(boardPath, 'utf-8')).nodes.find((n: { kind: string; isMother?: boolean }) => n.kind === 'todo' && n.isMother).state.items as TodoItem[]);

  it('drops and undrops by id', async () => {
    await f.run(['todo', 'add', 'Learn the banjo']);
    const id = items().find((i) => i.text === 'Learn the banjo')!.id;
    const r = await f.run(['todo', 'drop', id]);
    expect(r.ok).toBe(true);
    expect(items().find((i) => i.id === id)!.droppedAt).toBeDefined();
    expect((await f.run(['todo', 'undrop', id])).ok).toBe(true);
    expect(items().find((i) => i.id === id)!.droppedAt).toBeUndefined();
  });
});
