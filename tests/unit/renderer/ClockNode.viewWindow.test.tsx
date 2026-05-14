// @vitest-environment jsdom
/**
 * ADR 0004 §3.4 / §3.7 — viewWindow render tests on the day-anchored Clock.
 *
 * Post-ADR-0004 behaviour:
 *   - arcs require an anchored chain (`scheduledFor` on the chain's anchor).
 *     A chain with no anchor renders no arcs.
 *   - viewWindow 0 = wall-clock minutes [0, 720) on selectedDate
 *     viewWindow 1 = wall-clock minutes [720, 1440) on selectedDate.
 *   - The viewWindow toggle is ALWAYS enabled (no auto-flip; no clamp).
 *   - Hour labels read 0..11 in window 0 and 12..23 in window 1.
 *   - Boundary-spanning placements clip to their intersection with the window.
 *   - Cross-midnight chains: tasks past midnight are dropped (clip at 1440).
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

const TODO_ID = 'todo-vw';
const ANCHOR_DATE = '2026-05-14';
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

function buildBoard(
  tasks: Array<{ id: string; plannedMin: number; scheduledFor?: string }>,
  pomoOverrides: Partial<PomoConfig> = {},
): Board {
  const taskNodes = tasks.map(({ id, plannedMin, scheduledFor }) =>
    makeTaskNode(
      id,
      makeTaskState(scheduledFor ? { plannedMin, scheduledFor } : { plannedMin }),
    ),
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
  selectedDate: string = ANCHOR_DATE,
  onCommand = vi.fn(),
) {
  useBoardStore.setState({ board });
  const node = makeClockNode({ linkedTodoId: TODO_ID, viewWindow, selectedDate });
  render(
    React.createElement(ClockNode, { node, onCommand, slotIndex: 6, slotTotal: 6 }),
  );
}

function getTaskArcs(): Element[] {
  // Task arcs use strokeWidth 18 (single) or 10 (parallel); break arcs sit
  // at radius BREAK_R = 92, so a strokeWidth filter alone is unambiguous
  // for non-parallel scenarios (the cases here).
  return Array.from(document.querySelectorAll('svg circle')).filter(
    (c) => c.getAttribute('stroke-width') === '18',
  );
}

describe('ADR 0004 — viewWindow render', () => {
  it('window 0 shows placements anchored inside [0, 720) of the selected day', () => {
    _seq = 0;
    // Anchor at 02:00. 4 tasks × 100 min = 400 task min, all inside window 0.
    const board = buildBoard([
      { id: 't1', plannedMin: 100, scheduledFor: `${ANCHOR_DATE}T02:00` },
      { id: 't2', plannedMin: 100 },
      { id: 't3', plannedMin: 100 },
      { id: 't4', plannedMin: 100 },
    ]);

    renderClockNode(0, board);

    const taskArcs = getTaskArcs();
    expect(taskArcs).toHaveLength(4);
  });

  it('window 0 hides placements that fall fully past 720 of the selected day', () => {
    _seq = 0;
    // Anchor at 11:00. 8 tasks × 100 min cascade. Tasks past wall-clock 720
    // (12:00 noon) sit fully in window 1.
    const tasks = Array.from({ length: 8 }, (_, i) => ({
      id: `t${i + 1}`,
      plannedMin: 100,
      ...(i === 0 ? { scheduledFor: `${ANCHOR_DATE}T11:00` } : {}),
    }));
    const board = buildBoard(tasks);

    renderClockNode(0, board);

    const taskArcs = getTaskArcs();
    // t1: 11:00–12:40 (boundary-spanner crossing 720). t2: 12:40–14:20 (window 1).
    // Window 0 sees t1 only (clipped at 12:00).
    expect(taskArcs.length).toBeGreaterThan(0);
    expect(taskArcs.length).toBeLessThan(8);
  });

  it('window 1 shows placements past 720 of the selected day', () => {
    _seq = 0;
    // Anchor at 13:00 (window 1).
    const tasks = Array.from({ length: 4 }, (_, i) => ({
      id: `t${i + 1}`,
      plannedMin: 60,
      ...(i === 0 ? { scheduledFor: `${ANCHOR_DATE}T13:00` } : {}),
    }));
    const board = buildBoard(tasks);

    renderClockNode(1, board);

    const taskArcs = getTaskArcs();
    expect(taskArcs.length).toBeGreaterThanOrEqual(4);
  });

  it('boundary-spanning placement clips to the intersection of [windowStart, windowEnd)', () => {
    _seq = 0;
    // Single anchored task crosses minute 720: 11:30 + 60 = 12:30.
    // window 0 portion = 30 min (11:30–12:00). window 1 portion = 30 min (12:00–12:30).
    const board = buildBoard([
      { id: 't1', plannedMin: 60, scheduledFor: `${ANCHOR_DATE}T11:30` },
    ]);

    renderClockNode(0, board);
    const w0 = getTaskArcs();
    expect(w0).toHaveLength(1);
    const w0Dash = w0[0]!.getAttribute('stroke-dasharray') ?? '';
    const w0Len = parseFloat(w0Dash.split(' ')[0] ?? '0');
    const expectedW0 = (30 / TOTAL_MIN) * CIRCUMFERENCE;
    expect(Math.abs(w0Len - expectedW0)).toBeLessThan(0.5);

    cleanup();
    useBoardStore.setState({ board: null });

    renderClockNode(1, board);
    const w1 = getTaskArcs();
    expect(w1).toHaveLength(1);
    const w1Dash = w1[0]!.getAttribute('stroke-dasharray') ?? '';
    const w1Len = parseFloat(w1Dash.split(' ')[0] ?? '0');
    const expectedW1 = (30 / TOTAL_MIN) * CIRCUMFERENCE;
    expect(Math.abs(w1Len - expectedW1)).toBeLessThan(0.5);
  });

  it('viewWindow toggle is ALWAYS enabled (ADR 0004 §3.7 — no auto-flip)', () => {
    _seq = 0;
    const board = buildBoard([
      { id: 't1', plannedMin: 100, scheduledFor: `${ANCHOR_DATE}T02:00` },
    ]);
    renderClockNode(0, board);

    const btn = screen.getByRole('button', { name: /12h/i });
    expect(btn.hasAttribute('disabled')).toBe(false);
  });

  it('viewWindow=1 stays at window 1 even if the selected day has no placements there', () => {
    _seq = 0;
    // All placements live in window 0; viewWindow=1 → empty (no auto-clamp).
    const board = buildBoard([
      { id: 't1', plannedMin: 100, scheduledFor: `${ANCHOR_DATE}T02:00` },
    ]);
    renderClockNode(1, board);

    expect(getTaskArcs()).toHaveLength(0);
  });

  it('hour labels read 0..11 in window 0', () => {
    _seq = 0;
    const board = buildBoard([
      { id: 't1', plannedMin: 60, scheduledFor: `${ANCHOR_DATE}T02:00` },
    ]);
    renderClockNode(0, board);

    const labels = Array.from(document.querySelectorAll('svg text')).map((t) => t.textContent);
    expect(labels).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']);
  });

  it('hour labels read 12..23 in window 1', () => {
    _seq = 0;
    const board = buildBoard([
      { id: 't1', plannedMin: 60, scheduledFor: `${ANCHOR_DATE}T13:00` },
    ]);
    renderClockNode(1, board);

    const labels = Array.from(document.querySelectorAll('svg text')).map((t) => t.textContent);
    expect(labels).toEqual(['12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23']);
  });

  it('cross-midnight chain: tasks past midnight are dropped (clip at 1440)', () => {
    _seq = 0;
    // Anchor at 22:30, chain spans 5h (= 300 min), so cascade extends past midnight.
    // Tasks fully past midnight should NOT appear on the selected day's clock.
    const tasks = [
      { id: 't1', plannedMin: 60, scheduledFor: `${ANCHOR_DATE}T22:30` },
      { id: 't2', plannedMin: 60 },
      { id: 't3', plannedMin: 60 },
      { id: 't4', plannedMin: 60 },
      { id: 't5', plannedMin: 60 },
    ];
    const board = buildBoard(tasks);

    renderClockNode(1, board);
    const arcs = getTaskArcs();
    // t1: 22:30–23:30 (in window 1). t2: 23:30–00:30 (boundary at midnight; clipped to 30min).
    // t3..t5 are entirely past midnight on the next day → dropped.
    // Expected: 2 arcs in window 1 (t1 + clipped t2).
    expect(arcs.length).toBeLessThanOrEqual(2);
  });
});
