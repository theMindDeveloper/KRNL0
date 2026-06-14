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

// #180 — Tasks are events, fully decoupled from the Pomodoro. The kind toggle
// and the START/PAUSE timer controls are removed; nothing loads a task into the
// pomo. (Supersedes the Decision-28 toggle UX.)
describe('#180 — task is fully decoupled from the pomo timer', () => {
  it('no kind-toggle pill is rendered for a focus task', () => {
    renderTaskNode(makeTaskState({ kind: 'focus' }));
    expect(screen.queryByTestId('task-kind-toggle')).toBeNull();
  });

  it('no kind-toggle pill is rendered for an event task', () => {
    renderTaskNode(makeTaskState({ kind: 'event' }));
    expect(screen.queryByTestId('task-kind-toggle')).toBeNull();
  });

  it('no START button is rendered (event task)', () => {
    renderTaskNode(makeTaskState({ kind: 'event', done: false }));
    expect(document.querySelector('[data-testid="task-start-btn"]')).toBeNull();
  });

  it('no START button is rendered (legacy focus task)', () => {
    renderTaskNode(makeTaskState({ kind: 'focus', done: false }));
    expect(document.querySelector('[data-testid="task-start-btn"]')).toBeNull();
  });

  it('no PAUSE button is rendered', () => {
    renderTaskNode(makeTaskState({ kind: 'focus', done: false }));
    expect(document.querySelector('[data-testid="task-pause-btn"]')).toBeNull();
  });

  it('double-click on card body does NOT load a task into pomo', () => {
    const onCommand = vi.fn();
    renderTaskNode(makeTaskState({ kind: 'event' }), onCommand);
    const root = screen.getByTestId('task-node-root');
    fireEvent.doubleClick(root);
    expect(onCommand).not.toHaveBeenCalledWith('task.loadIntoPomo');
  });
});
