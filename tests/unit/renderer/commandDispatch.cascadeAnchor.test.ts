/**
 * commandDispatch — ADR 0003 §1 one-anchor-per-chain invariant.
 *
 * Tests that when task.setSchedule writes scheduledFor !== null on a task,
 * every OTHER task in the same chain that previously had scheduledFor set
 * is cleared (state + linked TodoItem mirror). Clearing scheduledFor (null)
 * on a task does NOT fan out — only the target's anchor is removed.
 *
 * Both write paths are exercised:
 *   - Direct on todo.task (case at applyCommand line ~216 + post-processing).
 *   - Cross-node router on calendar.schedule (around line 925).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import { makeCommandHandler } from '../../../src/renderer/components/Canvas/commandDispatch';
import type { Board } from '../../../src/shared/types';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';
import type { TodoState, TodoItem } from '../../../src/renderer/components/nodes/TodoNode/types';

beforeEach(() => {
  // @ts-expect-error — jsdom doesn't have krnl
  globalThis.window = globalThis.window ?? {};
  // @ts-expect-error
  globalThis.window.krnl = { boardSave: vi.fn().mockResolvedValue(undefined) };
  useBoardStore.setState({ board: null, viewport: { x: 0, y: 0, zoom: 1 } });
});

// ── Fixture ───────────────────────────────────────────────────────────────────

const TODO_ID = 'todo-mother';
const CAL_ID = 'cal-mother';

function makeTaskState(
  id: string,
  overrides: Partial<TaskState> = {},
): TaskState {
  return {
    text: id,
    done: false,
    durationMin: 25,
    eta: '~25 min',
    sequenceNumber: 1,
    layer: 0,
    createdAt: '2026-05-10T10:00:00.000Z',
    parentTodoId: TODO_ID,
    parentTaskId: null,
    todoItemId: `item-${id}`,
    pomoSessionsCompleted: 0,
    plannedMin: 25,
    secondsAccumulated: 0,
    currentSessionElapsedSec: 0,
    ...overrides,
  };
}

function makeItem(id: string, taskId: string, scheduledFor?: string): TodoItem {
  const base: TodoItem = {
    id: `item-${id}`,
    text: id,
    done: false,
    createdAt: '2026-05-10T10:00:00.000Z',
    completedAt: null,
    taskNodeId: taskId,
  };
  if (scheduledFor) return { ...base, scheduledFor };
  return base;
}

/**
 * Build a board with a 3-task chain t1 → t2 → t3 under one todo, plus an
 * optional calendar mother. Each task's scheduledFor can be set via opts.
 */
function makeChainBoard(opts: {
  schedT1?: string;
  schedT2?: string;
  schedT3?: string;
  withCalendar?: boolean;
} = {}): Board {
  const t1 = makeTaskState('t1', { scheduledFor: opts.schedT1 });
  const t2 = makeTaskState('t2', { scheduledFor: opts.schedT2 });
  const t3 = makeTaskState('t3', { scheduledFor: opts.schedT3 });

  const todoState: TodoState = {
    items: [
      makeItem('t1', 't1', opts.schedT1),
      makeItem('t2', 't2', opts.schedT2),
      makeItem('t3', 't3', opts.schedT3),
    ],
  };

  const nodes: Board['nodes'] = [
    {
      id: TODO_ID,
      kind: 'todo',
      position: { x: 0, y: 0 },
      isMother: true,
      state: todoState,
      config: { showCompleted: true, maxVisible: 50 },
    },
    { id: 't1', kind: 'todo.task', position: { x: 0, y: 0 }, isMother: false, state: t1, config: { showDuration: true } },
    { id: 't2', kind: 'todo.task', position: { x: 0, y: 0 }, isMother: false, state: t2, config: { showDuration: true } },
    { id: 't3', kind: 'todo.task', position: { x: 0, y: 0 }, isMother: false, state: t3, config: { showDuration: true } },
  ];

  if (opts.withCalendar) {
    nodes.push({
      id: CAL_ID,
      kind: 'calendar',
      position: { x: 0, y: 0 },
      isMother: true,
      state: { selectedDate: null, anchorDate: '2026-05-20' },
      config: { view: 'week', weekStartsOn: 'monday', showHabits: true, showPomoHeatmap: true, hourRange: { start: 6, end: 23 } },
    });
  }

  return {
    version: 1,
    schemaVersion: 1,
    savedAt: '2026-05-10T10:00:00.000Z',
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes,
    edges: [
      { id: 'e-t1-t2', from: { nodeId: 't1', event: 'task.next' }, to: { nodeId: 't2', command: 'task.activate' }, enabled: true },
      { id: 'e-t2-t3', from: { nodeId: 't2', event: 'task.next' }, to: { nodeId: 't3', command: 'task.activate' }, enabled: true },
    ],
  };
}

