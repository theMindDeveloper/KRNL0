/**
 * Calendar parallel drop — a task dropped onto another task runs alongside it,
 * even when it was chained after that task (otherwise #168 pushes it back).
 *
 * Rules (amends ADR 0005, see decisions.md "#168 chain push"):
 *   - A task's block length (incl. a calendar resize override) is also how far
 *     the cursor advances, so successors start where the block visually ends.
 *   - An anchored successor is an earliest-start constraint: it keeps its own
 *     time when that is later than the predecessor's end, and is pushed to the
 *     predecessor's end when it would otherwise overlap.
 */
import { describe, it, expect } from 'vitest';
import { parallelizeChainEdges } from '../../../src/renderer/store/chainWalker';
import { selectSchedule } from '../../../src/renderer/store/scheduleSelector';
import type { Board } from '../../../src/shared/types';
import type { Node } from '../../../src/shared/types/node';
import type { Edge } from '../../../src/shared/types/edge';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';

let seq = 0;
const TODO = 'todo-par';

function task(id: string, plannedMin: number, extra: Partial<TaskState> = {}): Node {
  seq++;
  const state: TaskState = {
    text: id, done: false, durationMin: plannedMin, eta: `~${plannedMin} min`,
    sequenceNumber: seq, layer: 0,
    createdAt: new Date(Date.UTC(2026, 10, 1, 0, 0, seq)).toISOString(),
    parentTodoId: TODO, parentTaskId: null, todoItemId: `item-${id}`,
    pomoSessionsCompleted: 0, plannedMin, secondsAccumulated: 0,
    currentSessionElapsedSec: 0, kind: 'event', ...extra,
  };
  return { id, kind: 'todo.task', position: { x: 0, y: 0 }, isMother: false, state, config: {} };
}

function edge(a: string, b: string): Edge {
  return { id: `e-${a}-${b}`, from: { nodeId: a, event: 'task.next' }, to: { nodeId: b, command: 'task.activate' }, enabled: true };
}

function board(nodes: Node[], edges: Edge[]): Board {
  return {
    version: 1, schemaVersion: 2, savedAt: '2026-11-01T00:00:00.000Z',
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      { id: TODO, kind: 'todo', position: { x: 0, y: 0 }, isMother: true, state: { items: [] }, config: {} },
      ...nodes,
    ],
    edges,
  };
}

describe('parallel drop rewires the chain', () => {
  const mk = (a: string, b: string) => edge(a, b);
  const at = (id: string, when: string, min: number) => task(id, min, { scheduledFor: when });

  it('t2 chained after t1, dropped on t1 → same start, t3 still follows', () => {
    seq = 0;
    const nodes = [at('t1', '2026-11-02T21:00', 45), at('t2', '2026-11-02T21:00', 30), task('t3', 15)];
    const before = selectSchedule(board(nodes, [edge('t1', 't2'), edge('t2', 't3')]));
    expect(before.placements.get('t2')?.startISO).toBe('2026-11-02T21:45');

    const edges = parallelizeChainEdges([edge('t1', 't2'), edge('t2', 't3')], 't2', 't1', true, mk);
    const { placements } = selectSchedule(board(nodes, edges));
    expect(placements.get('t1')?.startISO).toBe('2026-11-02T21:00');
    expect(placements.get('t2')?.startISO).toBe('2026-11-02T21:00');
    expect(placements.get('t3')?.startISO).toBe('2026-11-02T21:45');
  });

  it('target with a predecessor → moved task forks from the same predecessor', () => {
    seq = 0;
    const nodes = [at('t0', '2026-11-02T08:00', 60), task('t1', 30), at('t2', '2026-11-02T09:00', 20)];
    const edges = parallelizeChainEdges([edge('t0', 't1'), edge('t1', 't2')], 't2', 't1', true, mk);
    expect(edges.some((e) => e.from.nodeId === 't0' && e.to.nodeId === 't2')).toBe(true);
    expect(edges.some((e) => e.from.nodeId === 't1' && e.to.nodeId === 't2')).toBe(false);
    const { placements } = selectSchedule(board(nodes, edges));
    expect(placements.get('t1')?.startISO).toBe('2026-11-02T09:00');
    expect(placements.get('t2')?.startISO).toBe('2026-11-02T09:00');
  });

  it('different todos → only unlinks, never adds cross-todo edges', () => {
    const edges = parallelizeChainEdges([edge('x', 'm'), edge('a', 't')], 'm', 't', false, mk);
    expect(edges.map((e) => e.id)).toEqual(['e-a-t']);
  });
});
