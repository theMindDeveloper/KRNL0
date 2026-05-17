// @vitest-environment jsdom
/**
 * Decision 28 §6 — Calendar break-tail render tests.
 *
 * Covers:
 *   - Focus task with breakdown.breakMin > 0: tail DOM exists with correct height ratio.
 *   - Event task: no tail DOM.
 *   - 1-session focus task (breakMin=0): no tail DOM.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';
import { WeekView } from '../../../src/renderer/components/nodes/CalendarNode/WeekView';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import type { CalendarState, CalendarConfig } from '../../../src/renderer/components/nodes/CalendarNode/types';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';
import type { Node } from '../../../src/shared/types/node';
import type { Edge } from '../../../src/shared/types/edge';
import type { Board } from '../../../src/shared/types';
import type { PomoConfig } from '../../../src/renderer/components/nodes/PomoNode/types';

// Use a fixed anchor date for stable placements.
const ANCHOR_DATE = '2026-05-20';
const ANCHOR_ISO = `${ANCHOR_DATE}T10:00`;

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
    savedAt: new Date().toISOString(),
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes,
    edges,
  };
}

function seedBoard(nodes: Node[], edges: Edge[] = []): void {
  useBoardStore.setState({ board: makeBoard(nodes, edges) });
}

function makeCalendarState(): CalendarState {
  return {
    selectedDate: null,
    anchorDate: ANCHOR_DATE,
  };
}

function makeCalendarConfig(): CalendarConfig {
  return {
    hourRange: { start: 0, end: 23 },
    showCompleted: true,
  };
}

function renderWeekView(onCommand = vi.fn()) {
  render(
    React.createElement(WeekView, {
      state: makeCalendarState(),
      config: makeCalendarConfig(),
      onCommand,
    }),
  );
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  _seq = 0;
  // @ts-expect-error jsdom window
  globalThis.window = globalThis.window ?? {};
  // @ts-expect-error
  globalThis.window.krnl = { boardSave: vi.fn().mockResolvedValue(undefined) };
});

afterEach(() => {
  cleanup();
  useBoardStore.setState({ board: null });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WeekView — break tail (Decision 28 §6)', () => {
  it('renders a break tail for a focus task with 75 min (breakMin > 0)', () => {
    const todoId = 'todo-tail-1';
    const t1 = makeTaskNode('t1', todoId, {
      plannedMin: 75,
      scheduledFor: ANCHOR_ISO,
      kind: 'focus',
    });
    seedBoard([makePomoNode(), makeTodoNode(todoId), t1]);
    renderWeekView();

    // breakdownPomoTime(75, 0, {25/5/15/4}) = workMin:75, breakMin:10, effectiveMin:85
    // Tail should be present.
    const tails = document.querySelectorAll('[data-testid="calendar-task-break-tail"]');
    expect(tails.length).toBeGreaterThan(0);

    // Height of tail should be approximately (10/85) ≈ 11.76% of block height.
    const tail = tails[0] as HTMLElement;
    const heightPct = parseFloat(tail.style.height);
    const expectedPct = (10 / 85) * 100;
    expect(Math.abs(heightPct - expectedPct)).toBeLessThan(0.5);
  });

  it('does NOT render a break tail for a focus task with exactly 1 session (breakMin=0)', () => {
    const todoId = 'todo-tail-2';
    const t1 = makeTaskNode('t1', todoId, {
      plannedMin: 25,
      scheduledFor: ANCHOR_ISO,
      kind: 'focus',
    });
    seedBoard([makePomoNode(), makeTodoNode(todoId), t1]);
    renderWeekView();

    const tails = document.querySelectorAll('[data-testid="calendar-task-break-tail"]');
    expect(tails.length).toBe(0);
  });

  it('does NOT render a break tail for an event task', () => {
    const todoId = 'todo-tail-3';
    const t1 = makeTaskNode('t1', todoId, {
      plannedMin: 75,
      scheduledFor: ANCHOR_ISO,
      kind: 'event',
    });
    seedBoard([makePomoNode(), makeTodoNode(todoId), t1]);
    renderWeekView();

    const tails = document.querySelectorAll('[data-testid="calendar-task-break-tail"]');
    expect(tails.length).toBe(0);
  });

  it('break tail has short zone with background var(--paper-3)', () => {
    const todoId = 'todo-tail-4';
    const t1 = makeTaskNode('t1', todoId, {
      plannedMin: 75,
      scheduledFor: ANCHOR_ISO,
      kind: 'focus',
    });
    seedBoard([makePomoNode(), makeTodoNode(todoId), t1]);
    renderWeekView();

    const tail = document.querySelector('[data-testid="calendar-task-break-tail"]') as HTMLElement;
    expect(tail).not.toBeNull();
    // Follow-up: tail wrapper now contains short + long zones (long is distinct).
    const shortZone = tail.querySelector('[data-testid="calendar-task-break-short"]') as HTMLElement;
    expect(shortZone).not.toBeNull();
    expect(shortZone.style.background).toBe('var(--paper-3)');
  });
});
