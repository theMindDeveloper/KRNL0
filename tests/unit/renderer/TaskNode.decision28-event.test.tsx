// @vitest-environment jsdom
/**
 * Decision 28 §10 item 5 — UX gates for event-kind tasks.
 *
 * Tests:
 *   - kind='event' task: START button absent
 *   - kind='event' task: double-click on body fires no command
 *   - toggle icon is present with data-testid="task-kind-toggle"
 *   - toggle icon dispatches task.toggleKind
 *   - kind='focus' task: START button present (regression guard)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';

import { TaskNode } from '../../../src/renderer/components/nodes/TaskNode';
import type { Node } from '../../../src/shared/types/node';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';
import { useBoardStore } from '../../../src/renderer/store/boardStore';

afterEach(() => cleanup());

beforeEach(() => {
  // Provide a minimal board so useBoardStore selectors in TaskNode
  // (pomoRuntime, selectTaskChain) don't throw on null board.
  useBoardStore.setState({
    board: {
      version: 1,
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [],
      edges: [],
    },
    viewport: { x: 0, y: 0, zoom: 1 },
  });
});

function makeTaskState(overrides: Partial<TaskState> = {}): TaskState {
  return {
    text: 'test task',
    done: false,
    durationMin: 25,
    eta: '~25 min',
    sequenceNumber: 1,
    layer: 0,
    createdAt: '2026-05-16T10:00:00.000Z',
    parentTodoId: 'todo-1',
    parentTaskId: null,
    todoItemId: null,
    pomoSessionsCompleted: 0,
    plannedMin: 25,
    secondsAccumulated: 0,
    currentSessionElapsedSec: 0,
    kind: 'focus',
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

describe('Decision 28 — event-kind UX gates', () => {
  // ── Toggle button presence ─────────────────────────────────────────────────

  it('toggle icon button is present with data-testid="task-kind-toggle" for focus task', () => {
    renderTaskNode(makeTaskState({ kind: 'focus' }));
    const btn = screen.getByTestId('task-kind-toggle');
    expect(btn).not.toBeNull();
    expect(btn.tagName.toLowerCase()).toBe('button');
  });

  it('toggle icon button is present with data-testid="task-kind-toggle" for event task', () => {
    renderTaskNode(makeTaskState({ kind: 'event' }));
    const btn = screen.getByTestId('task-kind-toggle');
    expect(btn).not.toBeNull();
    expect(btn.tagName.toLowerCase()).toBe('button');
  });

  it('toggle button shows 🍅 when kind=focus', () => {
    renderTaskNode(makeTaskState({ kind: 'focus' }));
    const btn = screen.getByTestId('task-kind-toggle');
    expect(btn.textContent).toContain('🍅');
  });

  it('toggle button shows 🍞 when kind=event', () => {
    renderTaskNode(makeTaskState({ kind: 'event' }));
    const btn = screen.getByTestId('task-kind-toggle');
    expect(btn.textContent).toContain('🍞');
  });

  it('toggle button has aria-label "Toggle to event" when kind=focus', () => {
    renderTaskNode(makeTaskState({ kind: 'focus' }));
    const btn = screen.getByTestId('task-kind-toggle');
    expect(btn.getAttribute('aria-label')).toBe('Toggle to event');
  });

  it('toggle button has aria-label "Toggle to focus" when kind=event', () => {
    renderTaskNode(makeTaskState({ kind: 'event' }));
    const btn = screen.getByTestId('task-kind-toggle');
    expect(btn.getAttribute('aria-label')).toBe('Toggle to focus');
  });

  it('clicking toggle button dispatches task.toggleKind', () => {
    const onCommand = vi.fn();
    renderTaskNode(makeTaskState({ kind: 'focus' }), onCommand);
    const btn = screen.getByTestId('task-kind-toggle');
    fireEvent.click(btn);
    expect(onCommand).toHaveBeenCalledWith('task.toggleKind');
  });

  // ── Event-kind UX gates ────────────────────────────────────────────────────

  // Follow-up to Decision 28: events DO show START/PAUSE and DO load into pomo
  // (as a single big session, no breaks). The pomo handles the kind difference.
  it('START button is present when kind=event and task is not done', () => {
    renderTaskNode(makeTaskState({ kind: 'event', done: false }));
    const btn = document.querySelector('[data-testid="task-start-btn"]');
    expect(btn).not.toBeNull();
  });

  it('double-click on card body loads event task into pomo', () => {
    const onCommand = vi.fn();
    renderTaskNode(makeTaskState({ kind: 'event' }), onCommand);
    const root = screen.getByTestId('task-node-root');
    fireEvent.doubleClick(root);
    expect(onCommand).toHaveBeenCalledWith('task.loadIntoPomo');
  });

  // ── Focus-kind regression guard ────────────────────────────────────────────

  it('START button is present when kind=focus and task is not done', () => {
    renderTaskNode(makeTaskState({ kind: 'focus', done: false }));
    const btn = screen.getByTestId('task-start-btn');
    expect(btn).not.toBeNull();
  });
});
