/**
 * chainWalker tests — ADR 0003 §2.
 *
 * Sanity tests for the pure-function helper extracted from timelineSelector.ts.
 * The full chain-walk semantics are covered by timelineSelector.test.ts; these
 * tests verify the export boundary (buildChainIndex + walkChain) directly so
 * future refactors of the helper can be validated in isolation.
 */

import { describe, it, expect } from 'vitest';
import { buildChainIndex, walkChain } from '../../../src/renderer/store/chainWalker';
import type { Node } from '../../../src/shared/types/node';
import type { Edge } from '../../../src/shared/types/edge';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';

// ── Fixture helpers ───────────────────────────────────────────────────────────

let _taskSeq = 0;
function makeTaskNode(
  id: string,
  todoId: string,
  plannedMin: number,
  overrides: Partial<TaskState> = {},
): Node {
  _taskSeq++;
  const state: TaskState = {
    text: `Task ${id}`,
    done: false,
    durationMin: plannedMin,
    eta: `~${plannedMin} min`,
    sequenceNumber: _taskSeq,
    layer: 0,
    createdAt: new Date(Date.UTC(2026, 4, 14, 0, 0, _taskSeq)).toISOString(),
    parentTodoId: todoId,
    parentTaskId: null,
    todoItemId: `item-${id}`,
    pomoSessionsCompleted: 0,
    plannedMin,
    secondsAccumulated: 0,
    currentSessionElapsedSec: 0,
    ...overrides,
  };
  return {
    id,
    kind: 'todo.task',
    position: { x: 0, y: 0 },
    isMother: false,
    state,
    config: { showDuration: true },
  };
}

function makeEdge(fromId: string, toId: string): Edge {
  return {
    id: `edge-${fromId}-${toId}`,
    from: { nodeId: fromId, event: 'task.next' },
    to: { nodeId: toId, command: 'task.activate' },
    enabled: true,
  };
}

// ── buildChainIndex ───────────────────────────────────────────────────────────

describe('buildChainIndex', () => {
  it('returns an empty map for no edges', () => {
    const idx = buildChainIndex([]);
    expect(idx.size).toBe(0);
  });

  it('ignores edges whose event is not task.next', () => {
    const edges: Edge[] = [
      {
        id: 'e1',
        from: { nodeId: 'a', event: 'pomo.complete' },
        to: { nodeId: 'b', command: 'task.activate' },
        enabled: true,
      },
    ];
    const idx = buildChainIndex(edges);
    expect(idx.size).toBe(0);
  });

  it('builds prevs/nexts for a linear A→B→C chain', () => {
    const idx = buildChainIndex([makeEdge('a', 'b'), makeEdge('b', 'c')]);
    expect(idx.get('a')?.nexts).toEqual(['b']);
    expect(idx.get('a')?.prevs).toEqual([]);
    expect(idx.get('b')?.prevs).toEqual(['a']);
    expect(idx.get('b')?.nexts).toEqual(['c']);
    expect(idx.get('c')?.prevs).toEqual(['b']);
    expect(idx.get('c')?.nexts).toEqual([]);
  });

  it('handles fork: one source with two targets', () => {
    const idx = buildChainIndex([makeEdge('a', 'b'), makeEdge('a', 'c')]);
    expect(idx.get('a')?.nexts).toEqual(['b', 'c']);
    expect(idx.get('b')?.prevs).toEqual(['a']);
    expect(idx.get('c')?.prevs).toEqual(['a']);
  });
});

// ── walkChain smoke ───────────────────────────────────────────────────────────

describe('walkChain', () => {
  it('walks a linear 3-task chain in order', () => {
    _taskSeq = 0;
    const todoId = 'todo-walk';
    const t1 = makeTaskNode('w1', todoId, 10);
    const t2 = makeTaskNode('w2', todoId, 20);
    const t3 = makeTaskNode('w3', todoId, 30);
    const idx = buildChainIndex([makeEdge('w1', 'w2'), makeEdge('w2', 'w3')]);
    const units = walkChain(todoId, [t1, t2, t3], idx);
    expect(units).toHaveLength(3);
    expect(units[0]).toMatchObject({ kind: 'task', taskId: 'w1', plannedMin: 10 });
    expect(units[1]).toMatchObject({ kind: 'task', taskId: 'w2', plannedMin: 20 });
    expect(units[2]).toMatchObject({ kind: 'task', taskId: 'w3', plannedMin: 30 });
  });
});
