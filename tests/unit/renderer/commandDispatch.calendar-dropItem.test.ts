// @vitest-environment jsdom
/**
 * calendar.schedule with an itemId — a Todo row dropped on the Calendar
 * before it has a TaskNode. The dispatcher creates the task, links it both
 * ways (Decision 20) and schedules it in the same step.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import { makeCommandHandler } from '../../../src/renderer/components/Canvas/commandDispatch';
import { TaskNode } from '../../../src/renderer/components/nodes/TaskNode';
import type { Board, Node } from '../../../src/shared/types';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';
import type { TodoState } from '../../../src/renderer/components/nodes/TodoNode/types';

beforeEach(() => {
  // @ts-expect-error — test shim for the preload bridge
  window.krnl = { boardSave: vi.fn().mockResolvedValue(undefined) };
  const board: Board = {
    version: 1,
    schemaVersion: 1,
    savedAt: '2026-05-15T10:00:00.000Z',
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: 'todo-mother',
        kind: 'todo',
        position: { x: 0, y: 0 },
        isMother: true,
        state: {
          items: [{ id: 'item-1', text: 'write report', done: false, createdAt: '2026-05-15T10:00:00.000Z', completedAt: null, taskNodeId: null }],
        } satisfies TodoState,
        config: {},
      },
      { id: 'cal-mother', kind: 'calendar', position: { x: 0, y: 0 }, isMother: true, state: {}, config: {} },
    ],
    edges: [],
  };
  useBoardStore.setState({ board });
});

describe('Calendar drop — Todo row without a task', () => {
  it('creates a linked task and schedules it', () => {
    makeCommandHandler('cal-mother')('calendar.schedule', {
      itemId: 'item-1',
      scheduledFor: '2026-05-20T09:00',
      scheduledDurationMin: 25,
    });
    const board = useBoardStore.getState().board!;
    const task = board.nodes.find((n) => n.kind === 'todo.task');
    expect(task).toBeDefined();
    const ts = task!.state as TaskState;
    expect(ts.text).toBe('write report');
    expect(ts.scheduledFor).toBe('2026-05-20T09:00');
    expect(ts.todoItemId).toBe('item-1');
    const todo = board.nodes.find((n) => n.id === 'todo-mother')!.state as TodoState;
    expect(todo.items[0]!.taskNodeId).toBe(task!.id);
  });

  it('ignores an unknown item', () => {
    makeCommandHandler('cal-mother')('calendar.schedule', { itemId: 'nope', scheduledFor: '2026-05-20T09:00' });
    expect(useBoardStore.getState().board!.nodes.some((n) => n.kind === 'todo.task')).toBe(false);
  });
});

describe('Calendar drop — canvas task grip', () => {
  it('starts a krnl-task drag with the task id and planned minutes', () => {
    const state: TaskState = {
      text: 'deep work', done: false, durationMin: 25, eta: '~50 min', sequenceNumber: 1, layer: 0,
      createdAt: '2026-05-15T10:00:00.000Z', parentTodoId: 'todo-mother', parentTaskId: null, todoItemId: null,
      pomoSessionsCompleted: 0, plannedMin: 50, secondsAccumulated: 0, currentSessionElapsedSec: 0,
    };
    const node: Node = { id: 'task-x', kind: 'todo.task', position: { x: 0, y: 0 }, isMother: false, state, config: {} };
    const { getByTestId } = render(React.createElement(TaskNode, { node, onCommand: () => undefined } as never));
    const data: Record<string, string> = {};
    fireEvent.dragStart(getByTestId('task-calendar-grip'), {
      dataTransfer: { setData: (t: string, v: string) => { data[t] = v; }, effectAllowed: '' },
    });
    expect(JSON.parse(data['application/krnl-task']!)).toEqual({ taskId: 'task-x', durationMin: 50 });
  });
});
