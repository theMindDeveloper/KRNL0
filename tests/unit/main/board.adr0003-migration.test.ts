/**
 * ADR 0003 §8 — migrateNormalizeChainAnchors migration tests.
 *
 * Verifies:
 *   - A pre-cascade board with two anchors in one chain keeps the earliest
 *     scheduledFor and clears the others on both the task state and the
 *     linked TodoItem mirror.
 *   - A board with at most one anchor per chain is unchanged.
 *   - Migration is idempotent (running through loadBoardFrom twice yields
 *     identical normalized state).
 *   - Multiple independent chains in separate todos are each normalized in
 *     isolation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBoardFrom } from '../../../src/main/persistence/board';

interface LoadedTaskNode {
  id: string;
  kind: string;
  state?: { scheduledFor?: string; parentTodoId?: string; todoItemId?: string | null };
}
interface LoadedTodoNode {
  id: string;
  kind: string;
  state?: { items?: Array<{ id: string; scheduledFor?: string }> };
}
interface LoadedBoard {
  nodes: Array<LoadedTaskNode | LoadedTodoNode>;
  edges: unknown[];
}

function makeTaskShape(
  id: string,
  todoId: string,
  itemId: string,
  scheduledFor?: string,
): Record<string, unknown> {
  const state: Record<string, unknown> = {
    text: id,
    done: false,
    durationMin: 25,
    eta: '~25 min',
    sequenceNumber: 1,
    layer: 0,
    createdAt: '2026-05-10T10:00:00.000Z',
    parentTodoId: todoId,
    parentTaskId: null,
    todoItemId: itemId,
    pomoSessionsCompleted: 0,
    plannedMin: 25,
    secondsAccumulated: 0,
    currentSessionElapsedSec: 0,
  };
  if (scheduledFor) state['scheduledFor'] = scheduledFor;
  return { id, kind: 'todo.task', position: { x: 0, y: 0 }, isMother: false, state, config: { showDuration: true } };
}

function makeItemShape(id: string, taskId: string, scheduledFor?: string): Record<string, unknown> {
  const it: Record<string, unknown> = {
    id,
    text: id,
    done: false,
    createdAt: '2026-05-10T10:00:00.000Z',
    completedAt: null,
    taskNodeId: taskId,
  };
  if (scheduledFor) it['scheduledFor'] = scheduledFor;
  return it;
}

function makeTodoShape(id: string, items: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    id,
    kind: 'todo',
    position: { x: 0, y: 0 },
    isMother: true,
    state: { items },
    config: { showCompleted: true, maxVisible: 50 },
  };
}

function makeEdge(from: string, to: string): Record<string, unknown> {
  return {
    id: `e-${from}-${to}`,
    from: { nodeId: from, event: 'task.next' },
    to: { nodeId: to, command: 'task.activate' },
    enabled: true,
  };
}

describe('ADR 0003 §8 — migrateNormalizeChainAnchors', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'krnl0-adr0003-mig-'));
    path = join(dir, 'board.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('keeps the earliest anchor and clears the rest in a 3-task chain', () => {
    // t1 anchored at 10:00, t3 anchored at 16:00 — both in same chain.
    // Migration must keep t1 (earliest) and clear t3 + its TodoItem mirror.
    const todoId = 'todo-1';
    const board = {
      version: 1,
      schemaVersion: 1,
      savedAt: '2026-05-10T10:00:00.000Z',
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        makeTodoShape(todoId, [
          makeItemShape('item-t1', 't1', '2026-05-20T10:00'),
          makeItemShape('item-t2', 't2'),
          makeItemShape('item-t3', 't3', '2026-05-20T16:00'),
        ]),
        makeTaskShape('t1', todoId, 'item-t1', '2026-05-20T10:00'),
        makeTaskShape('t2', todoId, 'item-t2'),
        makeTaskShape('t3', todoId, 'item-t3', '2026-05-20T16:00'),
      ],
      edges: [makeEdge('t1', 't2'), makeEdge('t2', 't3')],
    };
    writeFileSync(path, JSON.stringify(board), 'utf-8');
    const out = loadBoardFrom(path) as LoadedBoard;

    const t1 = out.nodes.find((n) => n.id === 't1') as LoadedTaskNode;
    const t3 = out.nodes.find((n) => n.id === 't3') as LoadedTaskNode;
    expect(t1.state?.scheduledFor).toBe('2026-05-20T10:00');
    expect(t3.state?.scheduledFor).toBeUndefined();

    const todo = out.nodes.find((n) => n.id === todoId) as LoadedTodoNode;
    const item1 = todo.state?.items?.find((i) => i.id === 'item-t1');
    const item3 = todo.state?.items?.find((i) => i.id === 'item-t3');
    expect(item1?.scheduledFor).toBe('2026-05-20T10:00');
    expect(item3?.scheduledFor).toBeUndefined();
  });

  it('does not modify a board with at most one anchor per chain', () => {
    const todoId = 'todo-1';
    const board = {
      version: 1,
      schemaVersion: 1,
      savedAt: '2026-05-10T10:00:00.000Z',
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        makeTodoShape(todoId, [
          makeItemShape('item-t1', 't1', '2026-05-20T10:00'),
          makeItemShape('item-t2', 't2'),
        ]),
        makeTaskShape('t1', todoId, 'item-t1', '2026-05-20T10:00'),
        makeTaskShape('t2', todoId, 'item-t2'),
      ],
      edges: [makeEdge('t1', 't2')],
    };
    writeFileSync(path, JSON.stringify(board), 'utf-8');
    const out = loadBoardFrom(path) as LoadedBoard;
    const t1 = out.nodes.find((n) => n.id === 't1') as LoadedTaskNode;
    expect(t1.state?.scheduledFor).toBe('2026-05-20T10:00');
  });

  it('is idempotent — second load is a no-op', () => {
    const todoId = 'todo-1';
    const board = {
      version: 1,
      schemaVersion: 1,
      savedAt: '2026-05-10T10:00:00.000Z',
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        makeTodoShape(todoId, [
          makeItemShape('item-t1', 't1', '2026-05-20T10:00'),
          makeItemShape('item-t3', 't3', '2026-05-20T16:00'),
        ]),
        makeTaskShape('t1', todoId, 'item-t1', '2026-05-20T10:00'),
        makeTaskShape('t2', todoId, 'item-t2'),
        makeTaskShape('t3', todoId, 'item-t3', '2026-05-20T16:00'),
      ],
      edges: [makeEdge('t1', 't2'), makeEdge('t2', 't3')],
    };
    writeFileSync(path, JSON.stringify(board), 'utf-8');

    const out1 = loadBoardFrom(path) as LoadedBoard;
    writeFileSync(path, JSON.stringify(out1), 'utf-8');
    const out2 = loadBoardFrom(path) as LoadedBoard;

    const t1a = out1.nodes.find((n) => n.id === 't1') as LoadedTaskNode;
    const t3a = out1.nodes.find((n) => n.id === 't3') as LoadedTaskNode;
    const t1b = out2.nodes.find((n) => n.id === 't1') as LoadedTaskNode;
    const t3b = out2.nodes.find((n) => n.id === 't3') as LoadedTaskNode;
    expect(t1a.state?.scheduledFor).toBe('2026-05-20T10:00');
    expect(t1b.state?.scheduledFor).toBe('2026-05-20T10:00');
    expect(t3a.state?.scheduledFor).toBeUndefined();
    expect(t3b.state?.scheduledFor).toBeUndefined();
  });

  it('normalises independent chains in separate todos independently', () => {
    const todoA = 'todo-A';
    const todoB = 'todo-B';
    const board = {
      version: 1,
      schemaVersion: 1,
      savedAt: '2026-05-10T10:00:00.000Z',
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        makeTodoShape(todoA, [
          makeItemShape('item-a1', 'a1', '2026-05-20T10:00'),
          makeItemShape('item-a2', 'a2', '2026-05-20T11:00'), // illegal in todoA
        ]),
        makeTodoShape(todoB, [
          makeItemShape('item-b1', 'b1', '2026-05-22T15:00'), // legal, only anchor in todoB
        ]),
        makeTaskShape('a1', todoA, 'item-a1', '2026-05-20T10:00'),
        makeTaskShape('a2', todoA, 'item-a2', '2026-05-20T11:00'),
        makeTaskShape('b1', todoB, 'item-b1', '2026-05-22T15:00'),
      ],
      edges: [makeEdge('a1', 'a2')],
    };
    writeFileSync(path, JSON.stringify(board), 'utf-8');
    const out = loadBoardFrom(path) as LoadedBoard;
    const a1 = out.nodes.find((n) => n.id === 'a1') as LoadedTaskNode;
    const a2 = out.nodes.find((n) => n.id === 'a2') as LoadedTaskNode;
    const b1 = out.nodes.find((n) => n.id === 'b1') as LoadedTaskNode;
    // todoA: a1 earliest wins, a2 cleared
    expect(a1.state?.scheduledFor).toBe('2026-05-20T10:00');
    expect(a2.state?.scheduledFor).toBeUndefined();
    // todoB: untouched (only one anchor)
    expect(b1.state?.scheduledFor).toBe('2026-05-22T15:00');
  });
});
