/**
 * #168 — editing task 1 in a chain must keep the chain sequential.
 *
 * Rules (amends ADR 0005, see decisions.md "#168 chain push"):
 *   - A task's block length (incl. a calendar resize override) is also how far
 *     the cursor advances, so successors start where the block visually ends.
 *   - An anchored successor is an earliest-start constraint: it keeps its own
 *     time when that is later than the predecessor's end, and is pushed to the
 *     predecessor's end when it would otherwise overlap.
 */
import { describe, it, expect } from 'vitest';
import { selectSchedule } from '../../../src/renderer/store/scheduleSelector';
import type { Board } from '../../../src/shared/types';
import type { Node } from '../../../src/shared/types/node';
import type { Edge } from '../../../src/shared/types/edge';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';

let seq = 0;
const TODO = 'todo-168';

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

describe('#168 — chain stays sequential when task 1 changes', () => {
  it('a resized (scheduledDurationMin) task 1 pushes its derived successor', () => {
    seq = 0;
    const b = board(
      [task('t1', 25, { scheduledFor: '2026-11-02T09:00', scheduledDurationMin: 90 }), task('t2', 25)],
      [edge('t1', 't2')],
    );
    const { placements } = selectSchedule(b);
    expect(placements.get('t1')?.endISO).toBe('2026-11-02T10:30');
    expect(placements.get('t2')?.startISO).toBe('2026-11-02T10:30');
  });

  it('an anchored successor that would overlap is pushed to the predecessor end', () => {
    seq = 0;
    const b = board(
      [
        task('t1', 60, { scheduledFor: '2026-11-02T09:00' }),
        task('t2', 30, { scheduledFor: '2026-11-02T09:30' }),
        task('t3', 15),
      ],
      [edge('t1', 't2'), edge('t2', 't3')],
    );
    const { placements } = selectSchedule(b);
    expect(placements.get('t2')?.startISO).toBe('2026-11-02T10:00');
    expect(placements.get('t2')?.endISO).toBe('2026-11-02T10:30');
    expect(placements.get('t3')?.startISO).toBe('2026-11-02T10:30');
  });

  it('an anchored successor placed after the predecessor keeps its own time (gap allowed)', () => {
    seq = 0;
    const b = board(
      [task('t1', 30, { scheduledFor: '2026-11-02T09:00' }), task('t2', 30, { scheduledFor: '2026-11-02T13:00' })],
      [edge('t1', 't2')],
    );
    expect(selectSchedule(b).placements.get('t2')?.startISO).toBe('2026-11-02T13:00');
  });

  it('an anchored parallel branch is pushed past the preceding task too', () => {
    seq = 0;
    const b = board(
      [
        task('a', 60, { scheduledFor: '2026-11-02T09:00' }),
        task('x', 30, { scheduledFor: '2026-11-02T09:15' }),
        task('y', 30),
      ],
      [edge('a', 'x'), edge('a', 'y')],
    );
    const { placements } = selectSchedule(b);
    expect(placements.get('x')?.startISO).toBe('2026-11-02T10:00');
    expect(placements.get('y')?.startISO).toBe('2026-11-02T10:00');
  });
});

describe('DST — blocks keep their wall-clock length', () => {
  it('a 60-minute block across the spring-forward night ends 60 wall-clock minutes later', () => {
    seq = 0;
    const b = board(
      [task('t1', 60, { scheduledFor: '2026-03-29T01:30', scheduledDurationMin: 60 }), task('t2', 30)],
      [edge('t1', 't2')],
    );
    const { placements } = selectSchedule(b);
    expect(placements.get('t1')?.endISO).toBe('2026-03-29T02:30');
    expect(placements.get('t2')?.startISO).toBe('2026-03-29T02:30');
  });
});

