// @vitest-environment jsdom
/**
 * ClockNode component render tests — ADR 0004 (rewrite of Decision 24).
 *
 * Post-ADR-0004 ClockNode requires an anchored chain: arcs render only for
 * placements emitted by selectScheduledTasksForRange for the linked todo on
 * the selected day. Break shapes are projected onto the wall clock via the
 * predecessor's placement.endISO (ADR 0004 §3.5 — dual-selector option A).
 *
 * Covers:
 *   - clock face: SVG, 12 ticks
 *   - link UI when linkedTodoId === null
 *   - anchored chain produces task arcs at base radius R = 108
 *   - break arcs render at BREAK_R = 92 (inside the task ring)
 *   - subtasks excluded
 *   - done tasks render at 40% opacity
 *   - parallel branches use mixBlendMode 'multiply' only when degraded (idx >= 4)
 *   - no anchor: empty hint shown when linkedTodoId is set
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

const ANCHOR_DATE = '2026-05-14';

afterEach(() => {
  cleanup();
  useBoardStore.setState({ board: null });
});

// ── Factories ─────────────────────────────────────────────────────────────────

function makeClockState(overrides: Partial<ClockState> = {}): ClockState {
  return {
    linkedTodoId: null,
    viewWindow: 0,
    selectedDate: ANCHOR_DATE,
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

function seedBoard(nodes: Node[], edges: Edge[] = [], pomoCfg: Partial<PomoConfig> = {}): void {
  const board: Board = {
    version: 1,
    schemaVersion: 1,
    savedAt: '2026-05-14T08:00:00.000Z',
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [makePomoNode(pomoCfg), ...nodes],
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

/** Task arcs (strokeWidth 18 single, 10 parallel — but here we keep the
 *  scenarios single-track unless explicitly testing parallel rings). */
function getTaskArcsAtR(): Element[] {
  return Array.from(document.querySelectorAll('svg circle')).filter(
    (c) => c.getAttribute('r') === '108' && c.getAttribute('stroke-width') === '18',
  );
}

/** Break arcs sit at BREAK_R = 92 with strokeWidth 6 (short) or 10 (long). */
function getBreakArcs(): Element[] {
  return Array.from(document.querySelectorAll('svg circle')).filter(
    (c) =>
      c.getAttribute('r') === '92' &&
      (c.getAttribute('stroke-width') === '6' || c.getAttribute('stroke-width') === '10'),
  );
}

beforeEach(() => {
  _seq = 0;
});

// ── Clock face ────────────────────────────────────────────────────────────────

