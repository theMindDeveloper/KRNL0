/**
 * scheduleSelector tests — ADR 0003 §3.
 *
 * Covers:
 *   1. Single-anchor straight chain — all successors cascade by plannedMin.
 *   2. Mid-chain anchor — predecessors absent from output.
 *   3. Parallel-fork sharing startISO; group cumulative = max(branch.plannedMin).
 *   4. Multi-todo independent anchors.
 *   5. Multi-anchor-per-chain (defence-in-depth — earliest wins, dev warn).
 *   6. Breaks invisible (cascade math uses plannedMin only).
 *   7. Anchor's own scheduledDurationMin override applies.
 *   8. selectScheduledTasksForRange filters by [from, to).
 *   9. Reference-identity memoization on (nodes, edges).
 */

import { describe, it, expect } from 'vitest';
import {
  selectSchedule,
  selectScheduledTasksForRange,
} from '../../../src/renderer/store/scheduleSelector';
import type { Board } from '../../../src/shared/types';
import type { Node } from '../../../src/shared/types/node';
import type { Edge } from '../../../src/shared/types/edge';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';

// ── Fixture helpers ───────────────────────────────────────────────────────────

let _taskSeq = 0;
function makeBoard(nodes: Node[], edges: Edge[] = []): Board {
  const pomoNode: Node = {
    id: 'mother-pomo',
    kind: 'pomo',
    position: { x: 0, y: 0 },
    isMother: true,
    state: {},
    config: { sessionMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4 },
  };
  return {
    version: 1,
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [pomoNode, ...nodes],
    edges,
  };
}

function makeTodoNode(todoId: string): Node {
  return {
    id: todoId,
    kind: 'todo',
    position: { x: 0, y: 0 },
    isMother: true,
    state: { items: [] },
    config: {},
  };
}

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

// ── Test 1 — Single-anchor straight chain ───────────────────────────────────

describe('Test 1 — Single anchor at the root of a 3-task chain', () => {
  it('cascades successors by plannedMin', () => {
    _taskSeq = 0;
    const todoId = 'todo-A';
    const t1 = makeTaskNode('t1', todoId, 25, { scheduledFor: '2026-05-20T10:00' });
    const t2 = makeTaskNode('t2', todoId, 25);
    const t3 = makeTaskNode('t3', todoId, 25);
    const board = makeBoard(
      [makeTodoNode(todoId), t1, t2, t3],
      [makeEdge('t1', 't2'), makeEdge('t2', 't3')],
    );

    const { placements } = selectSchedule(board);
    expect(placements.size).toBe(3);
    expect(placements.get('t1')).toMatchObject({
      taskId: 't1',
      startISO: '2026-05-20T10:00',
      endISO: '2026-05-20T10:25',
      anchorTaskId: 't1',
      isAnchor: true,
    });
    expect(placements.get('t2')).toMatchObject({
      taskId: 't2',
      startISO: '2026-05-20T10:25',
      endISO: '2026-05-20T10:50',
      anchorTaskId: 't1',
      isAnchor: false,
    });
    expect(placements.get('t3')).toMatchObject({
      taskId: 't3',
      startISO: '2026-05-20T10:50',
      endISO: '2026-05-20T11:15',
      anchorTaskId: 't1',
      isAnchor: false,
    });
  });
});

// ── Test 2 — Mid-chain anchor: predecessors absent ──────────────────────────

describe('Test 2 — Mid-chain anchor', () => {
  it('omits predecessors entirely from placements', () => {
    _taskSeq = 0;
    const todoId = 'todo-B';
    const t1 = makeTaskNode('t1', todoId, 30);
    const t2 = makeTaskNode('t2', todoId, 20, { scheduledFor: '2026-05-20T14:00' });
    const t3 = makeTaskNode('t3', todoId, 10);
    const board = makeBoard(
      [makeTodoNode(todoId), t1, t2, t3],
      [makeEdge('t1', 't2'), makeEdge('t2', 't3')],
    );

    const { placements } = selectSchedule(board);
    expect(placements.size).toBe(2);
    expect(placements.get('t1')).toBeUndefined();
    expect(placements.get('t2')?.startISO).toBe('2026-05-20T14:00');
    expect(placements.get('t3')?.startISO).toBe('2026-05-20T14:20');
  });
});

// ── Test 3 — Parallel fork: branches share startISO; group cost = max ───────

