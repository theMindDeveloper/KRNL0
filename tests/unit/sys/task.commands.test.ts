/**
 * sys task CLI — round-trip tests against a tmp board.json
 * Decision #20: every GUI action has a CLI peer.
 * Pattern mirrors tests/unit/sys/habit.test.ts (KRNL0_BOARD_DIR env override).
 *
 * F# coverage:
 *   F8–F9  (task)  — taskAdd creates node + bidirectional link + sequencing
 *   F11    (task)  — taskEdit updates text
 *   F8/F13 (task)  — taskToggle flips done + mirrors to TodoItem
 *   F13    (task)  — taskDelete removes node + descendants + TodoItem + edges
 *   F9     (task)  — taskStartPomo starts pomo mother
 *   F12    (task)  — taskSubtask spawns child at layer+1
 *   sys    (task)  — taskList reports tasks
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  taskAdd,
  taskEdit,
  taskToggle,
  taskDelete,
  taskStartPomo,
  taskSubtask,
  taskList,
  taskDuration,
  taskSibling,
  taskResetPomo,
  type TaskCtx,
} from '../../../src/sys/commands/task';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';
import type { TodoState } from '../../../src/renderer/components/nodes/TodoNode/types';
import type { PomoState } from '../../../src/renderer/components/nodes/PomoNode/types';

// ── tmp-dir per-test ──────────────────────────────────────────────────────────

let tmpDir = '';
let boardPath = '';
let ctx: TaskCtx;

const TODO_MOTHER_ID = 'mother-todo';
const POMO_MOTHER_ID = 'mother-pomo';

interface AnyNode {
  id: string;
  kind: string;
  isMother?: boolean;
  state: unknown;
  position?: { x: number; y: number };
  [k: string]: unknown;
}

interface BoardOnDisk {
  nodes: AnyNode[];
  edges: Array<{ id: string; from: { nodeId: string; event: string }; to: { nodeId: string; command: string }; enabled: boolean }>;
}

function readBoard(): BoardOnDisk {
  return JSON.parse(readFileSync(boardPath, 'utf-8')) as BoardOnDisk;
}

function findTasks(): AnyNode[] {
  return readBoard().nodes.filter((n) => n.kind === 'todo.task');
}

function findTodoMother(): AnyNode {
  return readBoard().nodes.find((n) => n.kind === 'todo' && n.isMother === true)!;
}

function findPomoMother(): AnyNode {
  return readBoard().nodes.find((n) => n.kind === 'pomo' && n.isMother === true)!;
}

function seedBoardOnDisk(includePomoMother = false): void {
  const nodes: AnyNode[] = [
    {
      id: TODO_MOTHER_ID,
      kind: 'todo',
      isMother: true,
      position: { x: 0, y: 0 },
      state: { items: [] } as TodoState,
      config: { showCompleted: true, maxVisible: 50 },
    },
  ];

  if (includePomoMother) {
    nodes.push({
      id: POMO_MOTHER_ID,
      kind: 'pomo',
      isMother: true,
      position: { x: 0, y: 0 },
      state: {
        status: 'idle',
        startedAt: null,
        durationMin: 25,
        breakMin: 5,
        label: '',
        sessionsCompleted: 0,
        history: [],
      } as PomoState,
      config: { defaultDurationMin: 25, defaultBreakMin: 5, longBreakEvery: 4, longBreakMin: 15 },
    });
  }

  const board = {
    version: 1,
    schemaVersion: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes,
    edges: [],
  };
  writeFileSync(boardPath, JSON.stringify(board), 'utf-8');
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'krnl0-task-cli-'));
  boardPath = join(tmpDir, 'board.json');
  seedBoardOnDisk(true);
  ctx = { boardPath };
});

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

// ── taskAdd ────────────────────────────────────────────────────────────────────

describe('sys task add', () => {
  it('creates a task node on the board', async () => {
    const res = await taskAdd(ctx, TODO_MOTHER_ID, 'write tests');
    expect(res.ok).toBe(true);
    expect(findTasks()).toHaveLength(1);
    expect((findTasks()[0]!.state as TaskState).text).toBe('write tests');
  });

  it('adds a bidirectional TodoItem with taskNodeId set', async () => {
    const res = await taskAdd(ctx, TODO_MOTHER_ID, 'buy oat milk');
    expect(res.ok).toBe(true);
    const todoMother = findTodoMother();
    const items = (todoMother.state as TodoState).items;
    expect(items).toHaveLength(1);
    const taskId = (res.data as { id: string }).id;
    expect(items[0]!.taskNodeId).toBe(taskId);
  });

  it('sets todoItemId on the TaskState back-link', async () => {
    const res = await taskAdd(ctx, TODO_MOTHER_ID, 'write tests');
    expect(res.ok).toBe(true);
    const task = findTasks()[0]!;
    const todoMother = findTodoMother();
    const itemId = (todoMother.state as TodoState).items[0]!.id;
    expect((task.state as TaskState).todoItemId).toBe(itemId);
  });

  it('assigns sequenceNumber = 1 for the first task', async () => {
    await taskAdd(ctx, TODO_MOTHER_ID, 'first task');
    expect((findTasks()[0]!.state as TaskState).sequenceNumber).toBe(1);
  });

  it('assigns sequenceNumber = 2 for the second task', async () => {
    await taskAdd(ctx, TODO_MOTHER_ID, 'first');
    await taskAdd(ctx, TODO_MOTHER_ID, 'second');
    const tasks = findTasks().sort(
      (a, b) => (a.state as TaskState).sequenceNumber - (b.state as TaskState).sequenceNumber,
    );
    expect((tasks[1]!.state as TaskState).sequenceNumber).toBe(2);
  });

  it('adds a chain edge from the previous sibling', async () => {
    await taskAdd(ctx, TODO_MOTHER_ID, 'task 1');
    await taskAdd(ctx, TODO_MOTHER_ID, 'task 2');
    const { edges } = readBoard();
    expect(edges.length).toBeGreaterThanOrEqual(1);
    const tasks = findTasks();
    const task1 = tasks.find((t) => (t.state as TaskState).sequenceNumber === 1)!;
    const task2 = tasks.find((t) => (t.state as TaskState).sequenceNumber === 2)!;
    const chainEdge = edges.find(
      (e) => e.from.nodeId === task1.id && e.to.nodeId === task2.id,
    );
    expect(chainEdge).toBeDefined();
  });

  it('uses first todo mother when todoId is undefined', async () => {
    const res = await taskAdd(ctx, undefined, 'implicit todo');
    expect(res.ok).toBe(true);
    expect(findTasks()).toHaveLength(1);
  });

  it('returns error when text is missing', async () => {
    const res = await taskAdd(ctx, TODO_MOTHER_ID, undefined);
    expect(res.ok).toBe(false);
  });

  it('returns error when todoId does not exist', async () => {
    const res = await taskAdd(ctx, 'nonexistent-todo', 'text');
    expect(res.ok).toBe(false);
  });

  it('sets durationMin from param', async () => {
    await taskAdd(ctx, TODO_MOTHER_ID, 'timed task', 45);
    expect((findTasks()[0]!.state as TaskState).durationMin).toBe(45);
  });
});

// ── taskEdit ───────────────────────────────────────────────────────────────────

describe('sys task edit', () => {
  it('updates the task text and persists it', async () => {
    const addRes = await taskAdd(ctx, TODO_MOTHER_ID, 'old text');
    const taskId = (addRes.data as { id: string }).id;
    const editRes = await taskEdit(ctx, taskId, 'new text');
    expect(editRes.ok).toBe(true);
    const task = findTasks().find((t) => t.id === taskId)!;
    expect((task.state as TaskState).text).toBe('new text');
  });

  it('returns error when task id is missing', async () => {
    const res = await taskEdit(ctx, undefined, 'text');
    expect(res.ok).toBe(false);
  });

  it('returns error when text is missing', async () => {
    const addRes = await taskAdd(ctx, TODO_MOTHER_ID, 'some task');
    const taskId = (addRes.data as { id: string }).id;
    const res = await taskEdit(ctx, taskId, undefined);
    expect(res.ok).toBe(false);
  });

  it('returns error when task id is unknown', async () => {
    const res = await taskEdit(ctx, 'nonexistent', 'text');
    expect(res.ok).toBe(false);
  });
});

// ── taskToggle ─────────────────────────────────────────────────────────────────

describe('sys task toggle', () => {
  it('marks a task done and persists it', async () => {
    const addRes = await taskAdd(ctx, TODO_MOTHER_ID, 'toggle me');
    const taskId = (addRes.data as { id: string }).id;
    const toggleRes = await taskToggle(ctx, taskId);
    expect(toggleRes.ok).toBe(true);
    const task = findTasks().find((t) => t.id === taskId)!;
    expect((task.state as TaskState).done).toBe(true);
  });

  it('marks a done task undone (toggle back)', async () => {
    const addRes = await taskAdd(ctx, TODO_MOTHER_ID, 'toggle twice');
    const taskId = (addRes.data as { id: string }).id;
    await taskToggle(ctx, taskId);
    await taskToggle(ctx, taskId);
    const task = findTasks().find((t) => t.id === taskId)!;
    expect((task.state as TaskState).done).toBe(false);
  });

  it('mirrors done state to linked TodoItem', async () => {
    const addRes = await taskAdd(ctx, TODO_MOTHER_ID, 'mirrored task');
    const taskId = (addRes.data as { id: string }).id;
    await taskToggle(ctx, taskId);
    const items = (findTodoMother().state as TodoState).items;
    const item = items.find((i) => i.taskNodeId === taskId)!;
    expect(item.done).toBe(true);
  });

  it('returns error when task id is missing', async () => {
    const res = await taskToggle(ctx, undefined);
    expect(res.ok).toBe(false);
  });
});

// ── taskDelete ─────────────────────────────────────────────────────────────────

describe('sys task delete', () => {
  it('removes the task node from the board', async () => {
    const addRes = await taskAdd(ctx, TODO_MOTHER_ID, 'delete me');
    const taskId = (addRes.data as { id: string }).id;
    const delRes = await taskDelete(ctx, taskId);
    expect(delRes.ok).toBe(true);
    expect(findTasks().find((t) => t.id === taskId)).toBeUndefined();
  });

  it('removes the linked TodoItem', async () => {
    const addRes = await taskAdd(ctx, TODO_MOTHER_ID, 'to be deleted');
    const taskId = (addRes.data as { id: string }).id;
    await taskDelete(ctx, taskId);
    const items = (findTodoMother().state as TodoState).items;
    expect(items.find((i) => i.taskNodeId === taskId)).toBeUndefined();
  });

  it('removes incident edges', async () => {
    await taskAdd(ctx, TODO_MOTHER_ID, 'task 1');
    const addRes2 = await taskAdd(ctx, TODO_MOTHER_ID, 'task 2');
    const task2Id = (addRes2.data as { id: string }).id;
    await taskDelete(ctx, task2Id);
    const { edges } = readBoard();
    expect(edges.every((e) => e.from.nodeId !== task2Id && e.to.nodeId !== task2Id)).toBe(true);
  });

  it('removes descendants (BFS): deleting parent also removes child', async () => {
    const parentRes = await taskAdd(ctx, TODO_MOTHER_ID, 'parent task');
    const parentId = (parentRes.data as { id: string }).id;
    const childRes = await taskSubtask(ctx, parentId, 'child task');
    const childId = (childRes.data as { id: string }).id;

    await taskDelete(ctx, parentId);

    const tasks = findTasks();
    expect(tasks.find((t) => t.id === parentId)).toBeUndefined();
    expect(tasks.find((t) => t.id === childId)).toBeUndefined();
  });

  it('renumbers remaining siblings after delete', async () => {
    await taskAdd(ctx, TODO_MOTHER_ID, 'task 1');
    const addRes2 = await taskAdd(ctx, TODO_MOTHER_ID, 'task 2');
    const addRes3 = await taskAdd(ctx, TODO_MOTHER_ID, 'task 3');

    const task2Id = (addRes2.data as { id: string }).id;

    await taskDelete(ctx, task2Id);

    const remaining = findTasks().sort(
      (a, b) => (a.state as TaskState).sequenceNumber - (b.state as TaskState).sequenceNumber,
    );
    // After deleting #2, task 3 should renumber to #2
    expect(remaining[0]!.id).not.toBe(task2Id);
    expect((remaining[remaining.length - 1]!.state as TaskState).sequenceNumber).toBeLessThanOrEqual(remaining.length);
  });

  it('returns error when task id is missing', async () => {
    const res = await taskDelete(ctx, undefined);
    expect(res.ok).toBe(false);
  });

  it('returns error when task id is unknown', async () => {
    const res = await taskDelete(ctx, 'nonexistent');
    expect(res.ok).toBe(false);
  });
});

// ── taskStartPomo ──────────────────────────────────────────────────────────────

describe('sys task startPomo', () => {
  it('starts the Pomo mother with task label and durationMin', async () => {
    const addRes = await taskAdd(ctx, TODO_MOTHER_ID, 'deep work', 45);
    const taskId = (addRes.data as { id: string }).id;
    const pomoRes = await taskStartPomo(ctx, taskId);
    expect(pomoRes.ok).toBe(true);
    const pomo = findPomoMother();
    const ps = pomo.state as PomoState;
    expect(ps.status).toBe('running');
    expect(ps.label).toBe('deep work');
    expect(ps.durationMin).toBe(45);
  });

  it('returns error when task id is missing', async () => {
    const res = await taskStartPomo(ctx, undefined);
    expect(res.ok).toBe(false);
  });

  it('returns error when task id is unknown', async () => {
    const res = await taskStartPomo(ctx, 'ghost');
    expect(res.ok).toBe(false);
  });

  it('returns error when no pomo mother in board', async () => {
    // Reseed without pomo mother
    seedBoardOnDisk(false);
    const addRes = await taskAdd(ctx, TODO_MOTHER_ID, 'task');
    const taskId = (addRes.data as { id: string }).id;
    const res = await taskStartPomo(ctx, taskId);
    expect(res.ok).toBe(false);
  });
});

// ── taskSubtask ───────────────────────────────────────────────────────────────

describe('sys task subtask', () => {
  it('creates a child task node with layer = parent.layer + 1', async () => {
    const parentRes = await taskAdd(ctx, TODO_MOTHER_ID, 'parent');
    const parentId = (parentRes.data as { id: string }).id;
    const subRes = await taskSubtask(ctx, parentId, 'child work');
    expect(subRes.ok).toBe(true);
    const childId = (subRes.data as { id: string }).id;
    const child = findTasks().find((t) => t.id === childId)!;
    expect((child.state as TaskState).layer).toBe(1); // parent is layer 0
    expect((child.state as TaskState).parentTaskId).toBe(parentId);
  });

  it('adds a chain edge from parent to child', async () => {
    const parentRes = await taskAdd(ctx, TODO_MOTHER_ID, 'parent');
    const parentId = (parentRes.data as { id: string }).id;
    const subRes = await taskSubtask(ctx, parentId, 'child');
    const childId = (subRes.data as { id: string }).id;
    const { edges } = readBoard();
    const chainEdge = edges.find(
      (e) => e.from.nodeId === parentId && e.to.nodeId === childId,
    );
    expect(chainEdge).toBeDefined();
  });

  it('subtask has no todoItemId (not directly linked to a TodoItem)', async () => {
    const parentRes = await taskAdd(ctx, TODO_MOTHER_ID, 'parent');
    const parentId = (parentRes.data as { id: string }).id;
    const subRes = await taskSubtask(ctx, parentId, 'subtask');
    const childId = (subRes.data as { id: string }).id;
    const child = findTasks().find((t) => t.id === childId)!;
    expect((child.state as TaskState).todoItemId).toBeNull();
  });

  it('returns error when parent task id is missing', async () => {
    const res = await taskSubtask(ctx, undefined, 'text');
    expect(res.ok).toBe(false);
  });

  it('returns error when text is missing', async () => {
    const parentRes = await taskAdd(ctx, TODO_MOTHER_ID, 'parent');
    const parentId = (parentRes.data as { id: string }).id;
    const res = await taskSubtask(ctx, parentId, undefined);
    expect(res.ok).toBe(false);
  });
});

// ── taskDuration ──────────────────────────────────────────────────────────────

describe('sys task duration', () => {
  it('sets durationMin and updates eta on the task', async () => {
    const addRes = await taskAdd(ctx, TODO_MOTHER_ID, 'timed task', 20);
    const taskId = (addRes.data as { id: string }).id;
    const res = await taskDuration(ctx, taskId, 45);
    expect(res.ok).toBe(true);
    const task = findTasks().find((t) => t.id === taskId)!;
    expect((task.state as TaskState).durationMin).toBe(45);
    expect((task.state as TaskState).eta).toBe('~45 min');
  });

  it('returns error when task id is missing', async () => {
    const res = await taskDuration(ctx, undefined, 30);
    expect(res.ok).toBe(false);
  });

  it('returns error when minutes is missing', async () => {
    const addRes = await taskAdd(ctx, TODO_MOTHER_ID, 'task');
    const taskId = (addRes.data as { id: string }).id;
    const res = await taskDuration(ctx, taskId, undefined);
    expect(res.ok).toBe(false);
  });

  it('returns error when minutes is zero or negative', async () => {
    const addRes = await taskAdd(ctx, TODO_MOTHER_ID, 'task');
    const taskId = (addRes.data as { id: string }).id;
    const res = await taskDuration(ctx, taskId, 0);
    expect(res.ok).toBe(false);
  });

  it('returns error when task id is unknown', async () => {
    const res = await taskDuration(ctx, 'nonexistent', 30);
    expect(res.ok).toBe(false);
  });

  it('refuses to change duration when pomo is running', async () => {
    const addRes = await taskAdd(ctx, TODO_MOTHER_ID, 'focus task', 25);
    const taskId = (addRes.data as { id: string }).id;
    // Start the pomo
    await taskStartPomo(ctx, taskId);
    const res = await taskDuration(ctx, taskId, 50);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/pomo session is running/i);
    // Duration should be unchanged
    const task = findTasks().find((t) => t.id === taskId)!;
    expect((task.state as TaskState).durationMin).toBe(25);
  });
});

// ── taskSibling ───────────────────────────────────────────────────────────────

describe('sys task sibling', () => {
  it('inserts a new sibling task node with text "New task"', async () => {
    const addRes = await taskAdd(ctx, TODO_MOTHER_ID, 'original task');
    const taskId = (addRes.data as { id: string }).id;
    const res = await taskSibling(ctx, taskId);
    expect(res.ok).toBe(true);
    const sibId = (res.data as { id: string }).id;
    const sib = findTasks().find((t) => t.id === sibId)!;
    expect((sib.state as TaskState).text).toBe('New task');
  });

  it('sibling inherits layer and parentTodoId from source', async () => {
    const addRes = await taskAdd(ctx, TODO_MOTHER_ID, 'source');
    const taskId = (addRes.data as { id: string }).id;
    const res = await taskSibling(ctx, taskId);
    const sibId = (res.data as { id: string }).id;
    const sib = findTasks().find((t) => t.id === sibId)!;
    const sourceTask = findTasks().find((t) => t.id === taskId)!;
    expect((sib.state as TaskState).layer).toBe((sourceTask.state as TaskState).layer);
    expect((sib.state as TaskState).parentTodoId).toBe(
      (sourceTask.state as TaskState).parentTodoId,
    );
  });

  it('creates a fork: sibling connects to same downstream nodes as source', async () => {
    // Create task1 → task2 chain, then add sibling fork from task1
    const res1 = await taskAdd(ctx, TODO_MOTHER_ID, 'task 1');
    const res2 = await taskAdd(ctx, TODO_MOTHER_ID, 'task 2');
    const task1Id = (res1.data as { id: string }).id;
    const task2Id = (res2.data as { id: string }).id;

    const sibRes = await taskSibling(ctx, task1Id);
    const sibId = (sibRes.data as { id: string }).id;

    const { edges } = readBoard();
    // Original task1 → task2 edge must be PRESERVED (purely additive)
    const directEdge = edges.find(
      (e) => e.from.nodeId === task1Id && e.to.nodeId === task2Id,
    );
    expect(directEdge).toBeDefined();
    // sib → task2 fork edge should exist (sibling connects to the same downstream)
    const forkEdge = edges.find(
      (e) => e.from.nodeId === sibId && e.to.nodeId === task2Id,
    );
    expect(forkEdge).toBeDefined();
  });

  it('sibling has todoItemId set and appears in parent TodoNode items', async () => {
    const addRes = await taskAdd(ctx, TODO_MOTHER_ID, 'source task');
    const taskId = (addRes.data as { id: string }).id;

    const sibRes = await taskSibling(ctx, taskId);
    expect(sibRes.ok).toBe(true);
    const sibId = (sibRes.data as { id: string }).id;

    // todoItemId must not be null on the new sibling TaskState
    const sib = findTasks().find((t) => t.id === sibId)!;
    const sibTodoItemId = (sib.state as TaskState).todoItemId;
    expect(sibTodoItemId).not.toBeNull();

    // The parent TodoNode must contain a TodoItem pointing back to the sibling
    const todoMother = findTodoMother();
    const item = (todoMother.state as TodoState).items.find((i) => i.taskNodeId === sibId);
    expect(item).toBeDefined();
    expect(item!.id).toBe(sibTodoItemId);
  });

  it('returns error when task id is missing', async () => {
    const res = await taskSibling(ctx, undefined);
    expect(res.ok).toBe(false);
  });

  it('returns error when task id is unknown', async () => {
    const res = await taskSibling(ctx, 'nonexistent');
    expect(res.ok).toBe(false);
  });
});

// ── taskResetPomo ─────────────────────────────────────────────────────────────

describe('sys task reset-pomo', () => {
  it('resets pomoSessionsCompleted to 0', async () => {
    const addRes = await taskAdd(ctx, TODO_MOTHER_ID, 'productive task', 25);
    const taskId = (addRes.data as { id: string }).id;
    // Manually write a non-zero count
    const board = JSON.parse(readFileSync(boardPath, 'utf-8')) as {
      nodes: Array<{ id: string; state: TaskState }>;
      edges: unknown[];
    };
    board.nodes = board.nodes.map((n) => {
      if (n.id !== taskId) return n;
      return { ...n, state: { ...n.state, pomoSessionsCompleted: 3 } };
    });
    writeFileSync(boardPath, JSON.stringify(board), 'utf-8');

    const res = await taskResetPomo(ctx, taskId);
    expect(res.ok).toBe(true);
    const task = findTasks().find((t) => t.id === taskId)!;
    expect((task.state as TaskState).pomoSessionsCompleted).toBe(0);
  });

  it('succeeds even when count was already 0', async () => {
    const addRes = await taskAdd(ctx, TODO_MOTHER_ID, 'fresh task', 25);
    const taskId = (addRes.data as { id: string }).id;
    const res = await taskResetPomo(ctx, taskId);
    expect(res.ok).toBe(true);
    const task = findTasks().find((t) => t.id === taskId)!;
    expect((task.state as TaskState).pomoSessionsCompleted).toBe(0);
  });

  it('returns error when task id is missing', async () => {
    const res = await taskResetPomo(ctx, undefined);
    expect(res.ok).toBe(false);
  });

  it('returns error when task id is unknown', async () => {
    const res = await taskResetPomo(ctx, 'nonexistent');
    expect(res.ok).toBe(false);
  });
});

// ── taskList ──────────────────────────────────────────────────────────────────

describe('sys task list', () => {
  it('returns empty result when no tasks', async () => {
    const res = await taskList(ctx);
    expect(res.ok).toBe(true);
    expect((res.data as unknown[]).length).toBe(0);
  });

  it('lists all tasks when no filter', async () => {
    await taskAdd(ctx, TODO_MOTHER_ID, 'task A');
    await taskAdd(ctx, TODO_MOTHER_ID, 'task B');
    const res = await taskList(ctx);
    expect(res.ok).toBe(true);
    expect((res.data as unknown[]).length).toBe(2);
  });

  it('filters by todoId when provided', async () => {
    await taskAdd(ctx, TODO_MOTHER_ID, 'task for this todo');
    const res = await taskList(ctx, TODO_MOTHER_ID);
    expect(res.ok).toBe(true);
    expect((res.data as unknown[]).length).toBe(1);
  });

  it('returns empty when filtering by unknown todoId', async () => {
    await taskAdd(ctx, TODO_MOTHER_ID, 'task');
    const res = await taskList(ctx, 'nonexistent-todo');
    expect(res.ok).toBe(true);
    expect((res.data as unknown[]).length).toBe(0);
  });
});
