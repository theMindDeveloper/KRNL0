// @vitest-environment jsdom
/**
 * TaskNode Gherkin scenario tests — Issues #40
 * Source: docs/06-requirements/task-node.md
 *
 * The "environment: node" global config is overridden per-file here via the
 * pragma above so we can use jsdom and @testing-library/react.
 *
 * F6/F7 (RF handle presence) are tested through createNodeAdapter(TaskNode)
 * to honour the constraint "DO NOT add Handle imports to the component body."
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// Clean up jsdom between each test so elements don't bleed across scenarios.
afterEach(() => cleanup());
import React from 'react';

import { TaskNode } from '../../../src/renderer/components/nodes/TaskNode';
import { createNodeAdapter } from '../../../src/renderer/components/Canvas/rfAdapters';
import type { Node } from '../../../src/shared/types/node';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** Background: sequenceNumber=3, layer=1, tag="deep", eta="~45 min", done=false */
function makeTaskState(overrides: Partial<TaskState> = {}): TaskState {
  return {
    text: 'test task',
    done: false,
    tag: 'deep',
    durationMin: 45,
    eta: '~45 min',
    sequenceNumber: 3,
    layer: 1,
    createdAt: '2026-05-10T10:00:00.000Z',
    parentTodoId: 'todo-1',
    parentTaskId: null,
    todoItemId: null,
    pomoSessionsCompleted: 0,
    plannedMin: 45,
    secondsAccumulated: 0,
    currentSessionElapsedSec: 0,
    kind: 'focus',
    ...overrides,
  };
}

function makeTaskNode(
  state: TaskState,
): Node<TaskState, { showDuration: boolean }> {
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
    })
  );
}

// ─────────────────────────────────────────────────────────────────────────────

