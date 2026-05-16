/**
 * Decision 28 §10.3 — Schedule selector break-aware tests.
 *
 * Covers:
 *   1. Focus chain: total end-time exceeds event chain by expected break overhead.
 *   2. placement.breakdown non-null for focus, null for event.
 *   3. scheduledDurationMin treated as work-time override under focus.
 *   4. scheduledDurationMin treated as total-time override under event.
 *   5. pomoConfig cache key: reference-identity invalidation.
 */

import { describe, it, expect } from 'vitest';
import {
  selectSchedule,
} from '../../../src/renderer/store/scheduleSelector';
import type { Board } from '../../../src/shared/types';
import type { Node } from '../../../src/shared/types/node';
import type { Edge } from '../../../src/shared/types/edge';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';
import type { PomoConfig } from '../../../src/renderer/components/nodes/PomoNode/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

let _seq = 0;

function makePomoNode(cfg: Partial<PomoConfig> = {}): Node {
  return {
    id: 'mother-pomo',
    kind: 'pomo',
    position: { x: 0, y: 0 },
    isMother: true,
    state: {},
    config: {
      sessionMin: 25,
      shortBreakMin: 5,
      longBreakMin: 15,
      longBreakEvery: 4,
      ...cfg,
    },
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
  overrides: Partial<TaskState> = {},
): Node {
  _seq++;
  const state: TaskState = {
    text: `Task ${id}`,
    done: false,
    durationMin: 25,
    eta: '~25 min',
    sequenceNumber: _seq,
    layer: 0,
    createdAt: new Date().toISOString(),
    parentTodoId: todoId,
    parentTaskId: null,
    todoItemId: `item-${id}`,
    pomoSessionsCompleted: 0,
    plannedMin: 25,
    secondsAccumulated: 0,
    currentSessionElapsedSec: 0,
    kind: 'focus',
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

function makeBoard(nodes: Node[], edges: Edge[] = []): Board {
  return {
    version: 1,
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes,
    edges,
  };
}

function isoToMs(iso: string): number {
  return new Date(iso).getTime();
}

// ── Test 1 — Focus vs event total end time ────────────────────────────────────

describe('Decision 28 — focus chain has more total time than event chain', () => {
  it('3-task focus chain exceeds event chain by expected break overhead', () => {
    _seq = 0;
    const todoId = 'todo-d28-1';
    const anchor = '2026-05-20T10:00';

    // Focus chain: 3 tasks × 25 min = 75 min work.
    // breakdownPomoTime(75, 0, {25/5/15/4}):
    //   session1(25) + short(5) + session2(25) + short(5) + session3(25)
    //   = 75 work + 10 break = 85 effective per task.
    // But these are 3 tasks in sequence — each is individually 25 min (1 session).
    // breakdownPomoTime(25, 0, cfg) = 25 work + 0 break = 25 effective.
    // So 3 × 25 = 75 total — same as events.
    // To get break overhead, use tasks > sessionMin, e.g. plannedMin=75.

    const focusT1 = makeTaskNode('f1', todoId, {
      plannedMin: 75,
      scheduledFor: anchor,
      kind: 'focus',
    });
    const focusT2 = makeTaskNode('f2', todoId, {
      plannedMin: 25,
      kind: 'focus',
    });
    const focusT3 = makeTaskNode('f3', todoId, {
      plannedMin: 25,
      kind: 'focus',
    });

    // Event chain: same plannedMins but kind=event.
    const eventT1 = makeTaskNode('e1', todoId + 'e', {
      plannedMin: 75,
      scheduledFor: anchor,
      kind: 'event',
    });
    const eventT2 = makeTaskNode('e2', todoId + 'e', {
      plannedMin: 25,
      kind: 'event',
    });
    const eventT3 = makeTaskNode('e3', todoId + 'e', {
      plannedMin: 25,
      kind: 'event',
    });

    const board = makeBoard(
      [
        makePomoNode(),
        makeTodoNode(todoId),
        makeTodoNode(todoId + 'e'),
        focusT1, focusT2, focusT3,
        eventT1, eventT2, eventT3,
      ],
      [
        makeEdge('f1', 'f2'), makeEdge('f2', 'f3'),
        makeEdge('e1', 'e2'), makeEdge('e2', 'e3'),
      ],
    );

    const { placements } = selectSchedule(board);

    const focusEnd = isoToMs(placements.get('f3')!.endISO);
    const eventEnd = isoToMs(placements.get('e3')!.endISO);

    // Focus chain: f1 = breakdownPomoTime(75,0,cfg) = 85 effective
    //   f2 = 25 (1 session), f3 = 25 (1 session)
    // f1 takes 85 min, then f2 at anchor+85 for 25, then f3 at anchor+110 for 25.
    // End of f3 = anchor + 135 min.
    // Event chain: e1=75, e2=25, e3=25. End = anchor + 125 min.
    // Difference = 10 min (the 2 short breaks in f1).
    const diffMin = (focusEnd - eventEnd) / 60_000;
    expect(diffMin).toBe(10); // 2 × 5-min short breaks from the 75-min focus task

    // Verify breakdown presence
    expect(placements.get('f1')!.breakdown).not.toBeNull();
    expect(placements.get('f2')!.breakdown).not.toBeNull();
    expect(placements.get('e1')!.breakdown).toBeNull();
    expect(placements.get('e3')!.breakdown).toBeNull();
  });
});

// ── Test 2 — breakdown fields ─────────────────────────────────────────────────

describe('Decision 28 — breakdown fields on placements', () => {
  it('focus task with 75 min: breakdown has workMin=75, breakMin=10', () => {
    _seq = 0;
    const todoId = 'todo-d28-2';
    const t1 = makeTaskNode('t1', todoId, {
      plannedMin: 75,
      scheduledFor: '2026-05-20T10:00',
      kind: 'focus',
    });
    const board = makeBoard([makePomoNode(), makeTodoNode(todoId), t1]);
    const { placements } = selectSchedule(board);
    const p = placements.get('t1')!;
    expect(p.breakdown).not.toBeNull();
    expect(p.breakdown!.workMin).toBe(75);
    expect(p.breakdown!.breakMin).toBe(10);
    expect(p.breakdown!.effectiveMin).toBe(85);
  });

  it('focus task with 25 min (1 session): breakdown.breakMin === 0', () => {
    _seq = 0;
    const todoId = 'todo-d28-3';
    const t1 = makeTaskNode('t1', todoId, {
      plannedMin: 25,
      scheduledFor: '2026-05-20T10:00',
      kind: 'focus',
    });
    const board = makeBoard([makePomoNode(), makeTodoNode(todoId), t1]);
    const { placements } = selectSchedule(board);
    const p = placements.get('t1')!;
    expect(p.breakdown).not.toBeNull();
    expect(p.breakdown!.breakMin).toBe(0);
    expect(p.kind).toBe('focus');
  });

  it('event task: breakdown is null', () => {
    _seq = 0;
    const todoId = 'todo-d28-4';
    const t1 = makeTaskNode('t1', todoId, {
      plannedMin: 75,
      scheduledFor: '2026-05-20T10:00',
      kind: 'event',
    });
    const board = makeBoard([makePomoNode(), makeTodoNode(todoId), t1]);
    const { placements } = selectSchedule(board);
    const p = placements.get('t1')!;
    expect(p.breakdown).toBeNull();
    expect(p.kind).toBe('event');
    // Event: block = 75 min exactly, no break expansion.
    const startMs = isoToMs(p.startISO);
    const endMs = isoToMs(p.endISO);
    expect((endMs - startMs) / 60_000).toBe(75);
  });
});

// ── Test 3 — scheduledDurationMin as work-time override under focus ───────────

describe('Decision 28 — scheduledDurationMin override semantics', () => {
  it('focus anchor with scheduledDurationMin=75: block expands to effectiveMin (85)', () => {
    _seq = 0;
    const todoId = 'todo-d28-5';
    const t1 = makeTaskNode('t1', todoId, {
      plannedMin: 50, // would be 55 effective without override
      scheduledFor: '2026-05-20T10:00',
      scheduledDurationMin: 75, // work-time override → 85 effective
      kind: 'focus',
    });
    const board = makeBoard([makePomoNode(), makeTodoNode(todoId), t1]);
    const { placements } = selectSchedule(board);
    const p = placements.get('t1')!;
    // 75 min work = 3×25 sessions = 2 short breaks = 85 effective.
    expect(p.breakdown!.workMin).toBe(75);
    expect(p.breakdown!.breakMin).toBe(10);
    const blockMin = (isoToMs(p.endISO) - isoToMs(p.startISO)) / 60_000;
    expect(blockMin).toBe(85);
  });

  it('event anchor with scheduledDurationMin=75: block = exactly 75 (no breaks)', () => {
    _seq = 0;
    const todoId = 'todo-d28-6';
    const t1 = makeTaskNode('t1', todoId, {
      plannedMin: 50,
      scheduledFor: '2026-05-20T10:00',
      scheduledDurationMin: 75,
      kind: 'event',
    });
    const board = makeBoard([makePomoNode(), makeTodoNode(todoId), t1]);
    const { placements } = selectSchedule(board);
    const p = placements.get('t1')!;
    const blockMin = (isoToMs(p.endISO) - isoToMs(p.startISO)) / 60_000;
    expect(blockMin).toBe(75); // no break expansion
    expect(p.breakdown).toBeNull();
  });
});

// ── Test 4 — pomoConfig cache key invalidation ────────────────────────────────

describe('Decision 28 — cache key includes pomoConfig reference', () => {
  it('same nodes+edges but new pomoNode config reference → recomputes', () => {
    _seq = 0;
    const todoId = 'todo-d28-7';
    const t1 = makeTaskNode('t1', todoId, {
      plannedMin: 75,
      scheduledFor: '2026-05-20T10:00',
      kind: 'focus',
    });

    const board1 = makeBoard(
      [makePomoNode({ sessionMin: 25 }), makeTodoNode(todoId), t1],
    );
    const result1 = selectSchedule(board1);
    const end1 = result1.placements.get('t1')!.endISO;

    // Build a new board with a different pomoNode config object
    // (new reference identity, even if sessionMin=25 is same value).
    const board2: Board = {
      ...board1,
      nodes: [
        makePomoNode({ sessionMin: 50 }), // different sessionMin
        makeTodoNode(todoId),
        t1,
      ],
    };
    const result2 = selectSchedule(board2);
    const end2 = result2.placements.get('t1')!.endISO;

    // With sessionMin=50, a 75-min task is 1 session + 1 session (25 left)
    // → 50+25=75 work + 1 short break = 80 effective.
    // With sessionMin=25, 75-min = 3 sessions + 2 short breaks = 85 effective.
    expect(end1).not.toBe(end2);
  });
});