function getTask(id: string): TaskState {
  const board = useBoardStore.getState().board!;
  return board.nodes.find((n) => n.id === id)!.state as TaskState;
}

function getItem(itemId: string): TodoItem {
  const board = useBoardStore.getState().board!;
  const todo = board.nodes.find((n) => n.id === TODO_ID)!.state as TodoState;
  return todo.items.find((i) => i.id === itemId)!;
}

// ── Tests — direct todo.task dispatch ─────────────────────────────────────────

describe('ADR 0003 §1 — task.setSchedule on todo.task clears other anchors', () => {
  it('scheduling t1 when t3 already anchored clears t3 (state + item mirror)', () => {
    const board = makeChainBoard({ schedT3: '2026-05-20T16:00' });
    useBoardStore.getState().setBoard(board);
    expect(getTask('t3').scheduledFor).toBe('2026-05-20T16:00');
    expect(getItem('item-t3').scheduledFor).toBe('2026-05-20T16:00');

    const handler = makeCommandHandler('t1');
    handler('task.setSchedule', { scheduledFor: '2026-05-20T09:00' });

    expect(getTask('t1').scheduledFor).toBe('2026-05-20T09:00');
    expect(getTask('t3').scheduledFor).toBeUndefined();
    expect(getItem('item-t1').scheduledFor).toBe('2026-05-20T09:00');
    expect(getItem('item-t3').scheduledFor).toBeUndefined();
  });

  it('scheduling t1 in a 3-task chain with no existing anchors does not crash', () => {
    const board = makeChainBoard();
    useBoardStore.getState().setBoard(board);
    const handler = makeCommandHandler('t1');
    handler('task.setSchedule', { scheduledFor: '2026-05-20T09:00' });
    expect(getTask('t1').scheduledFor).toBe('2026-05-20T09:00');
    expect(getTask('t2').scheduledFor).toBeUndefined();
    expect(getTask('t3').scheduledFor).toBeUndefined();
  });

  it('clearing scheduledFor on a non-anchor task is a no-op for the chain', () => {
    const board = makeChainBoard({ schedT1: '2026-05-20T09:00' });
    useBoardStore.getState().setBoard(board);
    const handler = makeCommandHandler('t2');
    handler('task.setSchedule', { scheduledFor: null });
    // t1 must remain anchored — clearing a non-anchor does NOT fan out.
    expect(getTask('t1').scheduledFor).toBe('2026-05-20T09:00');
    expect(getTask('t2').scheduledFor).toBeUndefined();
  });

  it('clearing the anchor itself only clears the target', () => {
    const board = makeChainBoard({ schedT1: '2026-05-20T09:00' });
    useBoardStore.getState().setBoard(board);
    const handler = makeCommandHandler('t1');
    handler('task.setSchedule', { scheduledFor: null });
    expect(getTask('t1').scheduledFor).toBeUndefined();
    expect(getItem('item-t1').scheduledFor).toBeUndefined();
  });
});

// ── Tests — cross-node router (calendar.schedule) ─────────────────────────────

describe('ADR 0003 §1 — calendar.schedule (cross-node) clears other anchors', () => {
  it('drop on calendar moves the anchor: previous anchor task cleared', () => {
    const board = makeChainBoard({ schedT1: '2026-05-20T09:00', withCalendar: true });
    useBoardStore.getState().setBoard(board);
    const handler = makeCommandHandler(CAL_ID);
    handler('calendar.schedule', {
      taskId: 't2',
      scheduledFor: '2026-05-21T14:00',
      scheduledDurationMin: 30,
    });
    // t2 is the new anchor; t1's anchor must be cleared.
    expect(getTask('t2').scheduledFor).toBe('2026-05-21T14:00');
    expect(getTask('t1').scheduledFor).toBeUndefined();
    expect(getItem('item-t1').scheduledFor).toBeUndefined();
    expect(getItem('item-t2').scheduledFor).toBe('2026-05-21T14:00');
  });
});
