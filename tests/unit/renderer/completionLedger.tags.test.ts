// ADR 0016 — the renderer dispatch path files a completion under its Todo
// item's tag, and keeps the ledger in step when a done item is re-tagged.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import { makeCommandHandler } from '../../../src/renderer/components/Canvas/commandDispatch';
import type { Board } from '../../../src/shared/types';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';
import type { TodoState } from '../../../src/renderer/components/nodes/TodoNode/types';

beforeEach(() => {
  // @ts-expect-error — node env has no window.krnl
  globalThis.window = globalThis.window ?? {};
  // @ts-expect-error
  globalThis.window.krnl = { boardSave: vi.fn().mockResolvedValue(undefined) };
  useBoardStore.setState({ board: null, viewport: { x: 0, y: 0, zoom: 1 }, history: [], future: [] });
});

function makeBoard(): Board {
  const taskState: TaskState = {
    text: 'Team standup',
    done: false,
    durationMin: 15,
    eta: '~15 min',
    sequenceNumber: 1,
    layer: 0,
    createdAt: '2026-05-10T10:00:00.000Z',
    parentTodoId: 'todo-mother',
    parentTaskId: null,
    todoItemId: 'item-1',
    pomoSessionsCompleted: 0,
    plannedMin: 15,
    secondsAccumulated: 0,
    currentSessionElapsedSec: 0,
    kind: 'event',
  };
  return {
    version: 1,
    schemaVersion: 2,
    viewport: { x: 0, y: 0, zoom: 1 },
    layoutMode: 'canvas',
    nodes: [
      {
        id: 'todo-mother',
        kind: 'todo',
        position: { x: 0, y: 0 },
        isMother: true,
        state: {
          items: [{
            id: 'item-1', text: 'Team standup', done: false, tag: 'meetings', tagSource: 'auto',
            createdAt: '2026-05-10T10:00:00.000Z', completedAt: null, taskNodeId: 'task-1',
          }],
        } as TodoState,
        config: { showCompleted: true, maxVisible: 50 },
      },
      { id: 'task-1', kind: 'todo.task', position: { x: 0, y: 400 }, isMother: false, state: taskState, config: { showDuration: true } },
    ],
    edges: [],
    savedAt: '2026-05-10T10:00:00.000Z',
  };
}

const ledgerTag = () => useBoardStore.getState().board!.completions?.find((c) => c.taskId === 'task-1')?.tag;

describe('completion ledger tags (renderer)', () => {
  it('ticking the Todo row files the completion under the item tag', () => {
    useBoardStore.getState().setBoard(makeBoard());
    makeCommandHandler('todo-mother')('todo.toggle', { id: 'item-1' });
    expect(ledgerTag()).toBe('meetings');
  });

  it('completing the task node directly uses the same tag', () => {
    useBoardStore.getState().setBoard(makeBoard());
    makeCommandHandler('task-1')('task.toggle', {});
    expect(ledgerTag()).toBe('meetings');
  });

  it('re-tagging a done item updates its ledger entry', () => {
    useBoardStore.getState().setBoard(makeBoard());
    const todo = makeCommandHandler('todo-mother');
    todo('todo.toggle', { id: 'item-1' });
    todo('todo.setItemTag', { id: 'item-1', tag: 'planning' });
    expect(ledgerTag()).toBe('planning');
  });

  it('archive keeps the task node; clear-archive removes it but not the ledger', () => {
    useBoardStore.getState().setBoard(makeBoard());
    const todo = makeCommandHandler('todo-mother');
    todo('todo.toggle', { id: 'item-1' });
    todo('todo.archiveDone', {});
    let board = useBoardStore.getState().board!;
    expect(board.nodes.some((n) => n.id === 'task-1')).toBe(true);
    todo('todo.clearArchived', {});
    board = useBoardStore.getState().board!;
    expect(board.nodes.some((n) => n.id === 'task-1')).toBe(false);
    expect((board.nodes.find((n) => n.id === 'todo-mother')!.state as TodoState).items).toHaveLength(0);
    expect(ledgerTag()).toBe('meetings');
  });
});