describe('Test 3 — Parallel fork sharing start time', () => {
  it('branches share startISO; successor offsets by max(branch.plannedMin)', () => {
    _taskSeq = 0;
    const todoId = 'todo-C';
    // t1 anchored, then fork to t2a/t2b (parallel), then converge to t3.
    const t1 = makeTaskNode('t1', todoId, 25, { scheduledFor: '2026-05-20T09:00' });
    const t2a = makeTaskNode('t2a', todoId, 30);
    const t2b = makeTaskNode('t2b', todoId, 15);
    const t3 = makeTaskNode('t3', todoId, 10);
    const board = makeBoard(
      [makeTodoNode(todoId), t1, t2a, t2b, t3],
      [
        makeEdge('t1', 't2a'),
        makeEdge('t1', 't2b'),
        makeEdge('t2a', 't3'),
        makeEdge('t2b', 't3'),
      ],
    );

    const { placements } = selectSchedule(board);
    expect(placements.size).toBe(4);
    expect(placements.get('t1')?.startISO).toBe('2026-05-20T09:00');
    // Both branches share startISO at t1.end (09:25)
    expect(placements.get('t2a')?.startISO).toBe('2026-05-20T09:25');
    expect(placements.get('t2b')?.startISO).toBe('2026-05-20T09:25');
    expect(placements.get('t2a')?.parallelGroupId).not.toBeNull();
    expect(placements.get('t2b')?.parallelGroupId).toBe(
      placements.get('t2a')?.parallelGroupId,
    );
    // t3 starts at 09:25 + max(30, 15) = 09:55
    expect(placements.get('t3')?.startISO).toBe('2026-05-20T09:55');
  });
});

// ── Test 4 — Multi-todo independent anchors ────────────────────────────────

describe('Test 4 — Multiple todos with independent anchors', () => {
  it('places each chain independently keyed by taskId', () => {
    _taskSeq = 0;
    const todoA = 'todo-A';
    const todoB = 'todo-B';
    const a1 = makeTaskNode('a1', todoA, 25, { scheduledFor: '2026-05-19T08:00' });
    const a2 = makeTaskNode('a2', todoA, 25);
    const b1 = makeTaskNode('b1', todoB, 50, { scheduledFor: '2026-05-22T15:00' });
    const b2 = makeTaskNode('b2', todoB, 10);
    const board = makeBoard(
      [makeTodoNode(todoA), makeTodoNode(todoB), a1, a2, b1, b2],
      [makeEdge('a1', 'a2'), makeEdge('b1', 'b2')],
    );

    const { placements } = selectSchedule(board);
    expect(placements.size).toBe(4);
    expect(placements.get('a1')?.startISO).toBe('2026-05-19T08:00');
    expect(placements.get('a2')?.startISO).toBe('2026-05-19T08:25');
    expect(placements.get('b1')?.startISO).toBe('2026-05-22T15:00');
    expect(placements.get('b2')?.startISO).toBe('2026-05-22T15:50');
    expect(placements.get('a1')?.anchorTaskId).toBe('a1');
    expect(placements.get('b1')?.anchorTaskId).toBe('b1');
  });
});

// ── Test 5 — Defence-in-depth: multi-anchor-in-chain → earliest wins ─────────

describe('Test 5 — Defence-in-depth: corrupt board with two anchors in one chain', () => {
  it('earliest scheduledFor wins; later anchor is ignored', () => {
    _taskSeq = 0;
    const todoId = 'todo-corrupt';
    // Both t1 and t3 anchored — illegal per ADR 0003 §1 invariant. The
    // selector defends by picking the earliest anchor (t1 at 10:00) and
    // ignoring t3 at 16:00. (Load-time migration heals on next open.)
    const t1 = makeTaskNode('t1', todoId, 25, { scheduledFor: '2026-05-20T10:00' });
    const t2 = makeTaskNode('t2', todoId, 25);
    const t3 = makeTaskNode('t3', todoId, 25, { scheduledFor: '2026-05-20T16:00' });
    const board = makeBoard(
      [makeTodoNode(todoId), t1, t2, t3],
      [makeEdge('t1', 't2'), makeEdge('t2', 't3')],
    );

    const { placements } = selectSchedule(board);
    // Earliest anchor wins → t1 anchor, t2 cascades to 10:25, t3 cascades to 10:50.
    expect(placements.size).toBe(3);
    expect(placements.get('t1')?.startISO).toBe('2026-05-20T10:00');
    expect(placements.get('t1')?.isAnchor).toBe(true);
    expect(placements.get('t3')?.startISO).toBe('2026-05-20T10:50');
    expect(placements.get('t3')?.isAnchor).toBe(false);
    expect(placements.get('t3')?.anchorTaskId).toBe('t1');
  });
});

