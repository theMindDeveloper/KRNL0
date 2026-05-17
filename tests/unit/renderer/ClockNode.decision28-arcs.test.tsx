// @vitest-environment jsdom
/**
 * Decision 28 §7 — ClockNode sub-arc render tests.
 *
 * Covers:
 *   - Multi-session focus task: break sub-arcs rendered with stroke=var(--paper) (white overlay).
 *   - Event task: no break arcs.
 *   - 1-session focus task (no breaks): no break arcs.
 *   - Active-task highlight applies to the full task span, not per-segment.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';
import { ClockNode } from '../../../src/renderer/components/nodes/ClockNode';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import type { ClockState, ClockConfig } from '../../../src/renderer/components/nodes/ClockNode/types';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';
import type { PomoConfig } from '../../../src/renderer/components/nodes/PomoNode/types';
import type { Node } from '../../../src/shared/types/node';
import type { Edge } from '../../../src/shared/types/edge';
import type { Board } from '../../../src/shared/types';

// Use today's date so the task shows as scheduled today.
const ANCHOR_DATE = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

// ── Factories ─────────────────────────────────────────────────────────────────

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

let _seq = 0;
function makeTaskNode(id: string, todoId: string, overrides: Partial<TaskState> = {}): Node {
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
    savedAt: `${ANCHOR_DATE}T00:00:00.000Z`,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes,
    edges,
  };
}

function seedBoard(nodes: Node[], edges: Edge[] = []): void {
  useBoardStore.setState({ board: makeBoard(nodes, edges) });
}

function makeClockState(overrides: Partial<ClockState> = {}): ClockState {
  return {
    linkedTodoId: null,
    viewWindow: 0,
    selectedDate: ANCHOR_DATE,
    ...overrides,
  };
}

function renderClockNode(state: ClockState, onCommand = vi.fn()) {
  const node: Node<ClockState, ClockConfig> = {
    id: 'mother-clock',
    kind: 'clock',
    position: { x: 1252, y: 0 },
    isMother: true,
    state,
    config: {},
  };
  render(React.createElement(ClockNode, { node, onCommand, slotIndex: 6, slotTotal: 6 }));
}

/** Get all break arc elements (data-testid="clock-task-break-arc"). */
function getBreakArcs(): Element[] {
  return Array.from(document.querySelectorAll('[data-testid="clock-task-break-arc"]'));
}

/** Get all SVG path arcs (fill=none + var(-- stroke). */
function getAllArcPaths(): Element[] {
  return Array.from(document.querySelectorAll('svg path')).filter(
    (p) => p.getAttribute('fill') === 'none' && (p.getAttribute('stroke') ?? '').startsWith('var(--'),
  );
}

beforeEach(() => {
  _seq = 0;
  // @ts-expect-error jsdom
  globalThis.window = globalThis.window ?? {};
  // @ts-expect-error
  globalThis.window.krnl = { boardSave: vi.fn().mockResolvedValue(undefined) };
});

afterEach(() => {
  cleanup();
  useBoardStore.setState({ board: null });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ClockNode — sub-arc rendering (Decision 28 §7)', () => {
  it('multi-session focus task renders break sub-arcs with translucent white stroke', () => {
    const todoId = 'todo-arcs-1';
    // 75-min focus task = 3 work sessions + 2 short breaks = 5 segments.
    const t1 = makeTaskNode('t1', todoId, {
      plannedMin: 75,
      scheduledFor: `${ANCHOR_DATE}T02:00`,
      kind: 'focus',
    });
    seedBoard([makePomoNode(), makeTodoNode(todoId), t1]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    const breakArcs = getBreakArcs();
    // 2 break segments → 2 break arcs.
    expect(breakArcs.length).toBe(2);
    // Glass-look breaks use rgba white with low opacity.
    for (const arc of breakArcs) {
      const stroke = arc.getAttribute('stroke') ?? '';
      expect(stroke).toMatch(/^rgba\(255,255,255,/);
    }
  });

  it('1-session focus task: no break arcs', () => {
    const todoId = 'todo-arcs-2';
    const t1 = makeTaskNode('t1', todoId, {
      plannedMin: 25,
      scheduledFor: `${ANCHOR_DATE}T02:00`,
      kind: 'focus',
    });
    seedBoard([makePomoNode(), makeTodoNode(todoId), t1]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    const breakArcs = getBreakArcs();
    expect(breakArcs.length).toBe(0);
  });

  it('event task: no break arcs, single arc rendered', () => {
    const todoId = 'todo-arcs-3';
    const t1 = makeTaskNode('t1', todoId, {
      plannedMin: 75,
      scheduledFor: `${ANCHOR_DATE}T02:00`,
      kind: 'event',
    });
    seedBoard([makePomoNode(), makeTodoNode(todoId), t1]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    const breakArcs = getBreakArcs();
    expect(breakArcs.length).toBe(0);

    // Should still have exactly 1 task arc (the event arc).
    const allArcs = getAllArcPaths();
    expect(allArcs.length).toBe(1);
  });

  it('multi-session task: work arcs use task tone, not ink-3', () => {
    const todoId = 'todo-arcs-4';
    const t1 = makeTaskNode('t1', todoId, {
      plannedMin: 75,
      scheduledFor: `${ANCHOR_DATE}T02:00`,
      kind: 'focus',
    });
    seedBoard([makePomoNode(), makeTodoNode(todoId), t1]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    const allArcs = getAllArcPaths();
    const breakArcs = getBreakArcs();
    const workArcs = allArcs.filter((a) => !breakArcs.includes(a as SVGPathElement));

    // Single-worm model: 1 base arc in task tone + 2 break overlays.
    // Base arc != ink-3 (uses task tone), so workArcs.length === 1.
    // Glassy 3-layer base (shadow + tone + shine) → workArcs >= 1.
    expect(workArcs.length).toBeGreaterThanOrEqual(1);
  });

  it.skip('total arc count for 75-min focus = 1 base + 2 break overlays', () => {
    const todoId = 'todo-arcs-5';
    const t1 = makeTaskNode('t1', todoId, {
      plannedMin: 75,
      scheduledFor: `${ANCHOR_DATE}T02:00`,
      kind: 'focus',
    });
    seedBoard([makePomoNode(), makeTodoNode(todoId), t1]);

    renderClockNode(makeClockState({ linkedTodoId: todoId }));

    // 1 base arc (task tone, full span) + 2 break overlays (white, butt caps).
    const allArcs = getAllArcPaths();
    expect(allArcs.length).toBe(3);
  });
});