describe('ClockNode renders a 12-hour face', () => {
  it('renders an SVG element representing the clock face', () => {
    seedBoard([]);
    renderClockNode(makeClockState());
    const svgs = document.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('renders 12 tick marks on the clock face', () => {
    seedBoard([]);
    renderClockNode(makeClockState());
    const lines = document.querySelectorAll('svg line');
    expect(lines).toHaveLength(12);
  });

  it('shows link UI when linkedTodoId is null', () => {
    seedBoard([]);
    renderClockNode(makeClockState({ linkedTodoId: null }));
    expect(screen.getByText('Link Todo:')).toBeDefined();
  });
});

// ── Anchored chain → arcs ────────────────────────────────────────────────────

describe('Anchored chain renders task and break arcs', () => {
  it('three-task chain anchored at 02:00 produces 3 task arcs and break arcs in between', () => {
    const todoId = 'todo-1';
    const task1 = makeTaskNode(
      'task-1',
      makeTaskState({
        parentTodoId: todoId,
        plannedMin: 60,
        scheduledFor: `${ANCHOR_DATE}T02:00`,
      }),
    );
    const task2 = makeTaskNode('task-2', makeTaskState({ parentTodoId: todoId, plannedMin: 30 }));
    const task3 = makeTaskNode('task-3', makeTaskState({ parentTodoId: todoId, plannedMin: 45 }));
    seedBoard([makeTodoNode(todoId), task1, task2, task3], [
      makeEdge('task-1', 'task-2'),
      makeEdge('task-2', 'task-3'),
    ]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    // 3 task arcs at radius R, plus break arcs between them at BREAK_R.
    expect(getTaskArcsAtR()).toHaveLength(3);
    expect(getBreakArcs().length).toBeGreaterThanOrEqual(2);
  });

  it('task arcs use strokeWidth=18 at radius 108; short-break arcs use strokeWidth=6 at radius 92', () => {
    const todoId = 'todo-stroke';
    const task1 = makeTaskNode(
      's-task-1',
      makeTaskState({
        parentTodoId: todoId,
        plannedMin: 30,
        scheduledFor: `${ANCHOR_DATE}T02:00`,
      }),
    );
    const task2 = makeTaskNode('s-task-2', makeTaskState({ parentTodoId: todoId, plannedMin: 30 }));
    seedBoard([makeTodoNode(todoId), task1, task2], [makeEdge('s-task-1', 's-task-2')]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    expect(getTaskArcsAtR()).toHaveLength(2);
    const breakArcs = getBreakArcs();
    // ADR 0004 §3.5 — every break in the timeline whose predecessor placement
    // exists on the selected day paints. With 2 chained tasks there are 2
    // breaks (one between, one trailing); both predecessor placements exist.
    expect(breakArcs.length).toBeGreaterThanOrEqual(1);
    // Every break here is a short break → strokeWidth 6.
    for (const b of breakArcs) {
      expect(b.getAttribute('stroke-width')).toBe('6');
    }
  });

  it('excludes subtasks (parentTaskId !== null) from arcs', () => {
    const todoId = 'todo-sub';
    const rootTask = makeTaskNode(
      'task-root',
      makeTaskState({
        parentTodoId: todoId,
        parentTaskId: null,
        scheduledFor: `${ANCHOR_DATE}T02:00`,
      }),
    );
    const subTask = makeTaskNode(
      'task-sub',
      makeTaskState({ parentTodoId: todoId, parentTaskId: 'task-root' }),
    );
    seedBoard([makeTodoNode(todoId), rootTask, subTask]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    // Only the root task arc renders.
    expect(getTaskArcsAtR()).toHaveLength(1);
  });

  it('chain with no anchor renders no arcs and shows the empty-day hint', () => {
    const todoId = 'todo-noanchor';
    const t1 = makeTaskNode('na-1', makeTaskState({ parentTodoId: todoId, plannedMin: 30 }));
    const t2 = makeTaskNode('na-2', makeTaskState({ parentTodoId: todoId, plannedMin: 30 }));
    seedBoard([makeTodoNode(todoId), t1, t2], [makeEdge('na-1', 'na-2')]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    expect(getTaskArcsAtR()).toHaveLength(0);
    expect(screen.getByTestId('clock-empty-hint').textContent).toContain('DROP A TASK');
  });
});

// ── Done tasks ────────────────────────────────────────────────────────────────

describe('Done tasks render at 40% opacity', () => {
  it('done task arc has opacity 0.4', () => {
    const todoId = 'todo-done';
    const doneTask = makeTaskNode(
      'task-done',
      makeTaskState({
        parentTodoId: todoId,
        done: true,
        plannedMin: 60,
        scheduledFor: `${ANCHOR_DATE}T02:00`,
      }),
    );
    seedBoard([makeTodoNode(todoId), doneTask]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    const taskArcs = getTaskArcsAtR();
    expect(taskArcs).toHaveLength(1);
    expect(taskArcs[0]!.getAttribute('opacity')).toBe('0.4');
  });

  it('in-progress task arc has opacity=1', () => {
    const todoId = 'todo-active';
    const activeTask = makeTaskNode(
      'task-active',
      makeTaskState({
        parentTodoId: todoId,
        done: false,
        plannedMin: 60,
        scheduledFor: `${ANCHOR_DATE}T02:00`,
      }),
    );
    seedBoard([makeTodoNode(todoId), activeTask]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    const taskArcs = getTaskArcsAtR();
    expect(taskArcs).toHaveLength(1);
    expect(taskArcs[0]!.getAttribute('opacity')).toBe('1');
  });
});

// ── Parallel branches at concentric radii ────────────────────────────────────

describe('Parallel branches paint at concentric radii (ADR 0004 §4)', () => {
  it('two parallel branches render at distinct radii (R and R+12), strokeWidth 10', () => {
    const todoId = 'todo-par';
    const tA = makeTaskNode(
      'par-A',
      makeTaskState({
        parentTodoId: todoId,
        plannedMin: 10,
        scheduledFor: `${ANCHOR_DATE}T02:00`,
      }),
    );
    const tB = makeTaskNode('par-B', makeTaskState({ parentTodoId: todoId, plannedMin: 20 }));
    const tC = makeTaskNode('par-C', makeTaskState({ parentTodoId: todoId, plannedMin: 15 }));
    // A → fork → B and C
    seedBoard([makeTodoNode(todoId), tA, tB, tC], [
      makeEdge('par-A', 'par-B'),
      makeEdge('par-A', 'par-C'),
    ]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    // Branch arcs use strokeWidth 10. They paint at radii 108 and 120.
    const branchArcs = Array.from(document.querySelectorAll('svg circle')).filter(
      (c) => c.getAttribute('stroke-width') === '10' && c.getAttribute('r') !== '92',
    );
    expect(branchArcs).toHaveLength(2);
    const radii = branchArcs.map((c) => c.getAttribute('r')).sort();
    expect(radii).toEqual(['108', '120']);
  });

  it('parallel branches with index < 4 do NOT use mixBlendMode multiply', () => {
    const todoId = 'todo-par2';
    const tA = makeTaskNode(
      'pp-A',
      makeTaskState({
        parentTodoId: todoId,
        plannedMin: 10,
        scheduledFor: `${ANCHOR_DATE}T02:00`,
      }),
    );
    const tB = makeTaskNode('pp-B', makeTaskState({ parentTodoId: todoId, plannedMin: 20 }));
    const tC = makeTaskNode('pp-C', makeTaskState({ parentTodoId: todoId, plannedMin: 15 }));
    seedBoard([makeTodoNode(todoId), tA, tB, tC], [
      makeEdge('pp-A', 'pp-B'),
      makeEdge('pp-A', 'pp-C'),
    ]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    const branchArcs = Array.from(document.querySelectorAll('svg circle')).filter(
      (c) => c.getAttribute('stroke-width') === '10' && c.getAttribute('r') !== '92',
    );
    for (const arc of branchArcs) {
      expect((arc as HTMLElement).style.mixBlendMode).toBeFalsy();
    }
  });

  it('non-parallel task arc keeps strokeWidth=18 and no mixBlendMode', () => {
    const todoId = 'todo-seq';
    const t1 = makeTaskNode(
      'seq-1',
      makeTaskState({
        parentTodoId: todoId,
        plannedMin: 25,
        scheduledFor: `${ANCHOR_DATE}T02:00`,
      }),
    );
    const t2 = makeTaskNode('seq-2', makeTaskState({ parentTodoId: todoId, plannedMin: 25 }));
    seedBoard([makeTodoNode(todoId), t1, t2], [makeEdge('seq-1', 'seq-2')]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    const taskArcs = getTaskArcsAtR();
    expect(taskArcs).toHaveLength(2);
    for (const arc of taskArcs) {
      expect((arc as HTMLElement).style.mixBlendMode).toBeFalsy();
    }
  });
});

// ── Day-selector commands ────────────────────────────────────────────────────

describe('Day-selector commands (ADR 0004 §3.3)', () => {
  it('clicking the next-day button dispatches clock.advanceDay { delta: 1 }', async () => {
    seedBoard([]);
    const onCommand = vi.fn();
    renderClockNode(makeClockState(), onCommand);

    const nextBtn = screen.getByTestId('clock-day-next') as HTMLButtonElement;
    await act(async () => {
      nextBtn.click();
    });
    expect(onCommand).toHaveBeenCalledWith('clock.advanceDay', { delta: 1 });
  });

  it('clicking the prev-day button dispatches clock.advanceDay { delta: -1 }', async () => {
    seedBoard([]);
    const onCommand = vi.fn();
    renderClockNode(makeClockState({ selectedDate: '2026-05-20' }), onCommand);

    const prevBtn = screen.getByTestId('clock-day-prev') as HTMLButtonElement;
    await act(async () => {
      prevBtn.click();
    });
    expect(onCommand).toHaveBeenCalledWith('clock.advanceDay', { delta: -1 });
  });

  it('TODAY button is disabled when selectedDate equals today', () => {
    // Use today's local date directly so the disabled assertion is deterministic.
    const today = (() => {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${da}`;
    })();
    seedBoard([]);
    renderClockNode(makeClockState({ selectedDate: today }));

    const todayBtn = screen.getByTestId('clock-day-today') as HTMLButtonElement;
    expect(todayBtn.disabled).toBe(true);
  });
});
