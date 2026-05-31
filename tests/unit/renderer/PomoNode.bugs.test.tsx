// @vitest-environment jsdom
/**
 * PomoNode component tests — Decision 22.1 bug-fix pass (PR #90 follow-up).
 *
 * Covers UI deliverables:
 *   A1 — gear is to the right of title text
 *   A2 — gear disabled when status is running/paused/break
 *   A4 — clock shows frozen value when paused (reads pausedElapsedMs)
 *   A5 — pip cap: only 8 rendered when pipCount > 8, "+N more" span exists
 *   A6 — session counter shows active task's pomoSessionsCompleted, not global
 *
 * Runs in jsdom to mount the full React component.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { PomoNode } from '../../../src/renderer/components/nodes/PomoNode';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import type { PomoState, PomoConfig } from '../../../src/renderer/components/nodes/PomoNode/types';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';
import type { Node } from '../../../src/shared/types/node';
import type { Board } from '../../../src/shared/types';

afterEach(() => {
  cleanup();
  useBoardStore.setState({ board: null });
});

// ── Factories ─────────────────────────────────────────────────────────────────

function makePomoState(overrides: Partial<PomoState> = {}): PomoState {
  return {
    status: 'idle',
    startedAt: null,
    durationMin: 25,
    breakMin: 5,
    label: '',
    sessionsCompleted: 0,
    activeTaskId: null,
    history: [],
    pausedAt: null,
    pausedElapsedMs: 0,
    sessionWorkSec: 0,
    ...overrides,
  };
}

function makePomoConfig(overrides: Partial<PomoConfig> = {}): PomoConfig {
  return {
    sessionMin: 25,
    shortBreakMin: 5,
    longBreakMin: 15,
    longBreakEvery: 4,
    face: 'lcd',
    ...overrides,
  };
}

function makeTaskState(overrides: Partial<TaskState> = {}): TaskState {
  return {
    text: 'Task A',
    done: false,
    durationMin: 25,
    eta: '~25 min',
    sequenceNumber: 1,
    layer: 0,
    createdAt: '2026-05-13T12:00:00.000Z',
    parentTodoId: 'todo-1',
    parentTaskId: null,
    todoItemId: 'item-1',
    pomoSessionsCompleted: 0,
    plannedMin: 25,
    secondsAccumulated: 0,
    currentSessionElapsedSec: 0,
    kind: 'focus',
    ...overrides,
  };
}

function makePomoNode(
  state: PomoState,
  config: PomoConfig = makePomoConfig(),
): Node<PomoState, PomoConfig> {
  return {
    id: 'pomo-1',
    kind: 'pomo',
    position: { x: 0, y: 0 },
    isMother: true,
    state,
    config,
  };
}

function renderPomoNode(
  state: PomoState,
  config: PomoConfig = makePomoConfig(),
  onCommand: (cmd: string, args?: Record<string, unknown>) => void = vi.fn(),
) {
  const node = makePomoNode(state, config);
  render(
    React.createElement(PomoNode, {
      node,
      selected: false,
      onCommand,
      onSelect: vi.fn(),
      slotIndex: 1,
      slotTotal: 4,
    }),
  );
}

// Seed the board store with a task node so A6 can read pomoSessionsCompleted
function seedBoardWithTask(taskState: TaskState, pomoState: PomoState) {
  const taskNode: Node = {
    id: 'task-1',
    kind: 'todo.task',
    position: { x: 0, y: 420 },
    isMother: false,
    state: taskState,
    config: { showDuration: true },
  };
  const pomoNode: Node = {
    id: 'pomo-1',
    kind: 'pomo',
    position: { x: 0, y: 0 },
    isMother: true,
    state: pomoState,
    config: makePomoConfig(),
  };
  const board: Board = {
    id: 'board-1',
    name: 'test',
    nodes: [pomoNode, taskNode],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: '2026-05-13T12:00:00.000Z',
    updatedAt: '2026-05-13T12:00:00.000Z',
  };
  useBoardStore.setState({ board });
}

// ── A1 — Gear is rendered after (to the right of) the title text ──────────────

describe('A1 — Gear icon is to the right of the header title', () => {
  it('gear button appears after the header label span in DOM order', () => {
    renderPomoNode(makePomoState());
    const header = screen.getByTestId('pomo-header-label');
    const gear = screen.getByTestId('pomo-gear');
    // Both are in the same flex row — compareDocumentPosition FOLLOWING = bit 4
    const pos = header.compareDocumentPosition(gear);
    // Node.DOCUMENT_POSITION_FOLLOWING = 4
    expect(pos & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

// ── A2 — Gear disabled when session is in-flight ──────────────────────────────

describe('A2 — Gear button disabled while session is in-flight', () => {
  it('gear is enabled when status is idle', () => {
    renderPomoNode(makePomoState({ status: 'idle' }));
    const gear = screen.getByTestId('pomo-gear') as HTMLButtonElement;
    expect(gear.disabled).toBe(false);
  });

  it('gear is enabled when status is done', () => {
    renderPomoNode(makePomoState({ status: 'done' }));
    const gear = screen.getByTestId('pomo-gear') as HTMLButtonElement;
    expect(gear.disabled).toBe(false);
  });

  it('gear is disabled when status is running', () => {
    renderPomoNode(makePomoState({ status: 'running', startedAt: new Date().toISOString() }));
    const gear = screen.getByTestId('pomo-gear') as HTMLButtonElement;
    expect(gear.disabled).toBe(true);
  });

  it('gear is disabled when status is paused', () => {
    renderPomoNode(makePomoState({ status: 'paused', pausedElapsedMs: 30_000, pausedAt: new Date().toISOString() }));
    const gear = screen.getByTestId('pomo-gear') as HTMLButtonElement;
    expect(gear.disabled).toBe(true);
  });

  it('gear is disabled when status is break', () => {
    renderPomoNode(makePomoState({ status: 'break', startedAt: new Date().toISOString() }));
    const gear = screen.getByTestId('pomo-gear') as HTMLButtonElement;
    expect(gear.disabled).toBe(true);
  });

  it('disabled gear has title "Stop session to edit settings"', () => {
    renderPomoNode(makePomoState({ status: 'running', startedAt: new Date().toISOString() }));
    const gear = screen.getByTestId('pomo-gear') as HTMLButtonElement;
    expect(gear.title).toBe('Stop session to edit settings');
  });
});

// ── A4 — Clock shows frozen value when paused ─────────────────────────────────

describe('A4 — Clock displays the paused-elapsed value when status is paused', () => {
  it('clock shows 00:30 when pausedElapsedMs=30000 and status=paused', () => {
    // 30 seconds elapsed → remaining = (25*60 - 30) seconds = 1470 s → 24:30
    const pausedElapsedMs = 30_000; // 30s elapsed
    renderPomoNode(makePomoState({
      status: 'paused',
      durationMin: 25,
      pausedElapsedMs,
      pausedAt: new Date().toISOString(),
    }));
    const clock = screen.getByTestId('pomo-clock');
    // remaining = 25*60*1000 - 30000 = 1470000ms = 24 min 30 s → "24:30"
    expect(clock.textContent).toContain('24');
    expect(clock.textContent).toContain('30');
  });

  it('colon animation is none (halted) when status is paused', () => {
    renderPomoNode(makePomoState({
      status: 'paused',
      pausedElapsedMs: 5_000,
      pausedAt: new Date().toISOString(),
    }));
    const colon = screen.getByTestId('pomo-colon');
    expect(colon.style.animation).toBe('none');
  });
});

// ── A5 — Pip cap: at most 8 pips rendered ─────────────────────────────────────

describe('A5 — Pip cap: only 8 pips when pipCount > 8', () => {
  it('renders exactly 8 [data-pip-index] elements when pipCount is 40', () => {
    // plannedMin=40, sessionMin=1 → pipCount=40
    const taskState = makeTaskState({ plannedMin: 40 });
    const pomoState = makePomoState({ activeTaskId: 'task-1' });
    seedBoardWithTask(taskState, pomoState);
    renderPomoNode(pomoState, makePomoConfig({ sessionMin: 1 }));

    const pips = document.querySelectorAll('[data-pip-index]');
    expect(pips.length).toBe(8);
  });

  it('renders a "+N more" span when pipCount > 8', () => {
    const taskState = makeTaskState({ plannedMin: 40 });
    const pomoState = makePomoState({ activeTaskId: 'task-1' });
    seedBoardWithTask(taskState, pomoState);
    renderPomoNode(pomoState, makePomoConfig({ sessionMin: 1 }));

    const overflow = screen.getByTestId('pomo-pips-overflow');
    expect(overflow).toBeTruthy();
    // 40 - 8 = 32 more
    expect(overflow.textContent).toBe('+32 more');
  });

  it('does NOT render overflow span when pipCount <= 8', () => {
    // plannedMin=200, sessionMin=25 → pipCount=8
    const taskState = makeTaskState({ plannedMin: 200 });
    const pomoState = makePomoState({ activeTaskId: 'task-1' });
    seedBoardWithTask(taskState, pomoState);
    renderPomoNode(pomoState, makePomoConfig({ sessionMin: 25 }));

    const pips = document.querySelectorAll('[data-pip-index]');
    expect(pips.length).toBe(8);
    const overflow = document.querySelector('[data-testid="pomo-pips-overflow"]');
    expect(overflow).toBeNull();
  });

  it('session counter still shows the full pipCount (not 8)', () => {
    const taskState = makeTaskState({ plannedMin: 40 });
    const pomoState = makePomoState({ activeTaskId: 'task-1' });
    seedBoardWithTask(taskState, pomoState);
    renderPomoNode(pomoState, makePomoConfig({ sessionMin: 1 }));

    const pips = screen.getByTestId('pomo-pips');
    expect(pips.textContent).toContain('/ 40');
  });
});

// ── A6 — Per-task session counter ─────────────────────────────────────────────

describe('A6 — Session counter shows active task pomoSessionsCompleted', () => {
  it('shows the task pomoSessionsCompleted (3) not the global sessionsCompleted (10)', () => {
    const taskState = makeTaskState({ plannedMin: 100, pomoSessionsCompleted: 3 });
    // Global sessionsCompleted = 10; task counter = 3
    const pomoState = makePomoState({ activeTaskId: 'task-1', sessionsCompleted: 10 });
    seedBoardWithTask(taskState, pomoState);
    renderPomoNode(pomoState, makePomoConfig({ sessionMin: 25 }));

    const pips = screen.getByTestId('pomo-pips');
    // "session 3 / 4"  (100 / 25 = 4 sessions; 3 completed)
    expect(pips.textContent).toContain('session 3');
    expect(pips.textContent).not.toContain('session 10');
  });

  it('shows global sessionsCompleted when not in task mode', () => {
    const pomoState = makePomoState({ activeTaskId: null, sessionsCompleted: 7 });
    // No active task — board has no task linked
    renderPomoNode(pomoState, makePomoConfig());

    const pips = screen.getByTestId('pomo-pips');
    expect(pips.textContent).toContain('session 7');
  });
});
