// @vitest-environment jsdom
/**
 * Server updates (docs/06-requirements/server-updates.md, F9): a KRNL0 that is
 * older than the board it edits keeps what it does not know. The website a
 * server serves can be one version behind the desktop app; when that older
 * website saves a board, details only the newer app knows must survive, or
 * the three-way merge would read their absence as a deletion.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useBoardStore } from '../../../../src/renderer/store/boardStore';
import { makeCommandHandler } from '../../../../src/renderer/components/Canvas/commandDispatch';
import { migrateBoard, seedBoard } from '../../../../src/shared/boardMigrate';
import { mergeBoards } from '../../../../src/shared/boardMerge';
import type { Board } from '../../../../src/shared/types';

type Loose = Record<string, unknown>;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function boardFromANewerApp(): Board {
  const b = migrateBoard(seedBoard()) as Loose & { nodes: Loose[] };
  b['futureTop'] = { kept: true };
  const todo = b.nodes.find((n) => n['kind'] === 'todo')!;
  const habit = b.nodes.find((n) => n['kind'] === 'habit')!;
  todo['futureNode'] = 'kept';
  (todo['state'] as Loose)['futureState'] = 42;
  (todo['state'] as Loose)['items'] = [
    { id: 'it-1', text: 'Read chapter 4', done: false, createdAt: '2026-11-20T08:00:00.000Z', completedAt: null, taskNodeId: null, futureItem: 'kept' },
  ];
  (habit['state'] as Loose)['habits'] = [
    { id: 'h-1', name: 'Morning run', log: [], createdAt: '2026-11-01', futureHabit: ['kept'] },
  ];
  // A window kind this KRNL0 has never heard of.
  b.nodes.push({ id: 'future-1', kind: 'future-kind', position: { x: 900, y: 0 }, isMother: false, state: { whatever: 1 }, config: {} });
  return migrateBoard(b) as Board;
}

beforeEach(() => {
  // @ts-expect-error jsdom has no bridge
  globalThis.window.krnl = { boardSave: vi.fn().mockResolvedValue(undefined) };
  useBoardStore.setState({ board: null, viewport: { x: 0, y: 0, zoom: 1 } });
});

describe('an older KRNL0 keeps what it does not know', () => {
  it('loading, ticking, renaming, moving and adding keep every unknown detail', () => {
    const start = boardFromANewerApp();
    useBoardStore.getState().setBoard(clone(start));
    const todoId = start.nodes.find((n) => n.kind === 'todo')!.id;
    const habitId = start.nodes.find((n) => n.kind === 'habit')!.id;

    makeCommandHandler(todoId)('todo.toggle', { id: 'it-1' });
    makeCommandHandler(todoId)('todo.edit', { id: 'it-1', text: 'Read chapter 5' });
    makeCommandHandler(todoId)('todo.add', { text: 'Call mom' });
    makeCommandHandler(habitId)('habit.toggleDay', { id: 'h-1' });
    useBoardStore.getState().updateNode('future-1', { position: { x: 960, y: 40 } });

    const after = useBoardStore.getState().board as unknown as Loose & { nodes: Loose[] };
    expect(after['futureTop']).toEqual({ kept: true });
    const todo = after.nodes.find((n) => n['id'] === todoId)!;
    expect(todo['futureNode']).toBe('kept');
    expect((todo['state'] as Loose)['futureState']).toBe(42);
    const item = ((todo['state'] as Loose)['items'] as Loose[]).find((i) => i['id'] === 'it-1')!;
    expect(item['futureItem']).toBe('kept');
    expect(item['text']).toBe('Read chapter 5');
    const habit = ((after.nodes.find((n) => n['id'] === habitId)!['state'] as Loose)['habits'] as Loose[])[0]!;
    expect(habit['futureHabit']).toEqual(['kept']);
    const future = after.nodes.find((n) => n['id'] === 'future-1')!;
    expect(future['kind']).toBe('future-kind');
    expect(future['state']).toEqual({ whatever: 1 });
  });

  it('so the merge keeps the newer app’s details instead of reading them as deleted', () => {
    const base = boardFromANewerApp() as unknown as Loose;
    useBoardStore.getState().setBoard(clone(base) as unknown as Board);
    const todoId = (base['nodes'] as Loose[]).find((n) => n['kind'] === 'todo')!['id'] as string;
    makeCommandHandler(todoId)('todo.toggle', { id: 'it-1' });
    const mine = useBoardStore.getState().board as unknown as Loose;
    const merged = mergeBoards(base, mine, base) as Loose & { nodes: Loose[] };
    expect(merged['futureTop']).toEqual({ kept: true });
    const item = (((merged.nodes.find((n) => n['id'] === todoId)!['state'] as Loose)['items']) as Loose[])[0]!;
    expect(item['futureItem']).toBe('kept');
    expect(item['done']).toBe(true);
  });
});
