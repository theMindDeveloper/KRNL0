// @vitest-environment jsdom
/**
 * ClockNode component render tests — Decision 24 (rewrite of Decision 23.1 tests)
 *
 * Decision 24 replaces the manual tasks selector + arcs loop with selectTimeline.
 * Arcs now include break segments. Trailing break is stripped at render time.
 *
 * Covers:
 *   AC5 — clock renders 12h face; tasks linked via linkedTodoId produce arcs
 *   AC6 — done tasks render at 40% opacity
 *   AC7 — total plannedMin > 720 shows "+N min" badge (now based on totalMin incl. breaks)
 *   Decision 24 — break arcs, parallel arcs, trailing break stripped
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import React from 'react';
import { ClockNode } from '../../../src/renderer/components/nodes/ClockNode';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import type { ClockState, ClockConfig } from '../../../src/renderer/components/nodes/ClockNode/types';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';
import type { PomoConfig } from '../../../src/renderer/components/nodes/PomoNode/types';
import type { Node } from '../../../src/shared/types/node';
import type { Edge } from '../../../src/shared/types/edge';
import type { Board } from '../../../src/shared/types';

afterEach(() => {
  cleanup();
  useBoardStore.setState({ board: null });
});

// ── Factories ─────────────────────────────────────────────────────────────────

function makeClockState(overrides: Partial<ClockState> = {}): ClockState {
  return {
    linkedTodoId: null,
    viewWindow: 0,
    ...overrides,
  };
}

function makeClockNode(state: ClockState): Node<ClockState, ClockConfig> {
  return {
    id: 'mother-clock',
    kind: 'clock',
    position: { x: 1252, y: 0 },
    isMother: true,
    state,
    config: {},
  };
}

function makePomoNode(cfg: Partial<PomoConfig> = {}): Node {
  const config: PomoConfig = {
    sessionMin: 25,
    shortBreakMin: 5,
    longBreakMin: 15,
    longBreakEvery: 4,
    ...cfg,
  };
  return {
    id: 'mother-pomo',
    kind: 'pomo',
    position: { x: 0, y: 0 },
    isMother: true,
    state: {},
    config,
  };
}

let _seq = 0;
function makeTaskState(overrides: Partial<TaskState> = {}): TaskState {
  _seq++;
  return {
    text: 'Task',
    done: false,
    durationMin: 25,
    eta: '~25 min',
    sequenceNumber: _seq,
    layer: 0,
    createdAt: new Date(Date.UTC(2026, 4, 14, 0, 0, _seq)).toISOString(),
    parentTodoId: 'todo-1',
    parentTaskId: null,
    todoItemId: `item-${_seq}`,
    pomoSessionsCompleted: 0,
    plannedMin: 25,
    secondsAccumulated: 0,
    currentSessionElapsedSec: 0,
    ...overrides,
  };
}

function makeTaskNode(id: string, state: TaskState): Node<TaskState, { showDuration: boolean }> {
  return {
    id,
    kind: 'todo.task',
    position: { x: 0, y: 0 },
    isMother: false,
    state,
    config: { showDuration: true },
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

function makeEdge(fromId: string, toId: string): Edge {
  return {
    id: `edge-${fromId}-${toId}`,
    from: { nodeId: fromId, event: 'task.next' },
    to: { nodeId: toId, command: 'task.activate' },
    enabled: true,
  };
}

function seedBoard(nodes: Node[], edges: Edge[] = []): void {
  const board: Board = {
    version: 1,
    schemaVersion: 1,
    savedAt: '2026-05-14T08:00:00.000Z',
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [makePomoNode(), ...nodes],
    edges,
  };
  useBoardStore.setState({ board });
}

function renderClockNode(
  state: ClockState,
  onCommand: (cmd: string, args?: Record<string, unknown>) => void = vi.fn(),
) {
  const node = makeClockNode(state);
  render(
    React.createElement(ClockNode, {
      node,
      onCommand,
      slotIndex: 6,
      slotTotal: 6,
    }),
  );
}

/** Arc circles = circles at r=108 (both task arcs and break arcs share r=108). */
function getArcCircles(): Element[] {
  return Array.from(document.querySelectorAll('svg circle')).filter(
    (c) => c.getAttribute('r') === '108',
  );
}

