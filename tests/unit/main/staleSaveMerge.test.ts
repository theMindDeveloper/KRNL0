/**
 * Stale-save merge on real boards: board.json comes back from the loader
 * migrated (defaults added, keys reordered); the renderer's copies do not.
 * Merging must compare all three in the loader's shape, or a node the user
 * created and then deleted reads as "changed by the file" and comes back.
 */

import { describe, it, expect } from 'vitest';
import { migrateBoard, seedBoard } from '../../../src/main/persistence/board';
import { mergeBoards } from '../../../src/shared/boardMerge';

type B = Record<string, unknown> & { nodes: Array<Record<string, unknown>> };
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const norm = (b: unknown): B => migrateBoard(clone(b)) as B;

describe('stale save → merge', () => {
  // The renderer created a task (in its own, un-migrated shape) and saved.
  const seeded = norm(seedBoard());
  const task = { id: 'task-new', kind: 'todo.task', isMother: false, position: { x: 900, y: 900 }, state: { text: 'draft', done: false }, config: {} };
  const rendererBase = { ...clone(seeded), nodes: [...clone(seeded).nodes, task] };
  // Then the CLI added an unrelated note; board.json is what the loader returns.
  const note = { id: 'node-cli', kind: 'text', isMother: false, position: { x: 0, y: 1200 }, state: { text: 'from cli' }, config: {} };
  const theirs = norm({ ...clone(rendererBase), nodes: [...clone(rendererBase).nodes, note] });
  // The user deletes the task; that save is stale.
  const mine = { ...clone(rendererBase), nodes: clone(rendererBase).nodes.filter((n) => n.id !== 'task-new') };

  it('the migrated file copy alone would resurrect the deleted task (why we normalise)', () => {
    const raw = mergeBoards(rendererBase, mine, theirs) as B;
    expect(raw.nodes.some((n) => n.id === 'task-new')).toBe(true);
  });

  it('with all three normalised, the deletion holds and the CLI note survives', () => {
    const out = mergeBoards(norm(rendererBase), norm(mine), theirs) as B;
    expect(out.nodes.some((n) => n.id === 'task-new')).toBe(false);
    expect(out.nodes.some((n) => n.id === 'node-cli')).toBe(true);
  });
});