describe('TaskNode Gherkin scenarios (Issue #40)', () => {

  // ── F1 — One card shape (task-node.md F1, revised) ─────────────────────
  describe('F1 — one card shape, no internal numbering', () => {
    it('shows no "#NN · L" header — the sequence and layer are not user information', () => {
      renderTaskNode(makeTaskState());
      expect(screen.queryByTestId('task-header')).toBeNull();
      expect(screen.getByTestId('task-node-root').textContent).not.toMatch(/#0\d|L\d/);
    });

    it('open and done cards have the same 220 px frame and a meter as the last row', () => {
      renderTaskNode(makeTaskState({ done: false }));
      const open = screen.getByTestId('task-node-root') as HTMLElement;
      expect(open.style.width).toBe('220px');
      expect(open.style.minHeight).toBe('120px');
      expect(screen.getByTestId('task-meter')).toBeTruthy();
    });

    it('the drag-to-Calendar action sits in the title row', () => {
      renderTaskNode(makeTaskState());
      expect(screen.getByTestId('task-calendar-grip').getAttribute('title')).toContain('Calendar');
    });
  });

  // ── F2 — #180: tasks have no pomo timer controls ─────────────────────────
  // The Pomodoro is an independent observer. Tasks are events and carry no
  // START/PAUSE buttons and no kind toggle.
  describe('F2 — #180 task carries no pomo timer controls', () => {
    it('no START button is rendered', () => {
      const onCommand = vi.fn();
      renderTaskNode(makeTaskState({ done: false }), onCommand);
      expect(screen.queryByTestId('task-start-btn')).toBeNull();
    });

    it('no PAUSE button is rendered', () => {
      const onCommand = vi.fn();
      renderTaskNode(makeTaskState({ done: false }), onCommand);
      expect(screen.queryByTestId('task-pause-btn')).toBeNull();
    });

    it('no kind-toggle pill is rendered', () => {
      renderTaskNode(makeTaskState({ done: false }));
      expect(screen.queryByTestId('task-kind-toggle')).toBeNull();
    });

    it('.task-pomo-btn no longer exists (old button removed)', () => {
      renderTaskNode(makeTaskState({ done: false }));
      const oldBtn = document.querySelector('.task-pomo-btn');
      expect(oldBtn).toBeNull();
    });
  });

  // ── F3 — Checkbox dispatches task.toggle ─────────────────────────────────
  describe('F3 — Checkbox dispatches task.toggle', () => {
    it('calls onCommand with task.toggle when checkbox is clicked', () => {
      const onCommand = vi.fn();
      renderTaskNode(makeTaskState(), onCommand);
      const checkbox = document.querySelector('.task-check') as HTMLElement;
      expect(checkbox).not.toBeNull();
      fireEvent.click(checkbox);
      expect(onCommand).toHaveBeenCalledWith('task.toggle');
    });
  });

  // ── F4 — Done state styling ───────────────────────────────────────────────
  describe('F4 — Done state styling', () => {
    it('node root has class "done" when done is true', () => {
      renderTaskNode(makeTaskState({ done: true }));
      const root = screen.getByTestId('task-node-root');
      expect(root.classList.contains('done')).toBe(true);
    });

    it('a done task shows the done card with its title (engagement.md F2)', () => {
      renderTaskNode(makeTaskState({ done: true, text: 'write report' }));
      const text = document.querySelector('.task-text') as HTMLElement;
      expect(text.textContent).toBe('write report');
      expect(screen.getByTestId('task-node-root').dataset.doneCard).toBe('true');
    });

    it('node root does not have class "done" when done is false', () => {
      renderTaskNode(makeTaskState({ done: false }));
      const root = screen.getByTestId('task-node-root');
      expect(root.classList.contains('done')).toBe(false);
    });
  });

  // ── F4b — #180: no timer buttons regardless of done state ────────────────
  describe('F4b — #180 no START/PAUSE buttons in any state', () => {
    it('no task-start-btn when done is true', () => {
      renderTaskNode(makeTaskState({ done: true }));
      expect(document.querySelector('[data-testid="task-start-btn"]')).toBeNull();
    });

    it('no task-start-btn when done is false (events are not timer-driven)', () => {
      renderTaskNode(makeTaskState({ done: false }));
      expect(document.querySelector('[data-testid="task-start-btn"]')).toBeNull();
      expect(document.querySelector('[data-testid="task-pause-btn"]')).toBeNull();
    });
  });

  // ── F5 — Footer tag and ETA ───────────────────────────────────────────────
  describe('F5 — Footer tag and ETA', () => {
    it('footer contains a tag element reading "deep"', () => {
      renderTaskNode(makeTaskState());
      const tag = document.querySelector('.task-tag');
      expect(tag).not.toBeNull();
      expect(tag?.textContent).toBe('deep');
    });

    it('the meter shows the estimate ("45m"), double-click to change', () => {
      renderTaskNode(makeTaskState());
      const eta = document.querySelector('.task-eta');
      expect(eta).not.toBeNull();
      expect(eta?.textContent).toBe('45m');
      expect(eta?.getAttribute('title')).toContain('double-click');
    });
  });

  // ── F6 — RF target handle rendered (via adapter) ──────────────────────────
  describe('F6 — RF target handle is rendered by the adapter', () => {
    it('adapter wraps TaskNode with a target-left handle', () => {
      const AdaptedTask = createNodeAdapter(TaskNode);
      const state = makeTaskState();
      const rfProps = {
        id: 'task-1',
        type: 'todo.task',
        data: {
          node: makeTaskNode(state),
          onCommand: vi.fn(),
          onSelect: vi.fn(),
        },
        selected: false,
        dragging: false,
        zIndex: 1,
        isConnectable: true,
        positionAbsoluteX: 0,
        positionAbsoluteY: 0,
      };
      render(React.createElement(AdaptedTask as React.ComponentType<typeof rfProps>, rfProps));
      const handle = document.querySelector('[data-handle-type="target"][data-handle-position="left"]');
      expect(handle).not.toBeNull();
    });
  });

  // ── F7 — RF source handle rendered (via adapter) ──────────────────────────
  describe('F7 — RF source handle is rendered by the adapter', () => {
    it('adapter wraps TaskNode with a source-right handle', () => {
      const AdaptedTask = createNodeAdapter(TaskNode);
      const state = makeTaskState();
      const rfProps = {
        id: 'task-1',
        type: 'todo.task',
        data: {
          node: makeTaskNode(state),
          onCommand: vi.fn(),
          onSelect: vi.fn(),
        },
        selected: false,
        dragging: false,
        zIndex: 1,
        isConnectable: true,
        positionAbsoluteX: 0,
        positionAbsoluteY: 0,
      };
      render(React.createElement(AdaptedTask as React.ComponentType<typeof rfProps>, rfProps));
      const handle = document.querySelector('[data-handle-type="source"][data-handle-position="right"]');
      expect(handle).not.toBeNull();
    });
  });
});
