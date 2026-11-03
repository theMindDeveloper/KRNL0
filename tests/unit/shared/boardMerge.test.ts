/** Three-way board merge — the user's edit and a CLI edit both survive. */
import { describe, it, expect } from 'vitest';
import { mergeBoards } from '../../../src/shared/boardMerge';

const n = (id: string, text: string) => ({ id, kind: 'text', state: { text } });
const board = (nodes: unknown[], extra: Record<string, unknown> = {}) => ({ nodes, edges: [], ...extra });
type Out = { nodes: Array<{ id: string; state: Record<string, unknown> }> };

describe('mergeBoards', () => {
  const base = board([n('a', 'A'), n('b', 'B')], { uiMode: 'advanced' });

  it('keeps an edit on each side when they touch different items', () => {
    const mine = board([n('a', 'A (mine)'), n('b', 'B')], { uiMode: 'advanced' });
    const theirs = board([n('a', 'A'), n('b', 'B (cli)'), n('c', 'C (cli)')], { uiMode: 'advanced' });
    const out = mergeBoards(base, mine, theirs) as unknown as Out;
    expect(out.nodes.map((x) => [x.id, x.state['text']])).toEqual([
      ['a', 'A (mine)'], ['b', 'B (cli)'], ['c', 'C (cli)'],
    ]);
  });

  it('the file wins when both changed the very same value', () => {
    const mine = board([n('a', 'mine'), n('b', 'B')]);
    const theirs = board([n('a', 'cli'), n('b', 'B')]);
    const out = mergeBoards(base, mine, theirs) as unknown as Out;
    expect(out.nodes[0]!.state['text']).toBe('cli');
  });

  it('applies deletions and additions from both sides', () => {
    const mine = board([n('a', 'A'), n('m', 'M (mine)')]); // deleted b, added m
    const theirs = board([n('b', 'B')]); // cli deleted a
    const out = mergeBoards(base, mine, theirs) as unknown as Out;
    expect(out.nodes.map((x) => x.id)).toEqual(['m']);
  });

  it('top-level fields: the user value when they changed it, else the file value', () => {
    const mine = board([n('a', 'A'), n('b', 'B')], { uiMode: 'easy' });
    const theirs = board([n('a', 'A'), n('b', 'B')], { uiMode: 'advanced', activeCanvasId: 'canvas-x' });
    const out = mergeBoards(base, mine, theirs);
    expect(out['uiMode']).toBe('easy');
    expect(out['activeCanvasId']).toBe('canvas-x');
  });

  it('merges the completion ledger by task id', () => {
    const b = board([], { completions: [{ taskId: 't1', completedAt: 'x' }] });
    const mine = board([], { completions: [{ taskId: 't1', completedAt: 'x' }, { taskId: 't2', completedAt: 'y' }] });
    const theirs = board([], { completions: [{ taskId: 't1', completedAt: 'x' }, { taskId: 't3', completedAt: 'z' }] });
    const out = mergeBoards(b, mine, theirs) as { completions: Array<{ taskId: string }> };
    expect(out.completions.map((c) => c.taskId).sort()).toEqual(['t1', 't2', 't3']);
  });

  it('a row ticked in the UI while `krnl task add` appends a row keeps both (same Todo node)', () => {
    const row = (id: string, done: boolean, taskNodeId: string) => ({ id, text: id, done, taskNodeId });
    const todo = (items: unknown[]) => ({ id: 'mother-todo', kind: 'todo', state: { items } });
    const task = (id: string, item: string) => ({ id, kind: 'todo.task', state: { todoItemId: item } });
    const b = board([todo([row('r1', false, 't1')]), task('t1', 'r1')]);
    const mine = board([todo([row('r1', true, 't1')]), task('t1', 'r1')]);
    const theirs = board([todo([row('r1', false, 't1'), row('r2', false, 't2')]), task('t1', 'r1'), task('t2', 'r2')]);
    const out = mergeBoards(b, mine, theirs) as unknown as Out;
    const items = (out.nodes.find((x) => x.id === 'mother-todo')!.state['items'] as Array<{ id: string; done: boolean }>);
    expect(items).toEqual([
      { id: 'r1', text: 'r1', done: true, taskNodeId: 't1' },
      { id: 'r2', text: 'r2', done: false, taskNodeId: 't2' },
    ]);
    // No task points at a missing row.
    for (const t of out.nodes.filter((x) => x.id.startsWith('t'))) {
      expect(items.some((i) => i.id === t.state['todoItemId'])).toBe(true);
    }
  });

  it('a pomo span recorded by the CLI survives a UI edit of another pomo field', () => {
    const pomo = (history: unknown[], label: string) => ({ id: 'mother-pomo', kind: 'pomo', state: { label, history } });
    const b = board([pomo([{ id: 's1', durationMin: 5 }], '')]);
    const mine = board([pomo([{ id: 's1', durationMin: 5 }], 'Thesis')]);
    const theirs = board([pomo([{ id: 's1', durationMin: 5 }, { id: 's2', durationMin: 9 }], '')]);
    const out = mergeBoards(b, mine, theirs) as unknown as Out;
    const st = out.nodes[0]!.state as { label: string; history: Array<{ id: string }> };
    expect(st.label).toBe('Thesis');
    expect(st.history.map((h) => h.id)).toEqual(['s1', 's2']);
  });
});
