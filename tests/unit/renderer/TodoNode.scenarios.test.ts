// @vitest-environment jsdom
/**
 * TodoNode Gherkin scenario tests — Issues #39
 * Source: docs/06-requirements/todo-node.md
 *
 * The "environment: node" global config is overridden per-file here via the
 * pragma above so we can use jsdom and @testing-library/react.
 *
 * F8 (RF handle presence) is tested through createNodeAdapter(TodoNode)
 * to honour the constraint "DO NOT add Handle imports to the component body."
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// Clean up jsdom between each test so elements don't bleed across scenarios.
afterEach(() => cleanup());
import React from 'react';

import { TodoNode } from '../../../src/renderer/components/nodes/TodoNode';
import { createNodeAdapter } from '../../../src/renderer/components/Canvas/rfAdapters';
import {
  todoAdd,
  todoToggle,
  type TodoEnv,
} from '../../../src/renderer/components/nodes/TodoNode/commands';
import {
  defaultTodoState,
  defaultTodoConfig,
} from '../../../src/renderer/components/nodes/TodoNode/types';
import type { Node } from '../../../src/shared/types/node';
import type { TodoState, TodoConfig } from '../../../src/renderer/components/nodes/TodoNode/types';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const T1 = '2026-05-10T10:00:00.000Z';
const T2 = '2026-05-10T11:00:00.000Z';
const T3 = '2026-05-10T12:00:00.000Z';

const envAt = (iso: string, id = 'id-fixed'): TodoEnv => ({
  uuid: () => id,
  now: () => iso,
});

function makeTodoNode(state: TodoState, config: TodoConfig = defaultTodoConfig()): Node<TodoState, TodoConfig> {
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
    })
  );
}

// ── Background state builders ─────────────────────────────────────────────────

function makeBackground() {
  // Two undone items (T1, T2) + one done item
  let s = defaultTodoState();
  s = todoAdd(s, { text: 'undone-first' }, envAt(T1, 'id-a'));
  s = todoAdd(s, { text: 'undone-second' }, envAt(T2, 'id-b'));
  s = todoAdd(s, { text: 'done-item' }, envAt(T3, 'id-c'));
  s = todoToggle(s, { id: 'id-c' }, envAt(T3));
  return s;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('TodoNode Gherkin scenarios (Issue #39)', () => {

  // ── F1 — Sort order ──────────────────────────────────────────────────────
  describe('F1 — Sort order: undone first, ascending createdAt', () => {
    it('renders undone items before done items', () => {
      const state = makeBackground();
      renderTodoNode(state);
      const texts = screen.getAllByRole('button', { name: /mark/i });
      // There are 3 checkboxes; the first two correspond to undone items.
      // We verify by checking the todo-text siblings.
      const textEls = document.querySelectorAll('.todo-text');
      expect(textEls.length).toBe(3);
      // T1 item appears first (earlier createdAt among undone)
      expect(textEls[0]?.textContent).toBe('undone-first');
      expect(textEls[1]?.textContent).toBe('undone-second');
    });

    it('renders the T1 item before the T2 item', () => {
      const state = makeBackground();
      renderTodoNode(state);
      const textEls = document.querySelectorAll('.todo-text');
      const texts = Array.from(textEls).map((el) => el.textContent);
      expect(texts.indexOf('undone-first')).toBeLessThan(texts.indexOf('undone-second'));
    });

    it('renders both undone items before the done item', () => {
      const state = makeBackground();
      renderTodoNode(state);
      const textEls = document.querySelectorAll('.todo-text');
      const texts = Array.from(textEls).map((el) => el.textContent);
      expect(texts.indexOf('undone-first')).toBeLessThan(texts.indexOf('done-item'));
      expect(texts.indexOf('undone-second')).toBeLessThan(texts.indexOf('done-item'));
    });
  });

  // ── F2 — Item anatomy ────────────────────────────────────────────────────
  describe('F2 — Item anatomy', () => {
    it('renders .todo-check element for each item', () => {
      const state = makeBackground();
      renderTodoNode(state);
      const checks = document.querySelectorAll('.todo-check');
      expect(checks.length).toBe(3);
    });

    it('renders .todo-text element for each item', () => {
      const state = makeBackground();
      renderTodoNode(state);
      const texts = document.querySelectorAll('.todo-text');
      expect(texts.length).toBe(3);
    });

    it('renders .todo-tag pill for items with a tag property', () => {
      let s = defaultTodoState();
      s = todoAdd(s, { text: 'tagged', tag: 'WORK' }, envAt(T1, 'id-t'));
      s = todoAdd(s, { text: 'untagged' }, envAt(T2, 'id-u'));
      renderTodoNode(s);
      const tags = document.querySelectorAll('.todo-tag');
      expect(tags.length).toBe(1);
      expect(tags[0]?.textContent).toBe('WORK');
    });

    it('truncates tag to at most 4 characters', () => {
      let s = defaultTodoState();
      s = todoAdd(s, { text: 'long-tag', tag: 'TOOLONG' }, envAt(T1, 'id-x'));
      renderTodoNode(s);
      const tag = document.querySelector('.todo-tag');
      expect(tag?.textContent?.length).toBeLessThanOrEqual(4);
    });
  });

  // ── F3 — Toggle checkbox dispatches todo.toggle ──────────────────────────
  describe('F3 — Toggle checkbox dispatches todo.toggle', () => {
    it('calls onCommand with todo.toggle and item id when checkbox clicked', () => {
      const onCommand = vi.fn();
      let s = defaultTodoState();
      s = todoAdd(s, { text: 'test item' }, envAt(T1, 'id-abc'));
      renderTodoNode(s, onCommand);
      const check = document.querySelector('.todo-check') as HTMLElement;
      fireEvent.click(check);
      expect(onCommand).toHaveBeenCalledWith('todo.toggle', { id: 'id-abc' });
    });

    it('done item text has line-through styling', () => {
      const state = makeBackground();
      renderTodoNode(state);
      const doneText = document.querySelector('.todo-item.done .todo-text') as HTMLElement;
      expect(doneText).not.toBeNull();
      expect(doneText.style.textDecorationLine).toBe('line-through');
    });

    it('done item text color is var(--ink-4)', () => {
      const state = makeBackground();
      renderTodoNode(state);
      const doneText = document.querySelector('.todo-item.done .todo-text') as HTMLElement;
      expect(doneText.style.color).toBe('var(--ink-4)');
    });
  });

  // ── F4 — Add task on Enter ────────────────────────────────────────────────
  describe('F4 — Add task on Enter', () => {
    it('dispatches todo.add with the typed text when Enter is pressed', () => {
      const onCommand = vi.fn();
      renderTodoNode(defaultTodoState(), onCommand);
      // Click the placeholder to open the input
      const placeholder = screen.getByTestId('add-task-placeholder');
      fireEvent.click(placeholder);
      const input = document.querySelector('input[placeholder]') as HTMLInputElement;
      expect(input).not.toBeNull();
      fireEvent.change(input, { target: { value: 'buy oat milk' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onCommand).toHaveBeenCalledWith('todo.add', { text: 'buy oat milk' });
    });

    it('clears the input after dispatch', () => {
      const onCommand = vi.fn();
      renderTodoNode(defaultTodoState(), onCommand);
      const placeholder = screen.getByTestId('add-task-placeholder');
      fireEvent.click(placeholder);
      const input = document.querySelector('input[placeholder]') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'my task' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      // After commit the input either keeps focus (NF3) or reverts to placeholder;
      // either way the value should be empty
      expect(input.value).toBe('');
    });
  });

  // ── F4b — Enter hint always visible ──────────────────────────────────────
  describe('F4b — Enter hint is always visible', () => {
    it('shows ↵ hint when the placeholder is displayed', () => {
      renderTodoNode(defaultTodoState());
      const hint = screen.getByTestId('enter-hint');
      expect(hint).not.toBeNull();
      expect(hint.textContent).toBe('↵');
    });

    it('shows ↵ hint while the input is open', () => {
      renderTodoNode(defaultTodoState());
      fireEvent.click(screen.getByTestId('add-task-placeholder'));
      const hint = screen.getByTestId('enter-hint');
      expect(hint).not.toBeNull();
    });
  });

  // ── F5 — Inline edit on double-click ─────────────────────────────────────
  describe('F5 — Inline edit on double-click', () => {
    it('switches todo-text to an input on double-click', () => {
      let s = defaultTodoState();
      s = todoAdd(s, { text: 'original text' }, envAt(T1, 'id-xyz'));
      renderTodoNode(s);
      const textEl = document.querySelector('.todo-text') as HTMLElement;
      fireEvent.dblClick(textEl);
      const editInput = document.querySelector('input:not([placeholder])') as HTMLInputElement;
      expect(editInput).not.toBeNull();
      expect(editInput.value).toBe('original text');
    });

    it('dispatches todo.edit when Enter is pressed in inline edit', () => {
      const onCommand = vi.fn();
      let s = defaultTodoState();
      s = todoAdd(s, { text: 'original text' }, envAt(T1, 'id-xyz'));
      renderTodoNode(s, onCommand);
      const textEl = document.querySelector('.todo-text') as HTMLElement;
      fireEvent.dblClick(textEl);
      const editInput = document.querySelector('input:not([placeholder])') as HTMLInputElement;
      fireEvent.change(editInput, { target: { value: 'revised text' } });
      fireEvent.keyDown(editInput, { key: 'Enter' });
      expect(onCommand).toHaveBeenCalledWith('todo.edit', { id: 'id-xyz', text: 'revised text' });
    });
  });

  // ── F6 — Clear done dispatches todo.clearDone ─────────────────────────────
  describe('F6 — Clear done dispatches todo.clearDone', () => {
    it('shows the clear done button when at least one item is done', () => {
      const state = makeBackground();
      renderTodoNode(state);
      const btn = screen.getByTestId('clear-done-btn');
      expect(btn).not.toBeNull();
    });

    it('dispatches todo.clearDone when clear done is activated', () => {
      const onCommand = vi.fn();
      const state = makeBackground();
      renderTodoNode(state, onCommand);
      const btn = screen.getByTestId('clear-done-btn');
      fireEvent.click(btn);
      expect(onCommand).toHaveBeenCalledWith('todo.clearDone');
    });

    it('does not show the clear done button when no items are done', () => {
      let s = defaultTodoState();
      s = todoAdd(s, { text: 'undone' }, envAt(T1, 'id-a'));
      renderTodoNode(s);
      const btn = screen.queryByTestId('clear-done-btn');
      expect(btn).toBeNull();
    });
  });

  // ── F7 — Header count is reactive ────────────────────────────────────────
  describe('F7 — Header count is reactive', () => {
    it('header reads "Todos (3)" when 3 items are undone', () => {
      let s = defaultTodoState();
      s = todoAdd(s, { text: 'a' }, envAt(T1, 'id-a'));
      s = todoAdd(s, { text: 'b' }, envAt(T2, 'id-b'));
      s = todoAdd(s, { text: 'c' }, envAt(T3, 'id-c'));
      renderTodoNode(s);
      const header = screen.getByTestId('todo-header');
      expect(header.textContent).toContain('Todos (3)');
    });

    it('header reflects the undone count (done items excluded from count)', () => {
      const state = makeBackground(); // 2 undone, 1 done
      renderTodoNode(state);
      const header = screen.getByTestId('todo-header');
      expect(header.textContent).toContain('Todos (2)');
    });
  });

  // ── F8 — Mother nodes do NOT render handles ──────────────────────────────
  // Mothers don't connect to anything in v1 (Decision #13 §E + ux feedback).
  // The adapter HOC skips Handle rendering when node.isMother === true.
  describe('F8 — TodoNode (mother) renders no connection handles', () => {
    it('adapter wraps TodoNode without left/right handles when isMother:true', () => {
      const AdaptedTodo = createNodeAdapter(TodoNode);
      const rfProps = {
        id: 'todo-1',
        type: 'todo',
        data: {
          node: makeTodoNode(defaultTodoState()),
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
      render(React.createElement(AdaptedTodo as React.ComponentType<typeof rfProps>, rfProps));
      const targetHandle = document.querySelector('[data-handle-type="target"]');
      const sourceHandle = document.querySelector('[data-handle-type="source"]');
      expect(targetHandle).toBeNull();
      expect(sourceHandle).toBeNull();
    });
  });
});
