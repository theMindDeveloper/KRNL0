/**
 * Decision 63 — connections are only drawn. Running a task alongside another
 * is the same start (its own time); a connection never pushes or rewires.
 */
import { describe, it, expect } from 'vitest';
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

describe('a task put on another task\'s time runs alongside it (Decision 63)', () => {
  const at = (id: string, when: string, min: number) => task(id, min, { scheduledFor: when });

  it('t2 connected after t1, put at t1\'s start: both start then; t3 keeps its own time', () => {
    seq = 0;
    const edges = [edge('t1', 't2'), edge('t2', 't3')];
    const nodes = [at('t1', '2026-11-02T21:00', 45), at('t2', '2026-11-02T21:00', 30), at('t3', '2026-11-02T21:45', 15)];
    const { placements } = selectSchedule(board(nodes, edges));
    expect(placements.get('t1')?.startISO).toBe('2026-11-02T21:00');
    expect(placements.get('t2')?.startISO).toBe('2026-11-02T21:00');
    expect(placements.get('t3')?.startISO).toBe('2026-11-02T21:45');
  });

  it('a connection never pushes a task: one put before the end of the task before it stays there', () => {
    seq = 0;
    const nodes = [at('t0', '2026-11-02T08:00', 90), at('t1', '2026-11-02T08:30', 30)];
    const { placements } = selectSchedule(board(nodes, [edge('t0', 't1')]));
    expect(placements.get('t1')?.startISO).toBe('2026-11-02T08:30');
  });
});
