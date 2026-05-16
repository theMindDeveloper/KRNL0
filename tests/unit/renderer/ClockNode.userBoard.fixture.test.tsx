// @vitest-environment jsdom
/**
 * User-board fixture-replay test — adapted for the LifeOS analog redesign.
 *
 * Mirrors the user's 3-task chain (120/80/30 min) linked to mother-todo.
 * Assertions:
 *  1. Exactly 19 arc <path> elements (fill="none") are rendered.
 *     Decision 28 sub-arcs: 120min=9(5w+4b), 80min=7(4w+3b), 30min=3(2w+1b) → 19 total.
 *  2. Each arc stroke uses a var(--<token>) CSS variable.
 *  3. Break arcs use var(--ink-3) stroke (Decision 28 reintroduced sub-arcs).
 *
 * The task anchor date is today (dynamic) so selectSchedule emits placements
 * for today's date which the new ClockNode always displays.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';
import { ClockNode } from '../../../src/renderer/components/nodes/ClockNode';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import type { Board } from '../../../src/shared/types';
import type { Node } from '../../../src/shared/types/node';
import type { Edge } from '../../../src/shared/types/edge';
import type { ClockState, ClockConfig } from '../../../src/renderer/components/nodes/ClockNode/types';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';
import type { PomoConfig } from '../../../src/renderer/components/nodes/PomoNode/types';

afterEach(() => {
  cleanup();
  useBoardStore.setState({ board: null });
});

/** Today's YYYY-MM-DD in local time. */
function todayYMD(): string {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

function buildUserBoard(): Board {
  const TODAY = todayYMD();
  const todoId = 'mother-todo';

  const pomoNode: Node = {
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
    } satisfies PomoConfig,
  };

  const todoNode: Node = {
    id: todoId,
    kind: 'todo',
    position: { x: 0, y: 0 },
    isMother: true,
    state: { items: [] },
    config: {},
  };

  const task1State: TaskState = {
    text: 'Task One',
    done: false,
    durationMin: 120,
    eta: '~120 min',
    sequenceNumber: 1,
    layer: 0,
    createdAt: `${TODAY}T00:00:01.000Z`,
    parentTodoId: todoId,
    parentTaskId: null,
    todoItemId: 'item-task1',
    pomoSessionsCompleted: 0,
    plannedMin: 120,
    secondsAccumulated: 0,
    currentSessionElapsedSec: 0,
    scheduledFor: `${TODAY}T02:00`,
  };

  const task2State: TaskState = {
    text: 'Task Two',
    done: false,
    durationMin: 80,
    eta: '~80 min',
    sequenceNumber: 2,
    layer: 0,
    createdAt: `${TODAY}T00:00:02.000Z`,
    parentTodoId: todoId,
    parentTaskId: null,
    todoItemId: 'item-task2',
    pomoSessionsCompleted: 0,
    plannedMin: 80,
    secondsAccumulated: 0,
    currentSessionElapsedSec: 0,
  };

  const task3State: TaskState = {
    text: 'Task Three',
    done: false,
    durationMin: 30,
    eta: '~30 min',
    sequenceNumber: 3,
    layer: 0,
    createdAt: `${TODAY}T00:00:03.000Z`,
    parentTodoId: todoId,
    parentTaskId: null,
    todoItemId: 'item-task3',
    pomoSessionsCompleted: 0,
    plannedMin: 30,
    secondsAccumulated: 0,
    currentSessionElapsedSec: 0,
  };

  const task1Node: Node<TaskState, { showDuration: boolean }> = {
    id: 'task-1',
    kind: 'todo.task',
    position: { x: 0, y: 0 },
    isMother: false,
    state: task1State,
    config: { showDuration: true },
  };

  const task2Node: Node<TaskState, { showDuration: boolean }> = {
    id: 'task-2',
    kind: 'todo.task',
    position: { x: 0, y: 0 },
    isMother: false,
    state: task2State,
    config: { showDuration: true },
  };

  const task3Node: Node<TaskState, { showDuration: boolean }> = {
    id: 'task-3',
    kind: 'todo.task',
    position: { x: 0, y: 0 },
    isMother: false,
    state: task3State,
    config: { showDuration: true },
  };

  const clockNode: Node<ClockState, ClockConfig> = {
    id: 'mother-clock',
    kind: 'clock',
    position: { x: 1252, y: 0 },
    isMother: true,
    state: {
      linkedTodoId: todoId,
      viewWindow: 0,
      selectedDate: TODAY,
    },
    config: {},
  };

  const edges: Edge[] = [
    {
      id: 'edge-task1-task2',
      from: { nodeId: 'task-1', event: 'task.next' },
      to: { nodeId: 'task-2', command: 'task.activate' },
      enabled: true,
    },
    {
      id: 'edge-task2-task3',
      from: { nodeId: 'task-2', event: 'task.next' },
      to: { nodeId: 'task-3', command: 'task.activate' },
      enabled: true,
    },
  ];

  return {
    version: 1,
    schemaVersion: 1,
    savedAt: `${TODAY}T00:00:00.000Z`,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [pomoNode, todoNode, task1Node, task2Node, task3Node, clockNode],
    edges,
  };
}

describe('User-board fixture — 3-task chain renders arc paths (Decision 28 sub-arcs)', () => {
  it('mirrors user board: 3 tasks (120/80/30 min), 2 task.next edges, linkedTodoId=mother-todo', () => {
    const board = buildUserBoard();
    useBoardStore.setState({ board });

    const clockNode = board.nodes.find((n) => n.kind === 'clock')! as Node<ClockState, ClockConfig>;

    render(
      React.createElement(ClockNode, {
        node: clockNode,
        onCommand: vi.fn(),
        slotIndex: 6,
        slotTotal: 6,
      }),
    );

    // Arc paths: <path fill="none" stroke="var(--...)">
    // Decision 28 sub-arcs: 120min=5work+4break=9, 80min=4work+3break=7, 30min=2work+1break=3 → 19 total.
    const taskArcPaths = Array.from(document.querySelectorAll('svg path')).filter(
      (p) => p.getAttribute('fill') === 'none' && (p.getAttribute('stroke') ?? '').startsWith('var(--'),
    );

    // ASSERTION 1: 19 arc paths total (work sub-arcs + break sub-arcs per Decision 28).
    expect(taskArcPaths).toHaveLength(19);

    // ASSERTION 2: each arc stroke is a var(--token) CSS variable.
    for (const arc of taskArcPaths) {
      const stroke = arc.getAttribute('stroke') ?? '';
      expect(stroke).toMatch(/^var\(--[a-z][\w-]*\)/);
    }

    // ASSERTION 3: break arcs use var(--ink-3) stroke (Decision 28).
    const breakArcs = taskArcPaths.filter((a) => a.getAttribute('stroke') === 'var(--ink-3)');
    expect(breakArcs.length).toBeGreaterThan(0);
  });
});
