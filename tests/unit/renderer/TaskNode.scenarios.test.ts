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

  // ── F1 — Header format ────────────────────────────────────────────────────
  describe('F1 — Header format', () => {
    it('header text is "task · #03 L1"', () => {
      renderTaskNode(makeTaskState());
      const header = screen.getByTestId('task-header');
      // The header contains "● task · #03 L1"; bullet is a separate span
      expect(header.textContent).toContain('task · #03 L1');
    });

    it('pads sequence number to 2 digits', () => {
      renderTaskNode(makeTaskState({ sequenceNumber: 1 }));
      const header = screen.getByTestId('task-header');
      expect(header.textContent).toContain('#01');
    });

    it('shows the layer depth', () => {
      renderTaskNode(makeTaskState({ layer: 2 }));
      const header = screen.getByTestId('task-header');
      expect(header.textContent).toContain('L2');
    });
  });

  // ── F2 — START button dispatches task.startPomo (Decision 22.2 Fix 1) ────
  // The old "+ pomo" button (.task-pomo-btn) was replaced by task-start-btn /
  // task-pause-btn. task-start-btn dispatches task.startPomo (same auto-start
  // path as the old button). task.spawnPomo is still handled by the dispatcher
  // but the UI no longer references it directly.
  describe('F2 — START button dispatches task.startPomo', () => {
    it('START button exists when done=false and task is not active', () => {
      const onCommand = vi.fn();
      renderTaskNode(makeTaskState({ done: false }), onCommand);
      const btn = screen.getByTestId('task-start-btn') as HTMLElement;
      expect(btn).not.toBeNull();
    });

    it('clicking START button dispatches task.startPomo', () => {
      const onCommand = vi.fn();
      renderTaskNode(makeTaskState({ done: false }), onCommand);
      const btn = screen.getByTestId('task-start-btn') as HTMLElement;
      fireEvent.click(btn);
      expect(onCommand).toHaveBeenCalledWith('task.startPomo');
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

    it('task text has line-through styling when done', () => {
      renderTaskNode(makeTaskState({ done: true }));
      const text = document.querySelector('.task-text') as HTMLElement;
      expect(text.style.textDecorationLine).toBe('line-through');
    });

    it('task text color is var(--ink-4) when done', () => {
      renderTaskNode(makeTaskState({ done: true }));
      const text = document.querySelector('.task-text') as HTMLElement;
      expect(text.style.color).toBe('var(--ink-4)');
    });

    it('node root does not have class "done" when done is false', () => {
      renderTaskNode(makeTaskState({ done: false }));
      const root = screen.getByTestId('task-node-root');
      expect(root.classList.contains('done')).toBe(false);
    });
  });

  // ── F4b — Done state hides START button; shows neither START nor STOP ────
  // Decision 22.2: the old .task-pomo-btn is gone. task-start-btn is hidden
  // when done=true. task-pause-btn is only shown when the task is the active
  // pomo task (isActive). When done=true, neither button should be present.
  describe('F4b — Done state hides START button (Decision 22.2)', () => {
    it('task-start-btn is not present when done is true', () => {
      renderTaskNode(makeTaskState({ done: true }));
      const btn = document.queryByTestId ? document.queryByTestId('task-start-btn') : document.querySelector('[data-testid="task-start-btn"]');
      expect(btn).toBeNull();
    });

    it('task-start-btn is present when done is false (and task not active)', () => {
      renderTaskNode(makeTaskState({ done: false }));
      // task is not active (pomoRuntime.activeTaskId will be null with no board store),
      // so START should be shown and STOP should not.
      const startBtn = document.querySelector('[data-testid="task-start-btn"]');
      expect(startBtn).not.toBeNull();
      const stopBtn = document.querySelector('[data-testid="task-pause-btn"]');
      expect(stopBtn).toBeNull();
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

    it('footer contains the ETA string "~45 min"', () => {
      renderTaskNode(makeTaskState());
      const eta = document.querySelector('.task-eta');
      expect(eta).not.toBeNull();
      expect(eta?.textContent).toBe('~45 min');
    });

    it('footer has .task-foot class', () => {
      renderTaskNode(makeTaskState());
      const foot = document.querySelector('.task-foot');
      expect(foot).not.toBeNull();
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
