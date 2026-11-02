// @vitest-environment jsdom
// ADR 0016 — Done / Archive dropdowns + tag picker on the TodoNode.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { TodoNode } from '../../../src/renderer/components/nodes/TodoNode';
import { todoAdd, todoToggle, type TodoEnv } from '../../../src/renderer/components/nodes/TodoNode/commands';
import { defaultTodoConfig, defaultTodoState } from '../../../src/renderer/components/nodes/TodoNode/types';
import type { TodoState } from '../../../src/renderer/components/nodes/TodoNode/types';

const TODAY = '2026-11-02';
const at = (ymd: string, hh = 10) => new Date(`${ymd}T${String(hh).padStart(2, '0')}:00:00`).toISOString();
const env = (iso: string, id = 'id'): TodoEnv => ({ uuid: () => id, now: () => iso });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T15:00:00`));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function seed(): TodoState {
  let s = defaultTodoState();
  s = todoAdd(s, { text: 'open task' }, env(at(TODAY, 8), 'a'));
  s = todoAdd(s, { text: 'done today' }, env(at(TODAY, 8), 'b'));
  s = todoAdd(s, { text: 'done last week' }, env(at('2026-10-26', 8), 'c'));
  s = todoToggle(s, { id: 'b' }, env(at(TODAY, 9)));
  s = todoToggle(s, { id: 'c' }, env(at('2026-10-26', 20)));
  return s;
}

function renderNode(state: TodoState, onCommand = vi.fn()) {
  render(React.createElement(TodoNode, {
    node: { id: 'todo-1', kind: 'todo', position: { x: 0, y: 0 }, isMother: true, state, config: defaultTodoConfig() },
    selected: false,
    onCommand,
    onSelect: vi.fn(),
  }));
  return onCommand;
}

const texts = () => Array.from(document.querySelectorAll('.todo-text')).map((e) => e.textContent);

describe('Done dropdown (F16)', () => {
  it('a done item leaves the open list and waits in a collapsed "Done (1)"', () => {
    renderNode(seed());
    expect(texts()).toEqual(['open task']);
    expect(screen.getByTestId('todo-done-toggle').textContent).toContain('Done (1)');
    expect(screen.getByTestId('todo-header').textContent).toContain('Todos (1)');
  });

  it('expands to show today\'s done items', () => {
    renderNode(seed());
    fireEvent.click(screen.getByTestId('todo-done-toggle'));
    expect(texts()).toEqual(['open task', 'done today']);
  });
});

describe('Archive dropdown (F17, F19, F20)', () => {
  it('earlier days sit in a collapsed Archive with a day label', () => {
    renderNode(seed());
    const toggle = screen.getByTestId('todo-archive-toggle');
    expect(toggle.textContent).toContain('Archive (1)');
    fireEvent.click(toggle);
    expect(texts()).toContain('done last week');
  });

  it('CLEAR appears when open and dispatches todo.clearArchived', () => {
    const onCommand = renderNode(seed());
    expect(screen.queryByTestId('todo-clear-archive-btn')).toBeNull();
    fireEvent.click(screen.getByTestId('todo-archive-toggle'));
    fireEvent.click(screen.getByTestId('todo-clear-archive-btn'));
    expect(onCommand).toHaveBeenCalledWith('todo.clearArchived');
  });

  it('the checkbox on an archived row restores it', () => {
    const onCommand = renderNode(seed());
    fireEvent.click(screen.getByTestId('todo-archive-toggle'));
    fireEvent.click(screen.getByLabelText('Restore to list'));
    expect(onCommand).toHaveBeenCalledWith('todo.toggle', { id: 'c' });
  });
});

describe('Tag picker (F22, F23)', () => {
  it('auto tags render dashed with their label', () => {
    renderNode(todoAdd(defaultTodoState(), { text: 'Team standup' }, env(at(TODAY), 'm')));
    const pill = screen.getByTestId('todo-tag-m');
    expect(pill.textContent).toBe('Meetings');
    expect(pill.style.border).toContain('dashed');
  });

  it('suggests the best guess first and dispatches todo.setItemTag on pick', () => {
    const onCommand = renderNode(todoAdd(defaultTodoState(), { text: 'Team standup' }, env(at(TODAY), 'm')));
    fireEvent.click(screen.getByTestId('todo-tag-m'));
    const options = Array.from(screen.getByTestId('tag-picker').querySelectorAll('[data-testid^="tag-option-"]'));
    expect(options[0]?.getAttribute('data-testid')).toBe('tag-option-meetings');
    fireEvent.click(screen.getByTestId('tag-option-planning'));
    expect(onCommand).toHaveBeenCalledWith('todo.setItemTag', { id: 'm', tag: 'planning' });
    expect(screen.queryByTestId('tag-picker')).toBeNull();
  });

  it('typing a new name offers to create it', () => {
    const onCommand = renderNode(todoAdd(defaultTodoState(), { text: 'Elden ring' }, env(at(TODAY), 'g')));
    fireEvent.click(screen.getByTestId('todo-tag-g'));
    fireEvent.change(screen.getByTestId('tag-picker-input'), { target: { value: 'Gaming' } });
    fireEvent.click(screen.getByTestId('tag-picker-create'));
    expect(onCommand).toHaveBeenCalledWith('todo.setItemTag', { id: 'g', tag: 'Gaming' });
  });

  it('"Auto" hands the item back to the classifier', () => {
    const onCommand = renderNode(todoAdd(defaultTodoState(), { text: 'x', tag: 'code' }, env(at(TODAY), 'x')));
    fireEvent.click(screen.getByTestId('todo-tag-x'));
    fireEvent.click(screen.getByTestId('tag-option-auto'));
    expect(onCommand).toHaveBeenCalledWith('todo.setItemTag', { id: 'x', tag: null });
  });
});
