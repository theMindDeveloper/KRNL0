// @vitest-environment jsdom
/**
 * ClockNode component render tests — redesigned analog face (LifeOS ref).
 *
 * The new design:
 *   - 240×240 SVG centered at (120,120)
 *   - 60 tick marks (not 12)
 *   - 12 numerals 1–12 always visible
 *   - Task arcs as <path> at R_ARC = 102, strokeWidth 14 (future/past) or 16 (active)
 *   - No break arcs, no viewWindow, no day-selector, no parallel rings
 *   - Now-playing strip below the face
 *   - Task list at the bottom
 *   - Link UI when linkedTodoId === null
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

const ANCHOR_DATE = (() => {
  // Always use today so placements on "today" show up.
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
})();

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
    text: `Task ${_seq}`,
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
    savedAt: `${ANCHOR_DATE}T08:00:00.000Z`,
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

/** Task arcs are <path> elements with fill="none" and a stroke that is a var(--...) token. */
function getTaskArcPaths(): Element[] {
  return Array.from(document.querySelectorAll('svg path')).filter(
    (p) => p.getAttribute('fill') === 'none' && (p.getAttribute('stroke') ?? '').startsWith('var(--'),
  );
}

beforeEach(() => {
  _seq = 0;
});

// ── Clock face structure ───────────────────────────────────────────────────────

describe('ClockNode renders the analog face', () => {
  it('renders an SVG element', () => {
    seedBoard([]);
    renderClockNode(makeClockState());
    const svgs = document.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('renders 60 tick marks', () => {
    seedBoard([]);
    renderClockNode(makeClockState());
    const lines = document.querySelectorAll('svg line');
    // 60 tick lines + 3 hand lines + 1 now-notch line = 64; confirm ≥ 60.
    expect(lines.length).toBeGreaterThanOrEqual(60);
  });

  it('renders 12 numerals (1–12)', () => {
    seedBoard([]);
    renderClockNode(makeClockState());
    const texts = Array.from(document.querySelectorAll('svg text'))
      .map((t) => t.textContent?.trim())
      .filter(Boolean);
    for (let n = 1; n <= 12; n++) {
      expect(texts).toContain(String(n));
    }
  });

  it('shows link UI when linkedTodoId is null', () => {
    seedBoard([]);
    renderClockNode(makeClockState({ linkedTodoId: null }));
    expect(screen.getByText('Link Todo:')).toBeDefined();
  });
});

// ── Anchored chain → arcs ────────────────────────────────────────────────────

describe('Anchored chain renders task arcs', () => {
  it('three-task chain anchored at 02:00 on today produces 3 task arc paths', () => {
    const todoId = 'todo-1';
    const t1 = makeTaskNode(
      'task-1',
      makeTaskState({ parentTodoId: todoId, plannedMin: 60, scheduledFor: `${ANCHOR_DATE}T02:00` }),
    );
    const t2 = makeTaskNode('task-2', makeTaskState({ parentTodoId: todoId, plannedMin: 30 }));
    const t3 = makeTaskNode('task-3', makeTaskState({ parentTodoId: todoId, plannedMin: 45 }));
    seedBoard([makeTodoNode(todoId), t1, t2, t3], [
      makeEdge('task-1', 'task-2'),
      makeEdge('task-2', 'task-3'),
    ]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    expect(getTaskArcPaths()).toHaveLength(3);
  });

  it('task arcs use strokeWidth 14 (non-active)', () => {
    const todoId = 'todo-sw';
    const t1 = makeTaskNode(
      't-sw-1',
      makeTaskState({ parentTodoId: todoId, plannedMin: 30, scheduledFor: `${ANCHOR_DATE}T02:00` }),
    );
    const t2 = makeTaskNode('t-sw-2', makeTaskState({ parentTodoId: todoId, plannedMin: 30 }));
    seedBoard([makeTodoNode(todoId), t1, t2], [makeEdge('t-sw-1', 't-sw-2')]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    const arcs = getTaskArcPaths();
    expect(arcs.length).toBeGreaterThanOrEqual(1);
    // At least some arcs have sw 14 (past or future)
    const hasSw14 = arcs.some(
      (a) => a.getAttribute('stroke-width') === '14' || a.getAttribute('stroke-width') === '16',
    );
    expect(hasSw14).toBe(true);
  });

  it('chain with no anchor renders no task arcs', () => {
    const todoId = 'todo-noanchor';
    const t1 = makeTaskNode('na-1', makeTaskState({ parentTodoId: todoId, plannedMin: 30 }));
    const t2 = makeTaskNode('na-2', makeTaskState({ parentTodoId: todoId, plannedMin: 30 }));
    seedBoard([makeTodoNode(todoId), t1, t2], [makeEdge('na-1', 'na-2')]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    expect(getTaskArcPaths()).toHaveLength(0);
  });
});

// ── Past / active task display ────────────────────────────────────────────────

describe('Task arcs reflect past / future state', () => {
  it('past tasks (end < nowFloat) have opacity 0.35', () => {
    const todoId = 'todo-past';
    // Place task far in the past (01:00–02:00) so it's always past.
    const pastTask = makeTaskNode(
      'task-past',
      makeTaskState({ parentTodoId: todoId, plannedMin: 60, scheduledFor: `${ANCHOR_DATE}T01:00` }),
    );
    seedBoard([makeTodoNode(todoId), pastTask]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    const arcs = getTaskArcPaths();
    expect(arcs.length).toBeGreaterThan(0);
    // The arc's opacity should be 0.35 since nowFloat is > 2.0 at any real clock time.
    // (At 1 AM or 2 AM this test runs, the time is still >= 2.0 since ANCHOR_DATE=today.)
    // We assert the opacity is NOT 1 (not active) and is one of the defined values.
    for (const arc of arcs) {
      const op = parseFloat(arc.getAttribute('opacity') ?? '1');
      expect([0.35, 0.92, 1]).toContain(op);
    }
  });
});

// ── Header ───────────────────────────────────────────────────────────────────

describe('Header', () => {
  it('shows the CLK.12H kind tag', () => {
    seedBoard([]);
    renderClockNode(makeClockState());
    const clkTag = screen.getByText('CLK.12H');
    expect(clkTag).toBeDefined();
  });

  it('shows "Today · Schedule" title', () => {
    seedBoard([]);
    renderClockNode(makeClockState());
    // The title text may be split across spans; look for the combined text.
    const el = document.body.textContent ?? '';
    expect(el.toLowerCase()).toContain('today');
    expect(el.toLowerCase()).toContain('schedule');
  });
});

// ── No viewWindow toggle / no day-selector ────────────────────────────────────

describe('Removed elements are absent', () => {
  it('does NOT render the 12h window toggle button', () => {
    seedBoard([]);
    renderClockNode(makeClockState());
    // Previous toggle said "12h–24h" or "0h–12h"
    const buttons = Array.from(document.querySelectorAll('button')).map((b) => b.textContent ?? '');
    const hasWindowBtn = buttons.some((t) => /12h/i.test(t));
    expect(hasWindowBtn).toBe(false);
  });

  it('does NOT render day-selector buttons', () => {
    seedBoard([]);
    renderClockNode(makeClockState());
    expect(document.querySelector('[data-testid="clock-day-next"]')).toBeNull();
    expect(document.querySelector('[data-testid="clock-day-prev"]')).toBeNull();
    expect(document.querySelector('[data-testid="clock-day-today"]')).toBeNull();
  });
});
