// @vitest-environment jsdom
/**
 * TaskNode component tests — Decision 22.1 bug-fix pass (PR #90 follow-up).
 *
 * Covers UI deliverables:
 *   B1 — body click dispatches task.loadIntoPomo (not task.startPomo)
 *   B2 — inline ETA edit: double-click shows input, Enter dispatches task.setPlannedMin
 *   B3 — corner timer shows secondsAccumulated + checkpoint when pomo is not running
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { TaskNode } from '../../../src/renderer/components/nodes/TaskNode';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';
import type { Node } from '../../../src/shared/types/node';

afterEach(() => cleanup());

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeTaskState(overrides: Partial<TaskState> = {}): TaskState {
  return {
    text: 'test task',
    done: false,
    tag: 'dev',
    durationMin: 25,
    eta: '~25 min',
    sequenceNumber: 1,
    layer: 0,
    createdAt: '2026-05-13T10:00:00.000Z',
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

function makeTaskNode(state: TaskState): Node<TaskState, { showDuration: boolean }> {
  return {
    id: 'task-1',
    kind: 'todo.task',
    position: { x: 0, y: 0 },
    isMother: false,
    state,
    config: { showDuration: true },
  };
}

function renderTaskNode(
  state: TaskState,
  onCommand: (cmd: string, args?: Record<string, unknown>) => void = vi.fn(),
) {
  const node = makeTaskNode(state);
  render(
    React.createElement(TaskNode, {
      node,
      selected: false,
      onCommand,
      onSelect: vi.fn(),
    }),
  );
}

// ── B1 — Body double-click dispatches task.loadIntoPomo ──────────────────────
// Single click is reserved for RF selection (so users can move / marquee /
// connect freely). Pomo refresh is gated behind an explicit double-click.

describe('B1 — Body double-click dispatches task.loadIntoPomo', () => {
  it('double-clicking the root body fires task.loadIntoPomo when not done', () => {
    const onCommand = vi.fn();
    renderTaskNode(makeTaskState({ done: false }), onCommand);
    const root = screen.getByTestId('task-node-root');
    fireEvent.doubleClick(root);
    expect(onCommand).toHaveBeenCalledWith('task.loadIntoPomo');
  });

  it('does NOT fire task.loadIntoPomo when done = true', () => {
    const onCommand = vi.fn();
    renderTaskNode(makeTaskState({ done: true }), onCommand);
    const root = screen.getByTestId('task-node-root');
    fireEvent.doubleClick(root);
    expect(onCommand).not.toHaveBeenCalledWith('task.loadIntoPomo');
  });

  it('single click does NOT fire task.loadIntoPomo (selection only)', () => {
    const onCommand = vi.fn();
    renderTaskNode(makeTaskState({ done: false }), onCommand);
    const root = screen.getByTestId('task-node-root');
    fireEvent.click(root);
    expect(onCommand).not.toHaveBeenCalledWith('task.loadIntoPomo');
  });

  it('START button dispatches task.startPomo (not task.loadIntoPomo) — Decision 22.2', () => {
    // The old .task-pomo-btn was replaced. The new task-start-btn dispatches
    // task.startPomo (same auto-start path). task.spawnPomo is still handled
    // by the dispatcher for sys CLI use but the UI no longer dispatches it.
    const onCommand = vi.fn();
    renderTaskNode(makeTaskState({ done: false }), onCommand);
    const startBtn = screen.getByTestId('task-start-btn') as HTMLElement;
    fireEvent.click(startBtn);
    expect(onCommand).toHaveBeenCalledWith('task.startPomo');
    expect(onCommand).not.toHaveBeenCalledWith('task.loadIntoPomo');
  });
});

// ── B2 — Inline ETA edit ──────────────────────────────────────────────────────

describe('B2 — Inline ETA edit', () => {
  it('double-clicking the ETA span shows a number input', () => {
    renderTaskNode(makeTaskState({ plannedMin: 30 }));
    const eta = document.querySelector('.task-eta') as HTMLElement;
    expect(eta).not.toBeNull();
    fireEvent.dblClick(eta);
    const input = document.querySelector('input[type="number"]') as HTMLInputElement;
    expect(input).not.toBeNull();
  });

  it('ETA input is pre-filled with current plannedMin', () => {
    renderTaskNode(makeTaskState({ plannedMin: 45 }));
    const eta = document.querySelector('.task-eta') as HTMLElement;
    fireEvent.dblClick(eta);
    const input = document.querySelector('input[type="number"]') as HTMLInputElement;
    expect(input.value).toBe('45');
  });

  it('Enter dispatches task.setPlannedMin with the new minutes', () => {
    const onCommand = vi.fn();
    renderTaskNode(makeTaskState({ plannedMin: 25 }), onCommand);
    const eta = document.querySelector('.task-eta') as HTMLElement;
    fireEvent.dblClick(eta);
    const input = document.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '60' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommand).toHaveBeenCalledWith('task.setPlannedMin', { minutes: 60 });
  });

  it('ESC cancels without dispatching task.setPlannedMin', () => {
    const onCommand = vi.fn();
    renderTaskNode(makeTaskState({ plannedMin: 25 }), onCommand);
    const eta = document.querySelector('.task-eta') as HTMLElement;
    fireEvent.dblClick(eta);
    const input = document.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '99' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCommand).not.toHaveBeenCalledWith('task.setPlannedMin', expect.anything());
    // Input should be gone
    expect(document.querySelector('input[type="number"]')).toBeNull();
  });

  it('clamps the value to at least 1 before dispatching', () => {
    const onCommand = vi.fn();
    renderTaskNode(makeTaskState({ plannedMin: 25 }), onCommand);
    const eta = document.querySelector('.task-eta') as HTMLElement;
    fireEvent.dblClick(eta);
    const input = document.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommand).toHaveBeenCalledWith('task.setPlannedMin', { minutes: 1 });
  });

  it('ETA span shows live plannedMin value (not stale eta string)', () => {
    renderTaskNode(makeTaskState({ plannedMin: 60, durationMin: 25, eta: '~25 min' }));
    const eta = document.querySelector('.task-eta') as HTMLElement;
    // plannedMin=60 wins over eta='~25 min'
    expect(eta?.textContent).toBe('~60 min');
  });
});

// ── B3 — Corner timer shows frozen elapsed when pomo is not running ───────────

describe('B3 — Corner timer shows secondsAccumulated + checkpoint when not running', () => {
  it('timer shows 00:30 when secondsAccumulated=30 and pomo is not running', () => {
    renderTaskNode(makeTaskState({
      secondsAccumulated: 30,
      currentSessionElapsedSec: 0,
    }));
    const timer = screen.getByTestId('task-corner-timer');
    expect(timer.textContent).toBe('00:30');
  });

  it('timer shows 01:30 when secondsAccumulated=60 and checkpoint=30', () => {
    renderTaskNode(makeTaskState({
      secondsAccumulated: 60,
      currentSessionElapsedSec: 30,
    }));
    const timer = screen.getByTestId('task-corner-timer');
    // 60 + 30 = 90 seconds = 01:30
    expect(timer.textContent).toBe('01:30');
  });

  it('timer is not shown when elapsedSec=0 and task is not active', () => {
    renderTaskNode(makeTaskState({
      secondsAccumulated: 0,
      currentSessionElapsedSec: 0,
    }));
    const timer = document.querySelector('[data-testid="task-corner-timer"]');
    expect(timer).toBeNull();
  });
});
