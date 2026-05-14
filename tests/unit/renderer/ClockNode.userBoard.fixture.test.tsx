// @vitest-environment jsdom
/**
 * Decision 24.1 — User-board fixture-replay test.
 *
 * Mirrors the user's actual failing board: a 3-task chain (120/80/30 min)
 * linked to a ClockNode via linkedTodoId='mother-todo'. This test would have
 * failed before the Decision 24.1 palette fix because task 2 and task 3 would
 * have received undefined tokens (--sky, --mint) that render as stroke="none".
 *
 * Assertions:
 *  1. Exactly 3 task arc circles (stroke-width=18) are rendered.
 *  2. Each task arc stroke uses var(--<token>) where <token> is in COLORS.
 *  3. At least 2 break arc circles (stroke-width=9) are rendered.
 *
 * Together with timelineSelector.colorTokens.test.ts (which asserts every COLORS
 * entry is defined in tokens.css), these two tests form the complete chain:
 *   selector emits token → renderer emits var(--token) → token is in COLORS
 *   → token is in tokens.css → CSS resolves to a real color → arc paints.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';
import { ClockNode } from '../../../src/renderer/components/nodes/ClockNode';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import { COLORS } from '../../../src/renderer/store/timelineSelector';
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

// ── Board fixture — mirrors user's .krnl0-data/board.json ─────────────────────

function buildUserBoard(): Board {
  const todoId = 'mother-todo';
  const clockId = 'mother-clock';

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
    createdAt: '2026-05-14T00:00:01.000Z',
    parentTodoId: todoId,
    parentTaskId: null,
    todoItemId: 'item-task1',
    pomoSessionsCompleted: 0,
    plannedMin: 120,
    secondsAccumulated: 0,
    currentSessionElapsedSec: 0,
  };

  const task2State: TaskState = {
    text: 'Task Two',
    done: false,
    durationMin: 80,
    eta: '~80 min',
    sequenceNumber: 2,
    layer: 0,
    createdAt: '2026-05-14T00:00:02.000Z',
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
    createdAt: '2026-05-14T00:00:03.000Z',
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
    id: clockId,
    kind: 'clock',
    position: { x: 1252, y: 0 },
    isMother: true,
    state: {
      linkedTodoId: todoId,
      windowStartHour: 0,
    },
    config: {},
  };

  // 2 task.next edges chaining task-1 → task-2 → task-3
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
    savedAt: '2026-05-14T00:00:00.000Z',
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [pomoNode, todoNode, task1Node, task2Node, task3Node, clockNode],
    edges,
  };
}

// ── Test ──────────────────────────────────────────────────────────────────────

describe('Decision 24.1 — user-reported 3-task chain renders all 3 task arcs', () => {
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

    // All arc circles at r=108 (both task and break arcs)
    const allArcCircles = Array.from(document.querySelectorAll('svg circle')).filter(
      (c) => c.getAttribute('r') === '108',
    );

    // Task arcs: stroke-width=18
    const taskArcs = allArcCircles.filter((c) => c.getAttribute('stroke-width') === '18');

    // ASSERTION 1: exactly 3 task arcs (would fail before Decision 24.1 — only 1 painted)
    expect(taskArcs).toHaveLength(3);

    // ASSERTION 2: each task arc stroke uses var(--<token>) where <token> is in COLORS
    const allowedTokens = new Set<string>(COLORS);
    for (const arc of taskArcs) {
      const stroke = arc.getAttribute('stroke') ?? '';
      const match = stroke.match(/^var\(--([a-z]+)/);
      expect(match, `task arc stroke "${stroke}" must use var(--<token>, ...) syntax`).not.toBeNull();
      const token = match![1]!;
      expect(
        allowedTokens.has(token),
        `token "${token}" from stroke "${stroke}" must be a member of COLORS`,
      ).toBe(true);
    }

    // ASSERTION 3: at least 2 break arcs present (3 tasks → 3 breaks, trailing stripped at render)
    const breakArcs = allArcCircles.filter((c) => c.getAttribute('stroke-width') === '9');
    expect(breakArcs.length).toBeGreaterThanOrEqual(2);
  });
});
