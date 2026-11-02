/** Three-way board merge — the user's edit and a CLI edit both survive. */
import { describe, it, expect } from 'vitest';
import { mergeBoards } from '../../../src/shared/boardMerge';

const n = (id: string, text: string) => ({ id, kind: 'text', state: { text } });
const board = (nodes: unknown[], extra: Record<string, unknown> = {}) => ({ nodes, edges: [], ...extra });

describe('mergeBoards', () => {
  const base = board([n('a', 'A'), n('b', 'B')], { uiMode: 'advanced' });

  it('keeps an edit on each side when they touch different items', () => {
    const mine = board([n('a', 'A (mine)'), n('b', 'B')], { uiMode: 'advanced' });
    const theirs = board([n('a', 'A'), n('b', 'B (cli)'), n('c', 'C (cli)')], { uiMode: 'advanced' });
    const out = mergeBoards(base, mine, theirs) as { nodes: Array<{ id: string; state: { text: string } }> };
    expect(out.nodes.map((x) => [x.id, x.state.text])).toEqual([
      ['a', 'A (mine)'], ['b', 'B (cli)'], ['c', 'C (cli)'],
    ]);
  });

  it('the user wins when both changed the same item', () => {
    const mine = board([n('a', 'mine'), n('b', 'B')]);
    const theirs = board([n('a', 'cli'), n('b', 'B')]);
    const out = mergeBoards(base, mine, theirs) as { nodes: Array<{ state: { text: string } }> };
    expect(out.nodes[0]!.state.text).toBe('mine');
  });

  it('applies deletions and additions from both sides', () => {
    const mine = board([n('a', 'A'), n('m', 'M (mine)')]); // deleted b, added m
    const theirs = board([n('b', 'B')]); // cli deleted a
    const out = mergeBoards(base, mine, theirs) as { nodes: Array<{ id: string }> };
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
});
