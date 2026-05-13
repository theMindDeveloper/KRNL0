// @vitest-environment jsdom
/**
 * TodoNode new Gherkin scenario tests — F9–F14 (plan F-prime mapping)
 * Source: plan structured-greeting-valiant.md + docs/06-requirements/todo-node.md
 *
 * F# mapping (plan F-prime → todo-node F#):
 *   F9  — row right-click context menu (Edit text, Start pomo, Delete)
 *   F10 — row click fires todo.startPomoForItem (when taskNodeId linked)
 *   F11 — todo.remove cascades TaskNode (dispatcher test in cascade file; UI: delete button dispatches todo.remove)
 *   F12 — todo.clearDone (existing F6; cascade in cascade test file)
 *   F13 — todo.toggle mirrors done to linked TaskNode (cascade file)
 *   F14 — todo.add sets taskNodeId via todoLinkTask (FSM: todoLinkTask + TodoItem.taskNodeId field)
 *
 * UI-level component tests are here. Dispatcher-level cascade tests are in
 * commandDispatch.cascade.test.ts.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';

afterEach(() => cleanup());

import { TodoNode } from '../../../src/renderer/components/nodes/TodoNode';
import {
  todoAdd,
  todoToggle,
  todoLinkTask,
  type TodoEnv,
} from '../../../src/renderer/components/nodes/TodoNode/commands';
import {
  defaultTodoState,
  defaultTodoConfig,
} from '../../../src/renderer/components/nodes/TodoNode/types';
import type { Node } from '../../../src/shared/types/node';
import type { TodoState, TodoConfig } from '../../../src/renderer/components/nodes/TodoNode/types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const T1 = '2026-05-10T10:00:00.000Z';
const T2 = '2026-05-10T11:00:00.000Z';

const envAt = (iso: string, id = 'id-fixed'): TodoEnv => ({
  uuid: () => id,
  now: () => iso,
});

function makeTodoNode(
  state: TodoState,
  config: TodoConfig = defaultTodoConfig(),
): Node<TodoState, TodoConfig> {
  return {
    id: 'todo-1',
    kind: 'todo',
    position: { x: 0, y: 0 },
    isMother: true,
    state,
    config,
  };
}

function renderTodoNode(
  state: TodoState,
  onCommand: (cmd: string, args?: Record<string, unknown>) => void = vi.fn(),
) {
  const node = makeTodoNode(state);
  render(
    React.createElement(TodoNode, {
      node,
      selected: false,
      onCommand,
      onSelect: vi.fn(),
    }),
  );
}

// ── F14 — todoLinkTask FSM sets taskNodeId on item ───────────────────────────

describe('F14 — todoLinkTask FSM sets taskNodeId bidirectional link', () => {
  it('sets taskNodeId on the matching item', () => {
    let s = defaultTodoState();
    s = todoAdd(s, { text: 'my task' }, envAt(T1, 'item-1'));
    const linked = todoLinkTask(s, { itemId: 'item-1', taskNodeId: 'task-node-abc' });
    expect(linked.items[0]?.taskNodeId).toBe('task-node-abc');
  });

  it('only sets taskNodeId on the targeted item; others unchanged', () => {
    let s = defaultTodoState();
    s = todoAdd(s, { text: 'task A' }, envAt(T1, 'item-a'));
    s = todoAdd(s, { text: 'task B' }, envAt(T2, 'item-b'));
    const linked = todoLinkTask(s, { itemId: 'item-a', taskNodeId: 'task-abc' });
    expect(linked.items[0]?.taskNodeId).toBe('task-abc');
    expect(linked.items[1]?.taskNodeId).toBeNull();
  });

  it('todoAdd initialises taskNodeId as null', () => {
    const s = todoAdd(defaultTodoState(), { text: 'fresh item' }, envAt(T1, 'item-1'));
    expect(s.items[0]?.taskNodeId).toBeNull();
  });

  it('todoLinkTask does not mutate original state', () => {
    let s = defaultTodoState();
    s = todoAdd(s, { text: 'x' }, envAt(T1, 'item-1'));
    todoLinkTask(s, { itemId: 'item-1', taskNodeId: 'task-xyz' });
    expect(s.items[0]?.taskNodeId).toBeNull();
  });
});

// ── F9 — Row right-click context menu ────────────────────────────────────────

describe('F9 — TodoNode row right-click context menu', () => {
  it('right-clicking a row renders a context menu', () => {
    let s = defaultTodoState();
    s = todoAdd(s, { text: 'my item' }, envAt(T1, 'item-1'));
    renderTodoNode(s);
    const textEl = document.querySelector('.todo-text') as HTMLElement;
    const rowEl = textEl.closest('.todo-item') as HTMLElement;
    fireEvent.contextMenu(rowEl);
    const labels = Array.from(document.querySelectorAll('button')).map((b) => b.textContent);
    expect(labels).toContain('Edit text');
    expect(labels).toContain('Start pomo');
    expect(labels).toContain('Delete');
  });

  it('F9 — "Start pomo" item is disabled when item has no linked taskNodeId', () => {
    let s = defaultTodoState();
    s = todoAdd(s, { text: 'no task node' }, envAt(T1, 'item-1'));
    // taskNodeId is null by default
    renderTodoNode(s);
    const rowEl = document.querySelector('.todo-item') as HTMLElement;
    fireEvent.contextMenu(rowEl);
    const startPomoBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Start pomo',
    )!;
    expect(startPomoBtn.disabled).toBe(true);
  });

  it('F9 — "Start pomo" item is enabled when item has a linked taskNodeId', () => {
    let s = defaultTodoState();
    s = todoAdd(s, { text: 'linked task' }, envAt(T1, 'item-1'));
    s = todoLinkTask(s, { itemId: 'item-1', taskNodeId: 'task-abc' });
    renderTodoNode(s);
    const rowEl = document.querySelector('.todo-item') as HTMLElement;
    fireEvent.contextMenu(rowEl);
    const startPomoBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Start pomo',
    )!;
    expect(startPomoBtn.disabled).toBe(false);
  });

  it('F9 — "Start pomo" fires todo.startPomoForItem with itemId', () => {
    const onCommand = vi.fn();
    let s = defaultTodoState();
    s = todoAdd(s, { text: 'linked task' }, envAt(T1, 'item-1'));
    s = todoLinkTask(s, { itemId: 'item-1', taskNodeId: 'task-abc' });
    renderTodoNode(s, onCommand);
    const rowEl = document.querySelector('.todo-item') as HTMLElement;
    fireEvent.contextMenu(rowEl);
    const startPomoBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Start pomo',
    )!;
    fireEvent.click(startPomoBtn);
    expect(onCommand).toHaveBeenCalledWith('todo.startPomoForItem', { itemId: 'item-1' });
  });

  it('F9 — "Delete" fires todo.remove with item id', () => {
    const onCommand = vi.fn();
    let s = defaultTodoState();
    s = todoAdd(s, { text: 'delete me' }, envAt(T1, 'item-1'));
    renderTodoNode(s, onCommand);
    const rowEl = document.querySelector('.todo-item') as HTMLElement;
    fireEvent.contextMenu(rowEl);
    const deleteBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Delete',
    )!;
    fireEvent.click(deleteBtn);
    expect(onCommand).toHaveBeenCalledWith('todo.remove', { id: 'item-1' });
  });

  it('F9 — "Delete" item has danger (rust) color styling', () => {
    let s = defaultTodoState();
    s = todoAdd(s, { text: 'delete me' }, envAt(T1, 'item-1'));
    renderTodoNode(s);
    const rowEl = document.querySelector('.todo-item') as HTMLElement;
    fireEvent.contextMenu(rowEl);
    const deleteBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Delete',
    )!;
    expect(deleteBtn.style.color).toBe('var(--rust)');
  });

  it('F9 — "Edit text" via context menu fires todo.edit with new text', () => {
    const onCommand = vi.fn();
    let s = defaultTodoState();
    s = todoAdd(s, { text: 'original text' }, envAt(T1, 'item-1'));
    renderTodoNode(s, onCommand);
    const rowEl = document.querySelector('.todo-item') as HTMLElement;
    fireEvent.contextMenu(rowEl);
    const editBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Edit text',
    )!;
    fireEvent.click(editBtn);
    const editInput = document.querySelector('input:not([placeholder])') as HTMLInputElement;
    expect(editInput).not.toBeNull();
    fireEvent.change(editInput, { target: { value: 'updated text' } });
    fireEvent.keyDown(editInput, { key: 'Enter' });
    expect(onCommand).toHaveBeenCalledWith('todo.edit', {
      id: 'item-1',
      text: 'updated text',
    });
  });

  it('F9 — ESC dismisses the row context menu', () => {
    let s = defaultTodoState();
    s = todoAdd(s, { text: 'item' }, envAt(T1, 'item-1'));
    renderTodoNode(s);
    const rowEl = document.querySelector('.todo-item') as HTMLElement;
    fireEvent.contextMenu(rowEl);
    expect(
      Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Edit text'),
    ).toBeDefined();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(
      Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Edit text'),
    ).toBeUndefined();
  });
});

// ── F10 — Row click fires todo.loadTaskForItem (load-only, Decision 22.3) ─────

describe('F10 — Row text click fires todo.loadTaskForItem when linked', () => {
  it('clicking linked undone item text fires todo.loadTaskForItem (load only, no auto-start)', () => {
    const onCommand = vi.fn();
    let s = defaultTodoState();
    s = todoAdd(s, { text: 'linked task' }, envAt(T1, 'item-1'));
    s = todoLinkTask(s, { itemId: 'item-1', taskNodeId: 'task-abc' });
    renderTodoNode(s, onCommand);
    const textEl = document.querySelector('.todo-text') as HTMLElement;
    fireEvent.click(textEl);
    expect(onCommand).toHaveBeenCalledWith('todo.loadTaskForItem', { itemId: 'item-1' });
  });

  it('clicking unlinked item text does NOT fire todo.loadTaskForItem', () => {
    const onCommand = vi.fn();
    let s = defaultTodoState();
    s = todoAdd(s, { text: 'no task' }, envAt(T1, 'item-1'));
    // taskNodeId is null
    renderTodoNode(s, onCommand);
    const textEl = document.querySelector('.todo-text') as HTMLElement;
    fireEvent.click(textEl);
    expect(onCommand).not.toHaveBeenCalledWith('todo.loadTaskForItem', expect.anything());
  });

  it('clicking a done linked item does NOT fire todo.loadTaskForItem', () => {
    const onCommand = vi.fn();
    let s = defaultTodoState();
    s = todoAdd(s, { text: 'linked task' }, envAt(T1, 'item-1'));
    s = todoLinkTask(s, { itemId: 'item-1', taskNodeId: 'task-abc' });
    s = todoToggle(s, { id: 'item-1' }, envAt(T2));
    renderTodoNode(s, onCommand);
    const textEl = document.querySelector('.todo-text') as HTMLElement;
    fireEvent.click(textEl);
    expect(onCommand).not.toHaveBeenCalledWith('todo.loadTaskForItem', expect.anything());
  });
});

// ── F11 — Delete button fires todo.remove ─────────────────────────────────────

describe('F11 — Delete button on row fires todo.remove', () => {
  it('clicking the X delete button on a row fires todo.remove with item id', () => {
    const onCommand = vi.fn();
    let s = defaultTodoState();
    s = todoAdd(s, { text: 'to delete' }, envAt(T1, 'item-1'));
    renderTodoNode(s, onCommand);
    // The delete button has aria-label "Delete: <text>"
    const deleteBtn = screen.getByLabelText('Delete: to delete') as HTMLElement;
    fireEvent.click(deleteBtn);
    expect(onCommand).toHaveBeenCalledWith('todo.remove', { id: 'item-1' });
  });
});