// ── Test 6 — Breaks invisible (math uses plannedMin only) ───────────────────

describe('Test 6 — Breaks are invisible to calendar', () => {
  it('successor starts at predecessor.end (no break gap)', () => {
    _taskSeq = 0;
    const todoId = 'todo-breaks';
    // Pomo config has shortBreakMin: 5 — ClockNode would insert 5min gap;
    // scheduleSelector must NOT. t2.start == t1.start + t1.plannedMin exactly.
    const t1 = makeTaskNode('t1', todoId, 25, { scheduledFor: '2026-05-20T10:00' });
    const t2 = makeTaskNode('t2', todoId, 25);
    const board = makeBoard(
      [makeTodoNode(todoId), t1, t2],
      [makeEdge('t1', 't2')],
    );

    const { placements } = selectSchedule(board);
    expect(placements.get('t2')?.startISO).toBe('2026-05-20T10:25');
  });
});

// ── Test 7 — Anchor's scheduledDurationMin override applies to anchor only ─

describe('Test 7 — scheduledDurationMin override on anchor', () => {
  it('anchor endISO uses override; successor still uses anchor.plannedMin offset', () => {
    _taskSeq = 0;
    const todoId = 'todo-override';
    const t1 = makeTaskNode('t1', todoId, 25, {
      scheduledFor: '2026-05-20T10:00',
      scheduledDurationMin: 45, // anchor block visually spans 45 min
    });
    const t2 = makeTaskNode('t2', todoId, 25);
    const board = makeBoard(
      [makeTodoNode(todoId), t1, t2],
      [makeEdge('t1', 't2')],
    );

    const { placements } = selectSchedule(board);
    // Anchor block visually spans 45 min via override.
    expect(placements.get('t1')?.endISO).toBe('2026-05-20T10:45');
    // ADR 0003 §3.7: successor start uses plannedMin offset (25), not override.
    expect(placements.get('t2')?.startISO).toBe('2026-05-20T10:25');
  });
});

// ── Test 8 — selectScheduledTasksForRange filters by [from, to) ────────────

describe('Test 8 — selectScheduledTasksForRange', () => {
  it('returns only placements intersecting [from, to)', () => {
    _taskSeq = 0;
    const todoId = 'todo-range';
    const t1 = makeTaskNode('t1', todoId, 25, { scheduledFor: '2026-05-18T08:00' });
    const t2 = makeTaskNode('t2', todoId, 25);
    const t3 = makeTaskNode('t3', todoId, 25);
    const board = makeBoard(
      [makeTodoNode(todoId), t1, t2, t3],
      [makeEdge('t1', 't2'), makeEdge('t2', 't3')],
    );

    // Range covering Mon-Tue only.
    const inRange = selectScheduledTasksForRange(
      board,
      '2026-05-18T00:00',
      '2026-05-19T00:00',
    );
    expect(inRange.map((p) => p.taskId).sort()).toEqual(['t1', 't2', 't3']);

    // Range covering a day with no placements.
    const outRange = selectScheduledTasksForRange(
      board,
      '2026-05-25T00:00',
      '2026-05-26T00:00',
    );
    expect(outRange).toHaveLength(0);
  });
});

// ── Test 9 — Memoization on (nodes, edges) reference identity ─────────────

describe('Test 9 — Reference-identity memoization', () => {
  it('returns the same placements Map when nodes+edges are unchanged', () => {
    _taskSeq = 0;
    const todoId = 'todo-memo';
    const t1 = makeTaskNode('t1', todoId, 25, { scheduledFor: '2026-05-20T10:00' });
    const board = makeBoard([makeTodoNode(todoId), t1]);
    const a = selectSchedule(board);
    const b = selectSchedule(board);
    expect(a.placements).toBe(b.placements);
  });
});

// ── Test 10 — No anchors → empty placements ────────────────────────────────

describe('Test 10 — No scheduled tasks → empty placement map', () => {
  it('returns empty map when nothing is anchored', () => {
    _taskSeq = 0;
    const todoId = 'todo-empty';
    const t1 = makeTaskNode('t1', todoId, 25);
    const t2 = makeTaskNode('t2', todoId, 25);
    const board = makeBoard(
      [makeTodoNode(todoId), t1, t2],
      [makeEdge('t1', 't2')],
    );

    const { placements } = selectSchedule(board);
    expect(placements.size).toBe(0);
  });
});
