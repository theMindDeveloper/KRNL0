// @vitest-environment jsdom
/**
 * ClockNode component render tests — Decision 23.1 (PR #112)
 *
 * Covers:
 *   AC5 — clock renders 12h face; tasks linked via linkedTodoId produce arcs
 *   AC6 — done tasks render at 40% opacity
 *   AC7 — total plannedMin > 720 shows "+N min" badge
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { ClockNode } from '../../../src/renderer/components/nodes/ClockNode';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import type { ClockState, ClockConfig } from '../../../src/renderer/components/nodes/ClockNode/types';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';
import type { Node } from '../../../src/shared/types/node';
import type { Board } from '../../../src/shared/types';

afterEach(() => {
  cleanup();
  useBoardStore.setState({ board: null });
});

// ── Factories ─────────────────────────────────────────────────────────────────

function makeClockState(overrides: Partial<ClockState> = {}): ClockState {
  return {
    linkedTodoId: null,
    windowStartHour: 8,
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

function makeTaskState(overrides: Partial<TaskState> = {}): TaskState {
  return {
    text: 'Task',
    done: false,
    durationMin: 25,
    eta: '~25 min',
    sequenceNumber: 1,
    layer: 0,
    createdAt: '2026-05-14T08:00:00.000Z',
    parentTodoId: 'todo-1',
    parentTaskId: null,
    todoItemId: 'item-1',
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

function seedBoard(nodes: Node[]): void {
  const board: Board = {
    version: 1,
    schemaVersion: 1,
    savedAt: '2026-05-14T08:00:00.000Z',
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes,
    edges: [],
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

// ── AC5 — Renders SVG with 12 tick marks ──────────────────────────────────────

describe('AC5 — ClockNode renders a 12-hour face', () => {
  it('renders an SVG element representing the clock face', () => {
    renderClockNode(makeClockState());
    const svgs = document.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('renders 12 tick marks on the clock face', () => {
    renderClockNode(makeClockState());
    const lines = document.querySelectorAll('svg line');
    expect(lines).toHaveLength(12);
  });

  it('shows link UI when linkedTodoId is null', () => {
    seedBoard([]);
    renderClockNode(makeClockState({ linkedTodoId: null }));
    expect(screen.getByText('Link Todo:')).toBeDefined();
  });

  it('renders one arc circle per linked root task', () => {
    const todoId = 'todo-1';
    const task1 = makeTaskNode('task-1', makeTaskState({ parentTodoId: todoId, sequenceNumber: 1, plannedMin: 60 }));
    const task2 = makeTaskNode('task-2', makeTaskState({ parentTodoId: todoId, sequenceNumber: 2, plannedMin: 30 }));
    const task3 = makeTaskNode('task-3', makeTaskState({ parentTodoId: todoId, sequenceNumber: 3, plannedMin: 45 }));
    seedBoard([task1, task2, task3]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    // The component renders one <circle> arc per task plus the background ring
    // plus the center dot. Background ring = 1 (r=130), center dot = 1 (r=3),
    // arcs = 3 (r=108). Total = 5.
    const circles = document.querySelectorAll('svg circle');
    // We specifically look for arc circles (r=108) — one per task
    const arcCircles = Array.from(circles).filter(
      (c) => c.getAttribute('r') === '108',
    );
    expect(arcCircles).toHaveLength(3);
  });

  it('excludes subtasks (parentTaskId !== null) from arcs', () => {
    const todoId = 'todo-1';
    const rootTask = makeTaskNode('task-root', makeTaskState({ parentTodoId: todoId, sequenceNumber: 1, parentTaskId: null }));
    const subTask = makeTaskNode('task-sub', makeTaskState({ parentTodoId: todoId, sequenceNumber: 2, parentTaskId: 'task-root' }));
    seedBoard([rootTask, subTask]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    const arcCircles = Array.from(document.querySelectorAll('svg circle')).filter(
      (c) => c.getAttribute('r') === '108',
    );
    // Only the root task gets an arc; subtask is excluded
    expect(arcCircles).toHaveLength(1);
  });
});

// ── AC6 — Done tasks at 40% opacity ──────────────────────────────────────────

describe('AC6 — Done tasks render at 40% opacity', () => {
  it('done task arc has opacity 0.4', () => {
    const todoId = 'todo-1';
    const doneTask = makeTaskNode('task-done', makeTaskState({ parentTodoId: todoId, sequenceNumber: 1, done: true, plannedMin: 60 }));
    seedBoard([doneTask]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    const arcCircles = Array.from(document.querySelectorAll('svg circle')).filter(
      (c) => c.getAttribute('r') === '108',
    );
    expect(arcCircles).toHaveLength(1);
    expect(arcCircles[0]!.getAttribute('opacity')).toBe('0.4');
  });

  it('in-progress task arc has no opacity attribute (defaults to 1)', () => {
    const todoId = 'todo-1';
    const activeTask = makeTaskNode('task-active', makeTaskState({ parentTodoId: todoId, sequenceNumber: 1, done: false, plannedMin: 60 }));
    seedBoard([activeTask]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    const arcCircles = Array.from(document.querySelectorAll('svg circle')).filter(
      (c) => c.getAttribute('r') === '108',
    );
    expect(arcCircles).toHaveLength(1);
    // opacity="1" means arc.done is false — React renders opacity={1} as the attribute "1"
    expect(arcCircles[0]!.getAttribute('opacity')).toBe('1');
  });

  it('done tasks are included in the arc list (not filtered out)', () => {
    const todoId = 'todo-1';
    const doneTask = makeTaskNode('task-done', makeTaskState({ parentTodoId: todoId, sequenceNumber: 1, done: true, plannedMin: 30 }));
    const activeTask = makeTaskNode('task-active', makeTaskState({ parentTodoId: todoId, sequenceNumber: 2, done: false, plannedMin: 30 }));
    seedBoard([doneTask, activeTask]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    const arcCircles = Array.from(document.querySelectorAll('svg circle')).filter(
      (c) => c.getAttribute('r') === '108',
    );
    // Both tasks appear — done tasks are never filtered
    expect(arcCircles).toHaveLength(2);
  });
});

// ── AC7 — Overflow badge when total plannedMin > 720 ─────────────────────────

describe('AC7 — Overflow badge for tasks exceeding 720 minutes', () => {
  it('shows no overflow badge when total plannedMin <= 720', () => {
    const todoId = 'todo-1';
    const task = makeTaskNode('task-1', makeTaskState({ parentTodoId: todoId, sequenceNumber: 1, plannedMin: 360 }));
    seedBoard([task]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    // No overflow text should be present
    expect(screen.queryByText(/\+\d+ min/)).toBeNull();
  });

  it('shows "+N min" badge when total plannedMin exceeds 720', () => {
    const todoId = 'todo-1';
    // 3 tasks × 300 min = 900 total → overflow = 180 min
    const task1 = makeTaskNode('task-1', makeTaskState({ parentTodoId: todoId, sequenceNumber: 1, plannedMin: 300 }));
    const task2 = makeTaskNode('task-2', makeTaskState({ parentTodoId: todoId, sequenceNumber: 2, plannedMin: 300 }));
    const task3 = makeTaskNode('task-3', makeTaskState({ parentTodoId: todoId, sequenceNumber: 3, plannedMin: 300 }));
    seedBoard([task1, task2, task3]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    expect(screen.getByText('+180 min')).toBeDefined();
  });

  it('shows "+1 min" badge when total is exactly 721', () => {
    const todoId = 'todo-1';
    const task = makeTaskNode('task-1', makeTaskState({ parentTodoId: todoId, sequenceNumber: 1, plannedMin: 721 }));
    seedBoard([task]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    expect(screen.getByText('+1 min')).toBeDefined();
  });

  it('shows no overflow badge when linkedTodoId is null', () => {
    seedBoard([]);
    renderClockNode(makeClockState({ linkedTodoId: null }));
    expect(screen.queryByText(/\+\d+ min/)).toBeNull();
  });
});
