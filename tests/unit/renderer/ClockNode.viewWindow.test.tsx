// @vitest-environment jsdom
/**
 * Decision 24.2 — viewWindow render tests.
 *
 * Covers:
 *   - window 0 shows segments inside [0, 720)
 *   - window 0 hides segments fully past 720
 *   - window 1 shows segments past 720
 *   - boundary-spanning segment renders in both windows (flatMap clip)
 *   - toggle button disabled when totalMin <= 720
 *   - toggle button enabled when totalMin > 720
 *   - effectiveWindow clamps to 0 when totalMin <= 720 even if viewWindow=1
 *   - hour labels read 0..11 in window 0
 *   - hour labels read 12..23 in window 1
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
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

const TODO_ID = 'todo-vw';
const CIRCUMFERENCE = 2 * Math.PI * 108;
const TOTAL_MIN = 720;

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
    parentTodoId: TODO_ID,
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
  return { id, kind: 'todo.task', position: { x: 0, y: 0 }, isMother: false, state, config: { showDuration: true } };
}

function makeTodoNode(): Node {
  return { id: TODO_ID, kind: 'todo', position: { x: 0, y: 0 }, isMother: true, state: { items: [] }, config: {} };
}

function makeEdge(fromId: string, toId: string): Edge {
  return { id: `edge-${fromId}-${toId}`, from: { nodeId: fromId, event: 'task.next' }, to: { nodeId: toId, command: 'task.activate' }, enabled: true };
}

function makePomoNode(cfg: Partial<PomoConfig> = {}): Node {
  const config: PomoConfig = { sessionMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 100, ...cfg };
  return { id: 'mother-pomo', kind: 'pomo', position: { x: 0, y: 0 }, isMother: true, state: {}, config };
}

function makeClockNode(state: ClockState): Node<ClockState, ClockConfig> {
  return { id: 'mother-clock', kind: 'clock', position: { x: 1252, y: 0 }, isMother: true, state, config: {} };
}

/**
 * Build a board with N sequential tasks, each `plannedMin` minutes, joined
 * by task.next edges. shortBreakMin controls break length.
 */
function buildBoard(
  tasks: Array<{ id: string; plannedMin: number }>,
  pomoOverrides: Partial<PomoConfig> = {},
): Board {
  const taskNodes = tasks.map(({ id, plannedMin }) =>
    makeTaskNode(id, makeTaskState({ plannedMin })),
  );
  const edges: Edge[] = [];
  for (let i = 0; i < tasks.length - 1; i++) {
    edges.push(makeEdge(tasks[i]!.id, tasks[i + 1]!.id));
  }
  return {
    version: 1,
    schemaVersion: 1,
    savedAt: '2026-05-14T00:00:00.000Z',
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [makePomoNode(pomoOverrides), makeTodoNode(), ...taskNodes],
    edges,
  };
}

function renderClockNode(
  viewWindow: 0 | 1,
  board: Board,
  onCommand = vi.fn(),
) {
  useBoardStore.setState({ board });
  const node = makeClockNode({ linkedTodoId: TODO_ID, viewWindow });
  render(
    React.createElement(ClockNode, { node, onCommand, slotIndex: 6, slotTotal: 6 }),
  );
}

