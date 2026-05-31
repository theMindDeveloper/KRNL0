// @vitest-environment jsdom
/**
 * TaskNode new Gherkin scenario tests — F8–F13 (plan F-prime mapping)
 * Source: plan structured-greeting-valiant.md + docs/06-requirements/task-node.md
 *
 * F# mapping (plan F-prime → test descriptions):
 *   F8  — opacity 0.4 on done card
 *   F9  — body click fires task.startPomo (drag-safe; no-op when done)
 *   F10 — right-click opens ContextMenu with 3 items
 *   F11 — inline edit via context menu "Edit text" and double-click
 *   F12 — "Add subtask" shows inline input, Enter fires task.addSubtask
 *   F13 — "Delete" fires task.delete; danger styling on Delete item
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';

afterEach(() => cleanup());

import { TaskNode } from '../../../src/renderer/components/nodes/TaskNode';
import type { Node } from '../../../src/shared/types/node';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';

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
    createdAt: '2026-05-10T10:00:00.000Z',
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

// ── F8 — Opacity on done ──────────────────────────────────────────────────────

describe('F8 — TaskNode card opacity is 0.4 when done', () => {
  it('root element opacity is 0.4 when done = true', () => {
    renderTaskNode(makeTaskState({ done: true }));
    const root = screen.getByTestId('task-node-root') as HTMLElement;
    expect(root.style.opacity).toBe('0.4');
  });

  it('root element opacity is 1 when done = false', () => {
    renderTaskNode(makeTaskState({ done: false }));
    const root = screen.getByTestId('task-node-root') as HTMLElement;
    expect(root.style.opacity).toBe('1');
  });

  it('cursor is "default" when done (not clickable pointer)', () => {
    renderTaskNode(makeTaskState({ done: true }));
    const root = screen.getByTestId('task-node-root') as HTMLElement;
    expect(root.style.cursor).toBe('default');
  });

  it('cursor is "pointer" when not done', () => {
    renderTaskNode(makeTaskState({ done: false }));
    const root = screen.getByTestId('task-node-root') as HTMLElement;
    expect(root.style.cursor).toBe('pointer');
  });
});

// ── F9 — Body DOUBLE-click loads task into pomo (selection-decoupled) ─────────

describe('F9 — Body double-click fires task.loadIntoPomo', () => {
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

  it('checkbox click does NOT bubble task.loadIntoPomo', () => {
    const onCommand = vi.fn();
    renderTaskNode(makeTaskState({ done: false }), onCommand);
    const checkbox = document.querySelector('.task-check') as HTMLElement;
    fireEvent.click(checkbox);
    const calls = onCommand.mock.calls.map((c) => c[0]);
    expect(calls).toContain('task.toggle');
    expect(calls).not.toContain('task.loadIntoPomo');
  });
});

// ── F10 — Right-click opens ContextMenu ───────────────────────────────────────

describe('F10 — Right-click context menu', () => {
  it('right-clicking the task node renders a context menu', () => {
    renderTaskNode(makeTaskState());
    const root = screen.getByTestId('task-node-root');
    fireEvent.contextMenu(root);
    // ContextMenu renders into document.body via portal
    const menuItems = document.querySelectorAll('button[type="button"]');
    // Should have at least 3 menu buttons in addition to the task-check and task-pomo-btn
    const labels = Array.from(menuItems).map((b) => b.textContent);
    expect(labels).toContain('Edit text');
    expect(labels).toContain('Add next task');
    expect(labels).toContain('Add parallel task');
    expect(labels).toContain('Delete');
  });

  it('context menu has "Edit text" item', () => {
    renderTaskNode(makeTaskState());
    fireEvent.contextMenu(screen.getByTestId('task-node-root'));
    const editBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Edit text',
    );
    expect(editBtn).toBeDefined();
  });

  it('context menu has "Add next task" item (disabled when done)', () => {
    renderTaskNode(makeTaskState({ done: true }));
    fireEvent.contextMenu(screen.getByTestId('task-node-root'));
    const addSubBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Add next task',
    );
    expect(addSubBtn).toBeDefined();
    expect(addSubBtn!.disabled).toBe(true);
  });

  it('context menu has "Add next task" item (enabled when not done)', () => {
    renderTaskNode(makeTaskState({ done: false }));
    fireEvent.contextMenu(screen.getByTestId('task-node-root'));
    const addSubBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Add next task',
    );
    expect(addSubBtn).toBeDefined();
    expect(addSubBtn!.disabled).toBe(false);
  });

  it('F10 — "Delete" menu item has danger (rust) color styling', () => {
    renderTaskNode(makeTaskState());
    fireEvent.contextMenu(screen.getByTestId('task-node-root'));
    const deleteBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Delete',
    );
    expect(deleteBtn).toBeDefined();
    expect(deleteBtn!.style.color).toBe('var(--rust)');
  });

  it('ESC key dismisses the context menu', () => {
    renderTaskNode(makeTaskState());
    fireEvent.contextMenu(screen.getByTestId('task-node-root'));
    // Menu should be open
    expect(
      Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Edit text'),
    ).toBeDefined();
    // Press ESC
    fireEvent.keyDown(document, { key: 'Escape' });
    // Menu should be dismissed
    expect(
      Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Edit text'),
    ).toBeUndefined();
  });
});

// ── F11 — Inline edit via "Edit text" context menu item ──────────────────────

describe('F11 — Inline edit', () => {
  it('clicking "Edit text" opens the inline editor prefilled with current text', () => {
    renderTaskNode(makeTaskState({ text: 'current text' }));
    fireEvent.contextMenu(screen.getByTestId('task-node-root'));
    const editBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Edit text',
    )!;
    fireEvent.click(editBtn);
    const input = document.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('current text');
  });

  it('pressing Enter in the inline editor dispatches task.edit with new text', () => {
    const onCommand = vi.fn();
    renderTaskNode(makeTaskState({ text: 'old text' }), onCommand);
    fireEvent.contextMenu(screen.getByTestId('task-node-root'));
    const editBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Edit text',
    )!;
    fireEvent.click(editBtn);
    const input = document.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'new text' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommand).toHaveBeenCalledWith('task.edit', { text: 'new text' });
  });

  it('pressing Escape in the inline editor cancels without dispatching', () => {
    const onCommand = vi.fn();
    renderTaskNode(makeTaskState({ text: 'unchanged' }), onCommand);
    fireEvent.contextMenu(screen.getByTestId('task-node-root'));
    const editBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Edit text',
    )!;
    fireEvent.click(editBtn);
    const input = document.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCommand).not.toHaveBeenCalledWith('task.edit', expect.anything());
  });

  it('double-clicking task text opens inline editor (not done)', () => {
    renderTaskNode(makeTaskState({ done: false }));
    const textEl = document.querySelector('.task-text') as HTMLElement;
    fireEvent.dblClick(textEl);
    const input = document.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input).not.toBeNull();
  });

  it('double-clicking task text does NOT open editor when done', () => {
    renderTaskNode(makeTaskState({ done: true }));
    const textEl = document.querySelector('.task-text') as HTMLElement;
    fireEvent.dblClick(textEl);
    const input = document.querySelector('input[type="text"]');
    expect(input).toBeNull();
  });
});

// ── F12 — Add next task (two-phase input) ──────────────────────────────────────

describe('F12 — Add next task inline input', () => {
  it('clicking "Add next task" shows a next task name input field', () => {
    renderTaskNode(makeTaskState({ done: false }));
    fireEvent.contextMenu(screen.getByTestId('task-node-root'));
    const addBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Add next task',
    )!;
    fireEvent.click(addBtn);
    const input = document.querySelector('input[placeholder="next task name…"]') as HTMLInputElement;
    expect(input).not.toBeNull();
  });

  it('two-phase: Enter on name → duration input → Enter fires task.addNext with text and durationMin', () => {
    const onCommand = vi.fn();
    renderTaskNode(makeTaskState({ done: false }), onCommand);
    fireEvent.contextMenu(screen.getByTestId('task-node-root'));
    const addBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Add next task',
    )!;
    fireEvent.click(addBtn);
    // Phase 1: name
    const nameInput = document.querySelector('input[placeholder="next task name…"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'next task text' } });
    fireEvent.keyDown(nameInput, { key: 'Enter' });
    // Phase 2: duration
    const durInput = document.querySelector('input[placeholder="how long? (min)"]') as HTMLInputElement;
    expect(durInput).not.toBeNull();
    fireEvent.change(durInput, { target: { value: '20' } });
    fireEvent.keyDown(durInput, { key: 'Enter' });
    expect(onCommand).toHaveBeenCalledWith('task.addNext', { text: 'next task text', durationMin: 20 });
  });

  it('pressing Escape in name phase dismisses without dispatching', () => {
    const onCommand = vi.fn();
    renderTaskNode(makeTaskState({ done: false }), onCommand);
    fireEvent.contextMenu(screen.getByTestId('task-node-root'));
    const addBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Add next task',
    )!;
    fireEvent.click(addBtn);
    const input = document.querySelector('input[placeholder="next task name…"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'draft' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCommand).not.toHaveBeenCalledWith('task.addNext', expect.anything());
    // Input should be gone
    expect(document.querySelector('input[placeholder="next task name…"]')).toBeNull();
  });
});

// ── F13 — Delete fires task.delete ────────────────────────────────────────────

describe('F13 — Delete via context menu fires task.delete', () => {
  it('clicking "Delete" in context menu fires task.delete', () => {
    const onCommand = vi.fn();
    renderTaskNode(makeTaskState(), onCommand);
    fireEvent.contextMenu(screen.getByTestId('task-node-root'));
    const deleteBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Delete',
    )!;
    fireEvent.click(deleteBtn);
    expect(onCommand).toHaveBeenCalledWith('task.delete');
  });
});
