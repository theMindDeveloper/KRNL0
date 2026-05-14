/**
 * Timeline selector unit tests — Decision 24
 *
 * Covers Q9 items 1-12. All tests call selectTimelines(board) directly with
 * synthesized Board objects. No store mounting required — the module-level
 * cache is invalidated naturally by passing fresh Board objects (new node/edge
 * array references on each fixture).
 */

import { describe, it, expect } from 'vitest';
import { selectTimelines, selectTimeline } from '../../../src/renderer/store/timelineSelector';
import type { Board } from '../../../src/shared/types';
import type { Node } from '../../../src/shared/types/node';
import type { Edge } from '../../../src/shared/types/edge';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';
import type { PomoConfig } from '../../../src/renderer/components/nodes/PomoNode/types';

// ── Fixture helpers ───────────────────────────────────────────────────────────

let _seq = 0;
function uid(): string {
  return `node-${++_seq}`;
}

function makeBoard(
  nodes: Node[],
  edges: Edge[] = [],
  pomoCfg?: Partial<PomoConfig>,
): Board {
  const defaultCfg: PomoConfig = {
    sessionMin: 25,
    shortBreakMin: 5,
    longBreakMin: 15,
    longBreakEvery: 4,
    ...pomoCfg,
  };
  const pomoNode: Node = {
    id: 'mother-pomo',
    kind: 'pomo',
    position: { x: 0, y: 0 },
    isMother: true,
    state: {},
    config: defaultCfg,
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

// ── Test 1 — Linear chain, 3 tasks ───────────────────────────────────────────

describe('Test 1 — Linear chain (10/20/40 min, short=5, long=15, every=4)', () => {
  it('produces 6 segments: 3 task + 3 short break, totalMin=85', () => {
    _taskSeq = 0;
    const todoId = 'todo-linear';
    const t1 = makeTaskNode('t1', todoId, 10);
    const t2 = makeTaskNode('t2', todoId, 20);
    const t3 = makeTaskNode('t3', todoId, 40);
    const board = makeBoard(
      [makeTodoNode(todoId), t1, t2, t3],
      [makeEdge('t1', 't2'), makeEdge('t2', 't3')],
      { shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4 },
    );

    const timeline = selectTimeline(board, todoId);
    expect(timeline).not.toBeNull();
    expect(timeline!.segments).toHaveLength(6);

    const tasks = timeline!.segments.filter((s) => s.kind === 'task');
    const breaks = timeline!.segments.filter((s) => s.kind === 'break');
    expect(tasks).toHaveLength(3);
    expect(breaks).toHaveLength(3);

    // All breaks are short (counter 1, 2, 3; none hit %4===0)
    for (const b of breaks) {
      expect(b.kind).toBe('break');
      if (b.kind === 'break') {
        expect(b.breakKind).toBe('short');
        expect(b.endMin - b.startMin).toBe(5);
      }
    }

    // totalMin = 10 + 5 + 20 + 5 + 40 + 5 = 85
    expect(timeline!.totalMin).toBe(85);
  });

  it('assigns consecutive color tokens in chain order', () => {
    _taskSeq = 0;
    const todoId = 'todo-color';
    const t1 = makeTaskNode('ta1', todoId, 10);
    const t2 = makeTaskNode('ta2', todoId, 20);
    const t3 = makeTaskNode('ta3', todoId, 40);
    const board = makeBoard(
      [makeTodoNode(todoId), t1, t2, t3],
      [makeEdge('ta1', 'ta2'), makeEdge('ta2', 'ta3')],
    );

    const timeline = selectTimeline(board, todoId);
    const taskSegs = timeline!.segments.filter((s) => s.kind === 'task');
    expect(taskSegs[0]?.kind === 'task' && taskSegs[0].colorToken).toBe('rose');
    expect(taskSegs[1]?.kind === 'task' && taskSegs[1].colorToken).toBe('sky');
    expect(taskSegs[2]?.kind === 'task' && taskSegs[2].colorToken).toBe('mint');
  });
});

// ── Test 2 — Long break cadence ───────────────────────────────────────────────

describe('Test 2 — Long break cadence (4 tasks × 25 min, every=4)', () => {
  it('produces breaks [short, short, short, long], totalMin=130', () => {
    _taskSeq = 0;
    const todoId = 'todo-longbreak';
    const t1 = makeTaskNode('lb1', todoId, 25);
    const t2 = makeTaskNode('lb2', todoId, 25);
    const t3 = makeTaskNode('lb3', todoId, 25);
    const t4 = makeTaskNode('lb4', todoId, 25);
    const board = makeBoard(
      [makeTodoNode(todoId), t1, t2, t3, t4],
      [makeEdge('lb1', 'lb2'), makeEdge('lb2', 'lb3'), makeEdge('lb3', 'lb4')],
      { shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4 },
    );

    const timeline = selectTimeline(board, todoId);
    expect(timeline).not.toBeNull();

    const breaks = timeline!.segments.filter((s) => s.kind === 'break');
    expect(breaks).toHaveLength(4);

    const breakKinds = breaks.map((b) => (b.kind === 'break' ? b.breakKind : null));
    expect(breakKinds).toEqual(['short', 'short', 'short', 'long']);

    // totalMin = 25*4 + 5*3 + 15 = 130
    expect(timeline!.totalMin).toBe(130);
  });
});

// ── Test 3 — Parallel fork (A → [B, C] → D) ─────────────────────────────────

describe('Test 3 — Parallel fork (A→[B,C]→D, plannedMin [10,20,30,5])', () => {
  it('B and C share parallelGroupId and startMin; group endMin = max(B,C)', () => {
    _taskSeq = 0;
    const todoId = 'todo-parallel';
    // A=10, B=20, C=30, D=5. Fork after A, convergence at D.
    const tA = makeTaskNode('pA', todoId, 10);
    const tB = makeTaskNode('pB', todoId, 20);
    const tC = makeTaskNode('pC', todoId, 30);
    const tD = makeTaskNode('pD', todoId, 5);
    const board = makeBoard(
      [makeTodoNode(todoId), tA, tB, tC, tD],
      [
        makeEdge('pA', 'pB'),
        makeEdge('pA', 'pC'),
        makeEdge('pB', 'pD'),
        makeEdge('pC', 'pD'),
      ],
      { shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4 },
    );

    const timeline = selectTimeline(board, todoId);
    expect(timeline).not.toBeNull();

    const taskSegs = timeline!.segments.filter((s) => s.kind === 'task');
    const segA = taskSegs.find((s) => s.kind === 'task' && s.taskId === 'pA');
    const segB = taskSegs.find((s) => s.kind === 'task' && s.taskId === 'pB');
    const segC = taskSegs.find((s) => s.kind === 'task' && s.taskId === 'pC');
    const segD = taskSegs.find((s) => s.kind === 'task' && s.taskId === 'pD');

    expect(segA).toBeDefined();
    expect(segB).toBeDefined();
    expect(segC).toBeDefined();
    expect(segD).toBeDefined();

    // A: [0, 10)
    if (segA?.kind === 'task') {
      expect(segA.startMin).toBe(0);
      expect(segA.endMin).toBe(10);
      expect(segA.parallelGroupId).toBeNull();
    }

    // B and C share the same parallelGroupId and the same startMin
    if (segB?.kind === 'task' && segC?.kind === 'task') {
      expect(segB.parallelGroupId).not.toBeNull();
      expect(segC.parallelGroupId).not.toBeNull();
      expect(segB.parallelGroupId).toBe(segC.parallelGroupId);
      expect(segB.startMin).toBe(segC.startMin);
    }

    // After A's break (5 min): group starts at 15
    if (segB?.kind === 'task') {
      expect(segB.startMin).toBe(15);
      expect(segB.endMin).toBe(35); // 15 + 20
    }
    if (segC?.kind === 'task') {
      expect(segC.startMin).toBe(15);
      expect(segC.endMin).toBe(45); // 15 + 30
    }

    // ParallelGroup endMin = max(35, 45) = 45
    const groupId = segB?.kind === 'task' ? segB.parallelGroupId : null;
    if (groupId) {
      const pg = timeline!.parallelGroups.get(groupId);
      expect(pg).toBeDefined();
      expect(pg?.endMin).toBe(45);
    }

    // One break after A, one break after the group (group = 1 counter unit).
    const breaks = timeline!.segments.filter((s) => s.kind === 'break');
    expect(breaks).toHaveLength(3); // after A, after group, after D

    // D starts after group endMin (45) + break (5) = 50
    if (segD?.kind === 'task') {
      expect(segD.startMin).toBe(50);
      expect(segD.endMin).toBe(55);
      expect(segD.parallelGroupId).toBeNull();
    }
  });
});

// ── Test 4 — Convergence: (A, B) → C ─────────────────────────────────────────

describe('Test 4 — Convergence: A and B both link to C', () => {
  it('emits A and B as a parallel group with same startMin, then one break, then C once', () => {
    _taskSeq = 0;
    const todoId = 'todo-converge';
    const tA = makeTaskNode('cvA', todoId, 20);
    const tB = makeTaskNode('cvB', todoId, 10);
    const tC = makeTaskNode('cvC', todoId, 15);
    // Two roots: A and B, both with task.next → C
    const board = makeBoard(
      [makeTodoNode(todoId), tA, tB, tC],
      [makeEdge('cvA', 'cvC'), makeEdge('cvB', 'cvC')],
      { shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4 },
    );

    const timeline = selectTimeline(board, todoId);
    expect(timeline).not.toBeNull();

    const taskSegs = timeline!.segments.filter((s) => s.kind === 'task');
    // A, B, C all present
    expect(taskSegs.some((s) => s.kind === 'task' && s.taskId === 'cvA')).toBe(true);
    expect(taskSegs.some((s) => s.kind === 'task' && s.taskId === 'cvB')).toBe(true);
    expect(taskSegs.some((s) => s.kind === 'task' && s.taskId === 'cvC')).toBe(true);

    // C should appear exactly once (not double-counted)
    const cSegs = taskSegs.filter((s) => s.kind === 'task' && s.taskId === 'cvC');
    expect(cSegs).toHaveLength(1);

    // A and B are parallel: same parallelGroupId, same startMin (at 0, no predecessor)
    const segA = taskSegs.find((s) => s.kind === 'task' && s.taskId === 'cvA');
    const segB = taskSegs.find((s) => s.kind === 'task' && s.taskId === 'cvB');
    if (segA?.kind === 'task' && segB?.kind === 'task') {
      expect(segA.parallelGroupId).not.toBeNull();
      expect(segB.parallelGroupId).not.toBeNull();
      expect(segA.parallelGroupId).toBe(segB.parallelGroupId);
      expect(segA.startMin).toBe(segB.startMin);
      expect(segA.startMin).toBe(0);
    }

    // Group endMin = max(A=20, B=10) = 20. C starts after group + break (5) = 25.
    const segC = taskSegs.find((s) => s.kind === 'task' && s.taskId === 'cvC');
    if (segC?.kind === 'task') {
      expect(segC.startMin).toBe(25); // 20 (group end) + 5 (short break)
    }
  });
});

// ── Test 5 — Done tasks consume slot ─────────────────────────────────────────

describe('Test 5 — Done tasks still consume their plannedMin slot', () => {
  it('done task has done=true and correct endMin', () => {
    _taskSeq = 0;
    const todoId = 'todo-done';
    const t1 = makeTaskNode('d1', todoId, 30, { done: true });
    const t2 = makeTaskNode('d2', todoId, 20);
    const board = makeBoard(
      [makeTodoNode(todoId), t1, t2],
      [makeEdge('d1', 'd2')],
    );

    const timeline = selectTimeline(board, todoId);
    const seg1 = timeline!.segments.find((s) => s.kind === 'task' && s.taskId === 'd1');
    const seg2 = timeline!.segments.find((s) => s.kind === 'task' && s.taskId === 'd2');

    expect(seg1?.kind === 'task' && seg1.done).toBe(true);
    // Done task consumes full 30 min
    expect(seg1?.kind === 'task' && seg1.endMin).toBe(30);

    // t2 starts after t1 (30) + break (5) = 35
    expect(seg2?.kind === 'task' && seg2.startMin).toBe(35);
    expect(seg2?.kind === 'task' && seg2.done).toBe(false);
  });
});

// ── Test 6 — Subtasks excluded ───────────────────────────────────────────────

describe('Test 6 — Subtasks (parentTaskId !== null) are not timeline segments', () => {
  it('does not include a subtask as a segment', () => {
    _taskSeq = 0;
    const todoId = 'todo-subtask';
    const root = makeTaskNode('stRoot', todoId, 40);
    const sub = makeTaskNode('stSub', todoId, 15, { parentTaskId: 'stRoot' });
    const board = makeBoard([makeTodoNode(todoId), root, sub]);

    const timeline = selectTimeline(board, todoId);
    const taskSegs = timeline!.segments.filter((s) => s.kind === 'task');

    // Only root appears
    expect(taskSegs).toHaveLength(1);
    expect(taskSegs[0]?.kind === 'task' && taskSegs[0].taskId).toBe('stRoot');
    // Subtask is NOT a segment
    expect(taskSegs.some((s) => s.kind === 'task' && s.taskId === 'stSub')).toBe(false);
  });
});

// ── Test 7 — Memoization ─────────────────────────────────────────────────────

describe('Test 7 — Memoization: same inputs → same Map reference', () => {
  it('returns identical Map reference on back-to-back calls', () => {
    _taskSeq = 0;
    const todoId = 'todo-memo';
    const t1 = makeTaskNode('m1', todoId, 25);
    const board = makeBoard([makeTodoNode(todoId), t1]);

    const first = selectTimelines(board);
    const second = selectTimelines(board);
    // Exact same reference — memoization works
    expect(first).toBe(second);
  });

  it('returns a different Map reference after any node mutation', () => {
    _taskSeq = 0;
    const todoId = 'todo-memo2';
    const t1 = makeTaskNode('mm1', todoId, 25);
    const board1 = makeBoard([makeTodoNode(todoId), t1]);
    const first = selectTimelines(board1);

    // Simulate Zustand updateNode: new nodes array reference
    const mutatedNode = { ...t1, state: { ...(t1.state as TaskState), plannedMin: 40 } };
    const board2: Board = {
      ...board1,
      nodes: board1.nodes.map((n) => (n.id === t1.id ? mutatedNode : n)),
    };
    const second = selectTimelines(board2);

    expect(second).not.toBe(first);
  });
});

// ── Test 8 — Pomo config reactivity ──────────────────────────────────────────

describe('Test 8 — Pomo config reactivity', () => {
  it('changing shortBreakMin produces longer break segments', () => {
    _taskSeq = 0;
    const todoId = 'todo-cfg';
    const t1 = makeTaskNode('cfg1', todoId, 25);
    const t2 = makeTaskNode('cfg2', todoId, 25);
    const board5 = makeBoard(
      [makeTodoNode(todoId), t1, t2],
      [makeEdge('cfg1', 'cfg2')],
      { shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4 },
    );
    const timeline5 = selectTimeline(board5, todoId);
    const breaks5 = timeline5!.segments.filter((s) => s.kind === 'break');
    const firstBreak5 = breaks5[0];
    expect(firstBreak5?.kind === 'break' && firstBreak5.endMin - firstBreak5.startMin).toBe(5);

    // New board with different cfg (new nodes array → invalidates memo)
    const board10 = makeBoard(
      [makeTodoNode(todoId), t1, t2],
      [makeEdge('cfg1', 'cfg2')],
      { shortBreakMin: 10, longBreakMin: 15, longBreakEvery: 4 },
    );
    const timeline10 = selectTimeline(board10, todoId);
    const breaks10 = timeline10!.segments.filter((s) => s.kind === 'break');
    const firstBreak10 = breaks10[0];
    expect(firstBreak10?.kind === 'break' && firstBreak10.endMin - firstBreak10.startMin).toBe(10);
  });
});

// ── Test 9 — Empty todo ───────────────────────────────────────────────────────

describe('Test 9 — Empty todo (no tasks)', () => {
  it('produces a Timeline with empty segments and totalMin=0', () => {
    _taskSeq = 0;
    const todoId = 'todo-empty';
    const board = makeBoard([makeTodoNode(todoId)]);

    const timeline = selectTimeline(board, todoId);
    expect(timeline).not.toBeNull();
    expect(timeline!.segments).toHaveLength(0);
    expect(timeline!.totalMin).toBe(0);
  });
});

// ── Test 10 — Cycle defence ───────────────────────────────────────────────────

describe('Test 10 — Cycle defence (A → B → A)', () => {
  it('terminates without infinite loop; both nodes appear at most once each', () => {
    _taskSeq = 0;
    const todoId = 'todo-cycle';
    const tA = makeTaskNode('cyA', todoId, 10);
    const tB = makeTaskNode('cyB', todoId, 10);
    const board = makeBoard(
      [makeTodoNode(todoId), tA, tB],
      [makeEdge('cyA', 'cyB'), makeEdge('cyB', 'cyA')],
    );

    // Should not hang. Just confirm it returns and each task appears at most once.
    const timeline = selectTimeline(board, todoId);
    const taskSegs = timeline!.segments.filter((s) => s.kind === 'task');
    const aCount = taskSegs.filter((s) => s.kind === 'task' && s.taskId === 'cyA').length;
    const bCount = taskSegs.filter((s) => s.kind === 'task' && s.taskId === 'cyB').length;
    expect(aCount).toBeLessThanOrEqual(1);
    expect(bCount).toBeLessThanOrEqual(1);
  });
});

// ── Test 11 — plannedMin === 0 coercion ───────────────────────────────────────

describe('Test 11 — plannedMin === 0 coerced to 1 minute', () => {
  it('task with plannedMin=0 gets a 1-minute segment', () => {
    _taskSeq = 0;
    const todoId = 'todo-zero';
    const t1 = makeTaskNode('z1', todoId, 0);
    const board = makeBoard([makeTodoNode(todoId), t1]);

    const timeline = selectTimeline(board, todoId);
    const seg = timeline!.segments.find((s) => s.kind === 'task' && s.taskId === 'z1');
    expect(seg?.kind === 'task' && seg.endMin - seg.startMin).toBe(1);
  });
});

// ── Test 12 — No pomo node, falls back to defaultPomoConfig ──────────────────

describe('Test 12 — No pomo node: uses defaultPomoConfig values', () => {
  it('still produces task and break segments using default pomo config', () => {
    _taskSeq = 0;
    const todoId = 'todo-nopomo';
    const t1 = makeTaskNode('np1', todoId, 25);
    const t2 = makeTaskNode('np2', todoId, 25);
    // Board without pomo node
    const board: Board = {
      version: 1,
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [makeTodoNode(todoId), t1, t2],
      edges: [makeEdge('np1', 'np2')],
    };

    const timeline = selectTimeline(board, todoId);
    expect(timeline).not.toBeNull();

    const taskSegs = timeline!.segments.filter((s) => s.kind === 'task');
    const breaks = timeline!.segments.filter((s) => s.kind === 'break');
    expect(taskSegs).toHaveLength(2);
    // defaultPomoConfig shortBreakMin=5, longBreakEvery=4 → 2 short breaks
    expect(breaks).toHaveLength(2);
    if (breaks[0]?.kind === 'break') {
      expect(breaks[0].endMin - breaks[0].startMin).toBe(5);
    }
  });
});