function getTaskArcs(): Element[] {
  return Array.from(document.querySelectorAll('svg circle')).filter(
    (c) => c.getAttribute('r') === '108' && c.getAttribute('stroke-width') === '18',
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Decision 24.2 — viewWindow render', () => {
  it('window 0 shows segments fully inside [0, 720)', () => {
    _seq = 0;
    // 4 tasks × 100 min = 400 task min, all inside window 0
    const board = buildBoard([
      { id: 't1', plannedMin: 100 },
      { id: 't2', plannedMin: 100 },
      { id: 't3', plannedMin: 100 },
      { id: 't4', plannedMin: 100 },
    ], { shortBreakMin: 5, longBreakEvery: 100 });

    renderClockNode(0, board);

    const taskArcs = getTaskArcs();
    expect(taskArcs).toHaveLength(4);
  });

  it('window 0 hides segments fully past 720', () => {
    _seq = 0;
    // 8 tasks × 100 min = 800 task min. With shortBreakMin=5, task 8 starts at
    // 7×100 + 6×5 = 730 min → fully past 720. Window 0 shows tasks 1-7 (partially or fully).
    const tasks = Array.from({ length: 8 }, (_, i) => ({ id: `t${i + 1}`, plannedMin: 100 }));
    const board = buildBoard(tasks, { shortBreakMin: 5, longBreakEvery: 100 });

    renderClockNode(0, board);

    const taskArcs = getTaskArcs();
    // Task 8 starts at 730 (past window end of 720) → its startMin >= windowEnd → filtered out.
    // Tasks 1-7 start inside window 0 (start at 0, 105, 210, 315, 420, 525, 630).
    expect(taskArcs.length).toBeGreaterThan(0);
    expect(taskArcs.length).toBeLessThan(8);
  });

  it('window 1 shows segments past 720', () => {
    _seq = 0;
    // 12 tasks × 60 min — window 1 shows tasks past minute 720
    const tasks = Array.from({ length: 12 }, (_, i) => ({ id: `t${i + 1}`, plannedMin: 60 }));
    const board = buildBoard(tasks, { shortBreakMin: 5, longBreakEvery: 100 });

    renderClockNode(1, board);

    const taskArcs = getTaskArcs();
    expect(taskArcs.length).toBeGreaterThan(0);
  });

  it('boundary-spanning segment renders in both windows with correct clip lengths', () => {
    _seq = 0;
    // Construct a boundary-spanning task: task 8 starts at minute 700 (7 tasks × 100min = 700).
    // Task 8 runs from 700 to 800. In window 0: [700,720) = 20min. In window 1: [0,80) = 80min.
    // Use shortBreakMin=0 equivalent by making longBreakEvery very high and shortBreakMin=0
    // Actually shortBreakMin must be >=1 per Zod schema? Let's use shortBreakMin=1 and longBreakEvery=100
    // so breaks don't disrupt the math significantly.
    // 7 tasks × 100min + 6 breaks × 1min = 706min → task 8 starts at ~706min.
    // Close enough: the task will be a boundary-spanner in window 0.
    const tasks = [
      ...Array.from({ length: 7 }, (_, i) => ({ id: `t${i + 1}`, plannedMin: 100 })),
      { id: 't8', plannedMin: 100 },
    ];
    const board = buildBoard(tasks, { shortBreakMin: 1, longBreakEvery: 100 });

    renderClockNode(0, board);
    const arcsW0 = getTaskArcs();
    // Task 8 starts before 720 (at ~706) so it appears in window 0 (clipped to 14 min arc)
    const lastArcW0 = arcsW0[arcsW0.length - 1];
    expect(lastArcW0).toBeDefined();
    // The last arc should be shorter than a full 100-min task arc
    const fullTaskArcLen = (100 / TOTAL_MIN) * CIRCUMFERENCE;
    const lastDashArray = lastArcW0!.getAttribute('stroke-dasharray') ?? '';
    const lastArcLen = parseFloat(lastDashArray.split(' ')[0] ?? '0');
    expect(lastArcLen).toBeLessThan(fullTaskArcLen);

    cleanup();
    useBoardStore.setState({ board: null });

    renderClockNode(1, board);
    const arcsW1 = getTaskArcs();
    // Task 8 also appears in window 1 (the continuation of the span)
    expect(arcsW1.length).toBeGreaterThan(0);
    const firstArcW1 = arcsW1[0];
    const firstDashArray = firstArcW1!.getAttribute('stroke-dasharray') ?? '';
    const firstArcLen = parseFloat(firstDashArray.split(' ')[0] ?? '0');
    // The window-1 portion is longer than the window-0 clip
    expect(firstArcLen).toBeGreaterThan(lastArcLen);
  });

  it('toggle button is disabled when totalMin <= 720', () => {
    _seq = 0;
    // Single 100-min task — well under 720
    const board = buildBoard([{ id: 't1', plannedMin: 100 }], { shortBreakMin: 5 });
    renderClockNode(0, board);

    const btn = screen.getByRole('button', { name: /12h/i });
    expect(btn.hasAttribute('disabled')).toBe(true);
  });

  it('toggle button is enabled when totalMin > 720', () => {
    _seq = 0;
    // 10 tasks × 80 min = 800 min tasks, well over 720
    const tasks = Array.from({ length: 10 }, (_, i) => ({ id: `t${i + 1}`, plannedMin: 80 }));
    const board = buildBoard(tasks, { shortBreakMin: 5, longBreakEvery: 100 });
    renderClockNode(0, board);

    const btn = screen.getByRole('button', { name: /12h/i });
    expect(btn.hasAttribute('disabled')).toBe(false);
  });

  it('clamps effectiveWindow to 0 when totalMin <= 720 even if viewWindow=1', () => {
    _seq = 0;
    // Single 100-min task — plan fits in window 0
    const board = buildBoard([{ id: 't1', plannedMin: 100 }], { shortBreakMin: 5 });
    // Render with viewWindow=1 (persisted state says window 1)
    renderClockNode(1, board);

    // The task arc should still be visible (clamped to window 0)
    const taskArcs = getTaskArcs();
    expect(taskArcs).toHaveLength(1);
  });

  it('hour labels read 0..11 in window 0', () => {
    _seq = 0;
    const board = buildBoard([{ id: 't1', plannedMin: 60 }]);
    renderClockNode(0, board);

    const labels = Array.from(document.querySelectorAll('svg text')).map((t) => t.textContent);
    expect(labels).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']);
  });

  it('hour labels read 12..23 in window 1', () => {
    _seq = 0;
    // Need totalMin > 720 to avoid defensive clamp forcing window 0
    const tasks = Array.from({ length: 10 }, (_, i) => ({ id: `t${i + 1}`, plannedMin: 80 }));
    const board = buildBoard(tasks, { shortBreakMin: 5, longBreakEvery: 100 });
    renderClockNode(1, board);

    const labels = Array.from(document.querySelectorAll('svg text')).map((t) => t.textContent);
    expect(labels).toEqual(['12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23']);
  });
});
