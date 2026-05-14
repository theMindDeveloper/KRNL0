// Tests for shared ID resolver — used by every command that accepts a <ref>.
// Issue #117 §1 (prefix-match) + name fallback (matches existing habit-by-name UX).

import { describe, it, expect } from 'vitest';
import {
  resolveNodeRef,
  resolveTodoItemRef,
  resolveHabitRef,
  resolveEdgeRef,
} from '../../../src/shared/dispatch/resolveRef';
import type { BoardShape } from '../../../src/shared/dispatch/types';

function makeBoard(): BoardShape {
  return {
    nodes: [
      { id: 'mother-todo', kind: 'todo', isMother: true, state: { items: [
        { id: 'aaaa1111-0000-0000-0000-000000000001', text: 'Buy milk', done: false, createdAt: '2026-05-14T00:00:00Z', completedAt: null, taskNodeId: null },
        { id: 'bbbb2222-0000-0000-0000-000000000002', text: 'Pay rent', done: false, createdAt: '2026-05-14T00:01:00Z', completedAt: null, taskNodeId: null },
      ] } },
      { id: 'mother-habit', kind: 'habit', isMother: true, state: { habits: [
        { id: 'hhhh1111-0000-0000-0000-000000000001', name: 'Meditate', createdAt: '2026-05-14T00:00:00Z', log: [], archived: false, color: 'acid' },
        { id: 'hhhh2222-0000-0000-0000-000000000002', name: 'Read', createdAt: '2026-05-14T00:00:00Z', log: [], archived: false, color: 'rust' },
      ] } },
      { id: 'task-1234abcd-0000-0000-0000-000000000001', kind: 'todo.task', state: { text: 'Linear algebra', done: false, parentTodoId: 'mother-todo', parentTaskId: null, todoItemId: null, sequenceNumber: 1, layer: 0, durationMin: 30, plannedMin: 30, eta: '~30 min', createdAt: '2026-05-14T00:00:00Z', pomoSessionsCompleted: 0, secondsAccumulated: 0, currentSessionElapsedSec: 0 } },
    ],
    edges: [
      { id: 'edge-aaaa1111-0000-0000-0000-000000000001', from: { nodeId: 'task-1234abcd-0000-0000-0000-000000000001', event: 'task.next' }, to: { nodeId: 'task-1234abcd-0000-0000-0000-000000000001', command: 'task.activate' }, enabled: true },
    ],
  };
}

describe('resolveNodeRef', () => {
  it('resolves exact UUID', () => {
    const board = makeBoard();
    const r = resolveNodeRef(board, 'mother-todo');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.id).toBe('mother-todo');
  });

  it('resolves an unambiguous prefix', () => {
    const board = makeBoard();
    const r = resolveNodeRef(board, 'task-1234');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.id).toBe('task-1234abcd-0000-0000-0000-000000000001');
  });

  it('rejects prefix shorter than 4 chars', () => {
    const board = makeBoard();
    const r = resolveNodeRef(board, 'ta');
    expect(r.ok).toBe(false);
  });

  it('filters by kind when provided', () => {
    const board = makeBoard();
    // 'mother' prefixes both mother-todo and mother-habit — without kind, ambiguous
    const r = resolveNodeRef(board, 'mother');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('ambiguous');

    // With kind='todo', only mother-todo matches
    const r2 = resolveNodeRef(board, 'mother', 'todo');
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.id).toBe('mother-todo');
  });

  it('falls back to task text', () => {
    const board = makeBoard();
    const r = resolveNodeRef(board, 'Linear algebra');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.id).toBe('task-1234abcd-0000-0000-0000-000000000001');
  });

  it('reports ambiguous matches', () => {
    const board = makeBoard();
    board.nodes.push({ id: 'task-1234ffff-0000-0000-0000-000000000099', kind: 'todo.task', state: { text: 'other', done: false, parentTodoId: 'mother-todo', parentTaskId: null, todoItemId: null, sequenceNumber: 2, layer: 0, durationMin: 30, plannedMin: 30, eta: '~30 min', createdAt: '2026-05-14T00:00:00Z', pomoSessionsCompleted: 0, secondsAccumulated: 0, currentSessionElapsedSec: 0 } });
    const r = resolveNodeRef(board, 'task-1234');
    expect(r.ok).toBe(false);
    if (!r.ok && 'matches' in r) {
      expect(r.reason).toBe('ambiguous');
      expect(r.matches?.length).toBe(2);
    }
  });
});

describe('resolveTodoItemRef', () => {
  it('resolves item by 8-char prefix (issue #117 §1)', () => {
    const board = makeBoard();
    const r = resolveTodoItemRef(board, 'aaaa1111');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.id.itemId).toBe('aaaa1111-0000-0000-0000-000000000001');
      expect(r.id.todoNodeId).toBe('mother-todo');
    }
  });

  it('resolves by item text fallback', () => {
    const board = makeBoard();
    const r = resolveTodoItemRef(board, 'Pay rent');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.id.itemId).toBe('bbbb2222-0000-0000-0000-000000000002');
  });
});

describe('resolveHabitRef', () => {
  it('resolves habit by name', () => {
    const board = makeBoard();
    const r = resolveHabitRef(board, 'Meditate');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.id.habitId).toBe('hhhh1111-0000-0000-0000-000000000001');
  });
});

describe('resolveEdgeRef', () => {
  it('resolves edge by prefix', () => {
    const board = makeBoard();
    const r = resolveEdgeRef(board, 'edge-aaaa');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.id).toBe('edge-aaaa1111-0000-0000-0000-000000000001');
  });
});