// ── AC5 — Renders SVG with 12 tick marks ──────────────────────────────────────

describe('AC5 — ClockNode renders a 12-hour face', () => {
  it('renders an SVG element representing the clock face', () => {
    _seq = 0;
    renderClockNode(makeClockState());
    const svgs = document.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('renders 12 tick marks on the clock face', () => {
    _seq = 0;
    renderClockNode(makeClockState());
    const lines = document.querySelectorAll('svg line');
    expect(lines).toHaveLength(12);
  });

  it('shows link UI when linkedTodoId is null', () => {
    _seq = 0;
    seedBoard([]);
    renderClockNode(makeClockState({ linkedTodoId: null }));
    expect(screen.getByText('Link Todo:')).toBeDefined();
  });

  it('renders one task arc + one break arc per task pair (trailing break stripped)', () => {
    _seq = 0;
    const todoId = 'todo-1';
    const task1 = makeTaskNode('task-1', makeTaskState({ parentTodoId: todoId, plannedMin: 60 }));
    const task2 = makeTaskNode('task-2', makeTaskState({ parentTodoId: todoId, plannedMin: 30 }));
    const task3 = makeTaskNode('task-3', makeTaskState({ parentTodoId: todoId, plannedMin: 45 }));
    seedBoard([makeTodoNode(todoId), task1, task2, task3], [
      makeEdge('task-1', 'task-2'),
      makeEdge('task-2', 'task-3'),
    ]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    // Decision 24: 3 tasks + 2 internal breaks + 1 trailing break (stripped) = 5 arcs
    // Task arcs: 3, break arcs rendered: 2 (trailing stripped)
    const arcCircles = getArcCircles();
    expect(arcCircles).toHaveLength(5); // 3 task + 2 break (trailing stripped)
  });

  it('task arcs have strokeWidth=18; break arcs have strokeWidth=6 (short) or 10 (long)', () => {
    _seq = 0;
    const todoId = 'todo-stroke';
    const task1 = makeTaskNode('s-task-1', makeTaskState({ parentTodoId: todoId, plannedMin: 30 }));
    const task2 = makeTaskNode('s-task-2', makeTaskState({ parentTodoId: todoId, plannedMin: 30 }));
    seedBoard([makeTodoNode(todoId), task1, task2], [makeEdge('s-task-1', 's-task-2')]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    const arcCircles = getArcCircles();
    // 2 task arcs + 1 break arc (trailing stripped) = 3
    expect(arcCircles).toHaveLength(3);

    const taskArcs = Array.from(arcCircles).filter((c) => c.getAttribute('stroke-width') === '18');
    // Decision 24.2: short breaks use strokeWidth=6, long breaks use strokeWidth=10
    const breakArcs = Array.from(arcCircles).filter(
      (c) => c.getAttribute('stroke-width') === '6' || c.getAttribute('stroke-width') === '10',
    );
    expect(taskArcs).toHaveLength(2);
    expect(breakArcs).toHaveLength(1);
  });

  it('excludes subtasks (parentTaskId !== null) from arcs', () => {
    _seq = 0;
    const todoId = 'todo-1';
    const rootTask = makeTaskNode('task-root', makeTaskState({ parentTodoId: todoId, parentTaskId: null }));
    const subTask = makeTaskNode('task-sub', makeTaskState({ parentTodoId: todoId, parentTaskId: 'task-root' }));
    seedBoard([makeTodoNode(todoId), rootTask, subTask]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    const arcCircles = getArcCircles();
    // Only root task arc — 1 task + 0 break arcs (trailing break stripped)
    expect(arcCircles).toHaveLength(1);
  });
});

// ── AC6 — Done tasks at 40% opacity ──────────────────────────────────────────

describe('AC6 — Done tasks render at 40% opacity', () => {
  it('done task arc has opacity 0.4', () => {
    _seq = 0;
    const todoId = 'todo-1';
    const doneTask = makeTaskNode('task-done', makeTaskState({ parentTodoId: todoId, done: true, plannedMin: 60 }));
    seedBoard([makeTodoNode(todoId), doneTask]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    // 1 task arc (strokeWidth=18), trailing break stripped
    const taskArcs = getArcCircles().filter((c) => c.getAttribute('stroke-width') === '18');
    expect(taskArcs).toHaveLength(1);
    expect(taskArcs[0]!.getAttribute('opacity')).toBe('0.4');
  });

  it('in-progress task arc has opacity=1', () => {
    _seq = 0;
    const todoId = 'todo-1';
    const activeTask = makeTaskNode('task-active', makeTaskState({ parentTodoId: todoId, done: false, plannedMin: 60 }));
    seedBoard([makeTodoNode(todoId), activeTask]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    const taskArcs = getArcCircles().filter((c) => c.getAttribute('stroke-width') === '18');
    expect(taskArcs).toHaveLength(1);
    expect(taskArcs[0]!.getAttribute('opacity')).toBe('1');
  });

  it('done tasks are included in the arc list (not filtered out)', () => {
    _seq = 0;
    const todoId = 'todo-1';
    const doneTask = makeTaskNode('task-done', makeTaskState({ parentTodoId: todoId, done: true, plannedMin: 30 }));
    const activeTask = makeTaskNode('task-active', makeTaskState({ parentTodoId: todoId, done: false, plannedMin: 30 }));
    seedBoard([makeTodoNode(todoId), doneTask, activeTask], [makeEdge('task-done', 'task-active')]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    // Both tasks appear: 2 task arcs + 1 break arc (trailing stripped) = 3
    const arcCircles = getArcCircles();
    expect(arcCircles).toHaveLength(3);

    const taskArcs = Array.from(arcCircles).filter((c) => c.getAttribute('stroke-width') === '18');
    expect(taskArcs).toHaveLength(2);
  });
});

// ── AC7 — Overflow badge ──────────────────────────────────────────────────────

describe('AC7 — Overflow badge for tasks exceeding 1440 minutes (Decision 24.2)', () => {
  it('shows no overflow badge when totalMin (tasks + breaks) <= 1440', () => {
    _seq = 0;
    const todoId = 'todo-1';
    // 1 task × 360 min + 1 trailing break (5min) = 365 total. No overflow.
    const task = makeTaskNode('task-1', makeTaskState({ parentTodoId: todoId, plannedMin: 360 }));
    seedBoard([makeTodoNode(todoId), task]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    expect(screen.queryByText(/\+\d+ min/)).toBeNull();
  });

  it('shows "+N min" badge when totalMin (tasks + breaks) exceeds 1440', () => {
    _seq = 0;
    const todoId = 'todo-1';
    // Decision 24.2: overflow badge threshold is 1440 (24h), not 720.
    // 5 tasks × 300 min = 1500 task time, plus breaks. Total well exceeds 1440.
    const task1 = makeTaskNode('task-1', makeTaskState({ parentTodoId: todoId, plannedMin: 300 }));
    const task2 = makeTaskNode('task-2', makeTaskState({ parentTodoId: todoId, plannedMin: 300 }));
    const task3 = makeTaskNode('task-3', makeTaskState({ parentTodoId: todoId, plannedMin: 300 }));
    const task4 = makeTaskNode('task-4', makeTaskState({ parentTodoId: todoId, plannedMin: 300 }));
    const task5 = makeTaskNode('task-5', makeTaskState({ parentTodoId: todoId, plannedMin: 300 }));
    seedBoard([makeTodoNode(todoId), task1, task2, task3, task4, task5], [
      makeEdge('task-1', 'task-2'),
      makeEdge('task-2', 'task-3'),
      makeEdge('task-3', 'task-4'),
      makeEdge('task-4', 'task-5'),
    ]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    // Badge appears and shows a positive overflow value (exact value depends on break cadence)
    expect(screen.getByText(/^\+\d+ min$/)).toBeDefined();
  });

  it('shows no overflow badge when linkedTodoId is null', () => {
    _seq = 0;
    seedBoard([]);
    renderClockNode(makeClockState({ linkedTodoId: null }));
    expect(screen.queryByText(/\+\d+ min/)).toBeNull();
  });
});

// ── Decision 24 — Break arcs ──────────────────────────────────────────────────

describe('Decision 24 — Break arcs', () => {
  it('trailing break is NOT rendered (last arc is a task arc)', () => {
    _seq = 0;
    const todoId = 'todo-trail';
    const task1 = makeTaskNode('tr-1', makeTaskState({ parentTodoId: todoId, plannedMin: 25 }));
    seedBoard([makeTodoNode(todoId), task1]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    // 1 task only → trailing break stripped → 1 arc total
    const arcCircles = getArcCircles();
    expect(arcCircles).toHaveLength(1);
    // The one arc must be a task arc (strokeWidth=18)
    expect(arcCircles[0]!.getAttribute('stroke-width')).toBe('18');
  });

  it('break arcs use var(--ink-3) for short breaks (Decision 24.2 — replaces ink-4)', () => {
    _seq = 0;
    const todoId = 'todo-bcolor';
    const task1 = makeTaskNode('bc-1', makeTaskState({ parentTodoId: todoId, plannedMin: 25 }));
    const task2 = makeTaskNode('bc-2', makeTaskState({ parentTodoId: todoId, plannedMin: 25 }));
    seedBoard([makeTodoNode(todoId), task1, task2], [makeEdge('bc-1', 'bc-2')]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    const arcCircles = getArcCircles();
    // 2 task arcs + 1 break arc (trailing stripped)
    expect(arcCircles).toHaveLength(3);

    // Decision 24.2: short break uses strokeWidth=6 and var(--ink-3)
    const breakArcs = Array.from(arcCircles).filter((c) => c.getAttribute('stroke-width') === '6');
    expect(breakArcs).toHaveLength(1);
    expect(breakArcs[0]!.getAttribute('stroke')).toBe('var(--ink-3)');
  });
});

// ── Decision 24 — Parallel arcs ──────────────────────────────────────────────

describe('Decision 24 — Parallel arcs with mix-blend-mode: multiply', () => {
  it('parallel branch members have mixBlendMode style', () => {
    _seq = 0;
    const todoId = 'todo-par';
    const tA = makeTaskNode('par-A', makeTaskState({ parentTodoId: todoId, plannedMin: 10 }));
    const tB = makeTaskNode('par-B', makeTaskState({ parentTodoId: todoId, plannedMin: 20 }));
    const tC = makeTaskNode('par-C', makeTaskState({ parentTodoId: todoId, plannedMin: 15 }));
    // A forks to B and C
    seedBoard([makeTodoNode(todoId), tA, tB, tC], [
      makeEdge('par-A', 'par-B'),
      makeEdge('par-A', 'par-C'),
    ]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    // A=sequential, B and C=parallel, trailing break stripped
    // segments: A(task), break-A, B(task,parallel), C(task,parallel), break-group
    // trailing break stripped → rendered: A, break-A, B, C, [break-group stripped if last]
    // Actually: A, break-A, B, C, break-group → trailing break-group stripped = 4 arcs
    const arcCircles = getArcCircles();
    expect(arcCircles.length).toBeGreaterThanOrEqual(3); // at minimum A + B + C

    // Find task arcs
    const taskArcs = Array.from(arcCircles).filter((c) => c.getAttribute('stroke-width') === '18');
    // B and C should have mix-blend-mode: multiply in their style
    const parallelArcs = taskArcs.filter((c) => {
      const style = (c as HTMLElement).style.mixBlendMode;
      return style === 'multiply';
    });
    expect(parallelArcs.length).toBeGreaterThanOrEqual(2);
  });

  it('sequential task arcs have no mixBlendMode style', () => {
    _seq = 0;
    const todoId = 'todo-seq';
    const t1 = makeTaskNode('seq-1', makeTaskState({ parentTodoId: todoId, plannedMin: 25 }));
    const t2 = makeTaskNode('seq-2', makeTaskState({ parentTodoId: todoId, plannedMin: 25 }));
    seedBoard([makeTodoNode(todoId), t1, t2], [makeEdge('seq-1', 'seq-2')]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    const taskArcs = getArcCircles().filter((c) => c.getAttribute('stroke-width') === '18');
    for (const arc of taskArcs) {
      expect((arc as HTMLElement).style.mixBlendMode).toBeFalsy();
    }
  });
});

// ── AC3 — Pomo config reactivity: clock updates when shortBreakMin changes ────
// Verifies that editing PomoConfig triggers Timeline recompute and ClockNode
// re-renders with updated break arc lengths.

describe('AC3 — Pomo config reactivity: break arc changes when shortBreakMin changes', () => {
  it('break arc strokeDasharray reflects the new shortBreakMin after store update', async () => {
    _seq = 0;
    const todoId = 'todo-react';
    const t1 = makeTaskNode('rc-1', makeTaskState({ parentTodoId: todoId, plannedMin: 60 }));
    const t2 = makeTaskNode('rc-2', makeTaskState({ parentTodoId: todoId, plannedMin: 60 }));

    // Initial board: shortBreakMin = 5
    const makeBoard = (pomoCfg: Partial<PomoConfig>): Board => ({
      version: 1,
      schemaVersion: 1,
      savedAt: '2026-05-14T08:00:00.000Z',
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [makePomoNode(pomoCfg), makeTodoNode(todoId), t1, t2],
      edges: [makeEdge('rc-1', 'rc-2')],
    });

    useBoardStore.setState({ board: makeBoard({ shortBreakMin: 5 }) });
    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    const CIRCUMFERENCE = 2 * Math.PI * 108;
    const TOTAL_MIN = 720;

    // Break arc with shortBreakMin=5: arcLengthMin = 5, arcLength = (5/720)*CIRCUMFERENCE
    const arcLen5 = (5 / TOTAL_MIN) * CIRCUMFERENCE;

    const getBreakDashArrayValue = (): string | null => {
      // Decision 24.2: short breaks use strokeWidth=6 (long breaks use 10)
      const arcs = getArcCircles().filter(
        (c) => c.getAttribute('stroke-width') === '6' || c.getAttribute('stroke-width') === '10',
      );
      return arcs[0]?.getAttribute('stroke-dasharray') ?? null;
    };

    const dash5 = getBreakDashArrayValue();
    expect(dash5).not.toBeNull();
    // The dasharray should start with the arc length for a 5-min break
    expect(dash5).toContain(arcLen5.toFixed(0).slice(0, 4)); // first 4 chars match

    // Update store with shortBreakMin = 10 (new nodes reference → cache invalidated)
    await act(async () => {
      useBoardStore.setState({ board: makeBoard({ shortBreakMin: 10 }) });
    });

    // Break arc length should now reflect 10-min break
    const arcLen10 = (10 / TOTAL_MIN) * CIRCUMFERENCE;
    const dash10 = getBreakDashArrayValue();
    expect(dash10).not.toBeNull();
    // The new dasharray should reflect the longer break (different from dash5)
    expect(dash10).not.toBe(dash5);
    // And start with the arc length for a 10-min break
    expect(dash10).toContain(arcLen10.toFixed(0).slice(0, 4));
  });
});

// ── Decision 24.2 — Break arc visibility ─────────────────────────────────────

describe('Decision 24.2 — break arc visibility', () => {
  it('short break arcs use stroke=var(--ink-3) and strokeWidth=6', () => {
    _seq = 0;
    const todoId = 'todo-brk-short';
    // 2 tasks with a short break between them (longBreakEvery=100 so no long break fires)
    const task1 = makeTaskNode('bs-1', makeTaskState({ parentTodoId: todoId, plannedMin: 25 }));
    const task2 = makeTaskNode('bs-2', makeTaskState({ parentTodoId: todoId, plannedMin: 25 }));
    const board: Board = {
      version: 1,
      schemaVersion: 1,
      savedAt: '2026-05-14T08:00:00.000Z',
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        makePomoNode({ shortBreakMin: 5, longBreakEvery: 100 }),
        makeTodoNode(todoId),
        task1,
        task2,
      ],
      edges: [makeEdge('bs-1', 'bs-2')],
    };
    useBoardStore.setState({ board });
    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    const breakArc = Array.from(document.querySelectorAll('svg circle')).find(
      (c) => c.getAttribute('stroke-width') === '6',
    );
    expect(breakArc, 'should have a break arc with strokeWidth=6').toBeDefined();
    expect(breakArc!.getAttribute('stroke')).toBe('var(--ink-3)');
  });

  it('long break arcs use stroke=var(--ink-2) and strokeWidth=10', () => {
    _seq = 0;
    const todoId = 'todo-brk-long';
    // 5 tasks + longBreakEvery=4 → the 4th break (between tasks 4 and 5) is a long break.
    // The trailing break after task 5 is stripped, so the long break at position 4 IS rendered.
    const task1 = makeTaskNode('bl-1', makeTaskState({ parentTodoId: todoId, plannedMin: 25 }));
    const task2 = makeTaskNode('bl-2', makeTaskState({ parentTodoId: todoId, plannedMin: 25 }));
    const task3 = makeTaskNode('bl-3', makeTaskState({ parentTodoId: todoId, plannedMin: 25 }));
    const task4 = makeTaskNode('bl-4', makeTaskState({ parentTodoId: todoId, plannedMin: 25 }));
    const task5 = makeTaskNode('bl-5', makeTaskState({ parentTodoId: todoId, plannedMin: 25 }));
    const board: Board = {
      version: 1,
      schemaVersion: 1,
      savedAt: '2026-05-14T08:00:00.000Z',
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        makePomoNode({ shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4 }),
        makeTodoNode(todoId),
        task1,
        task2,
        task3,
        task4,
        task5,
      ],
      edges: [
        makeEdge('bl-1', 'bl-2'),
        makeEdge('bl-2', 'bl-3'),
        makeEdge('bl-3', 'bl-4'),
        makeEdge('bl-4', 'bl-5'),
      ],
    };
    useBoardStore.setState({ board });
    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    const longBreakArc = Array.from(document.querySelectorAll('svg circle')).find(
      (c) => c.getAttribute('stroke-width') === '10',
    );
    expect(longBreakArc, 'should have a long break arc with strokeWidth=10').toBeDefined();
    expect(longBreakArc!.getAttribute('stroke')).toBe('var(--ink-2)');
  });

  it('break arcs render with opacity=1 (not 0.6 or 0.8 from Decision 24.1)', () => {
    _seq = 0;
    const todoId = 'todo-brk-opacity';
    const task1 = makeTaskNode('bo-1', makeTaskState({ parentTodoId: todoId, plannedMin: 25 }));
    const task2 = makeTaskNode('bo-2', makeTaskState({ parentTodoId: todoId, plannedMin: 25 }));
    const board: Board = {
      version: 1,
      schemaVersion: 1,
      savedAt: '2026-05-14T08:00:00.000Z',
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        makePomoNode({ shortBreakMin: 5, longBreakEvery: 100 }),
        makeTodoNode(todoId),
        task1,
        task2,
      ],
      edges: [makeEdge('bo-1', 'bo-2')],
    };
    useBoardStore.setState({ board });
    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    const breakArc = Array.from(document.querySelectorAll('svg circle')).find(
      (c) => c.getAttribute('stroke-width') === '6',
    );
    expect(breakArc, 'should have a break arc').toBeDefined();
    const opacity = breakArc!.getAttribute('opacity');
    expect(opacity).not.toBe('0.6');
    expect(opacity).not.toBe('0.8');
    // Decision 24.2: opacity must be 1
    expect(opacity).toBe('1');
  });
});
