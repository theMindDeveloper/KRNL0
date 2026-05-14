// Issue #117 §4 — `krnl todo add` must create a TodoItem + paired TaskNode
// with the bidirectional link, matching the renderer path (Decision 20).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { todoAdd, todoList, todoCheck, type TodoCtx } from '../../../src/sys/commands/todo';
import type { TodoState } from '../../../src/renderer/components/nodes/TodoNode/types';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';

let tmpDir = '';
let boardPath = '';
let ctx: TodoCtx;

const TODO_MOTHER = 'mother-todo';

interface AnyNode {
  id: string;
  kind: string;
  isMother?: boolean;
  state: unknown;
  [k: string]: unknown;
}
interface BoardOnDisk {
  nodes: AnyNode[];
  edges: { id: string; from: { nodeId: string; event: string }; to: { nodeId: string; command: string }; enabled: boolean }[];
}

function readBoard(): BoardOnDisk {
  return JSON.parse(readFileSync(boardPath, 'utf-8')) as BoardOnDisk;
}

function seed(): void {
  const board: BoardOnDisk = {
    nodes: [
      {
        id: TODO_MOTHER,
        kind: 'todo',
        isMother: true,
        position: { x: 0, y: 0 },
        state: { items: [] } as TodoState,
        config: { showCompleted: true, maxVisible: 50 },
      } as AnyNode,
    ],
    edges: [],
  };
  writeFileSync(boardPath, JSON.stringify(board), 'utf-8');
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'krnl0-todo-pair-'));
  boardPath = join(tmpDir, 'board.json');
  seed();
  ctx = { boardPath };
});

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

describe('todo add — pair creation (issue #117 §4)', () => {
  it('creates both a TodoItem and a linked TaskNode', async () => {
    const res = await todoAdd(ctx, 'Week 1: Python');
    expect(res.ok).toBe(true);

    const board = readBoard();
    const todoMother = board.nodes.find((n) => n.id === TODO_MOTHER)!;
    const items = (todoMother.state as TodoState).items;
    const tasks = board.nodes.filter((n) => n.kind === 'todo.task');

    expect(items).toHaveLength(1);
    expect(tasks).toHaveLength(1);
  });

  it('sets bidirectional link (item.taskNodeId ↔ task.todoItemId)', async () => {
    const res = await todoAdd(ctx, 'Buy milk');
    expect(res.ok).toBe(true);

    const board = readBoard();
    const todoMother = board.nodes.find((n) => n.id === TODO_MOTHER)!;
    const item = (todoMother.state as TodoState).items[0]!;
    const task = board.nodes.find((n) => n.kind === 'todo.task')!;
    const taskState = task.state as TaskState;

    expect(item.taskNodeId).toBe(task.id);
    expect(taskState.todoItemId).toBe(item.id);
  });

  it('returns todoItemId and taskNodeId in result data', async () => {
    const res = await todoAdd(ctx, 'thing');
    expect(res.ok).toBe(true);
    const data = res.data as { todoItemId: string; taskNodeId: string };
    expect(data.todoItemId).toBeTruthy();
    expect(data.taskNodeId).toBeTruthy();
    expect(data.taskNodeId.startsWith('task-')).toBe(true);
  });

  it('chains a task.next edge from the previous task on the 2nd add', async () => {
    await todoAdd(ctx, 'first');
    await todoAdd(ctx, 'second');
    const board = readBoard();
    expect(board.edges.length).toBeGreaterThanOrEqual(1);
    const chain = board.edges.find(
      (e) => e.from.event === 'task.next' && e.to.command === 'task.activate',
    );
    expect(chain).toBeDefined();
  });

  it('passes the tag through to both the TodoItem and the TaskNode', async () => {
    await todoAdd(ctx, 'Learn ML', 'ml');
    const board = readBoard();
    const item = (board.nodes.find((n) => n.id === TODO_MOTHER)!.state as TodoState).items[0]!;
    const task = board.nodes.find((n) => n.kind === 'todo.task')!;
    expect(item.tag).toBe('ml');
    expect((task.state as TaskState & { tag?: string }).tag).toBe('ml');
  });
});

describe('todo list --json', () => {
  it('emits bare JSON when json=true', async () => {
    await todoAdd(ctx, 'one');
    await todoAdd(ctx, 'two');
    const res = await todoList(ctx, true);
    expect(res.ok).toBe(true);
    // The result message must be parseable JSON (issue #117 §2 + §5).
    const parsed = JSON.parse(res.message!) as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(2);
  });
});

describe('issue #117 §8 verification scenario — verbatim step 5', () => {
  // Reproduces the verbatim error transcript from the issue body:
  //   krnl task add "Linear algebra review" --todo c27bc74b --duration 60
  // where c27bc74b is the 8-char prefix of a TodoItem id returned by `todo list`.
  // Before this fix, the CLI errored "No todo node with id \"c27bc74b\"".
  it('task add --todo <todoItemPrefix> succeeds and links to the parent TodoNode', async () => {
    // arrange: create a TodoItem via `todo add` (auto-creates a paired TaskNode too)
    const addRes = await todoAdd(ctx, 'Week 1: Python & Math Foundations', 'ml');
    expect(addRes.ok).toBe(true);
    const data = addRes.data as { todoItemId: string };
    const itemPrefix = data.todoItemId.slice(0, 8);

    // act: load the sys task module here to avoid hoisting issues
    const { taskAdd } = await import('../../../src/sys/commands/task');
    const res = await taskAdd(ctx, itemPrefix, 'Linear algebra review', 60);

    // assert
    expect(res.ok).toBe(true);
    const board = readBoard();
    const newTask = board.nodes.find(
      (n) => n.kind === 'todo.task' && (n.state as { text: string }).text === 'Linear algebra review',
    );
    expect(newTask).toBeDefined();
    // The new task lives on the mother TodoNode (same parent as the existing item).
    expect((newTask!.state as { parentTodoId: string }).parentTodoId).toBe(TODO_MOTHER);
  });
});

describe('todo check — prefix and text resolution (issue #117 §1)', () => {
  it('resolves a TodoItem by 8-char prefix', async () => {
    const addRes = await todoAdd(ctx, 'pay rent');
    const itemId = (addRes.data as { todoItemId: string }).todoItemId;
    const prefix = itemId.slice(0, 8);
    const res = await todoCheck(ctx, prefix);
    expect(res.ok).toBe(true);
    expect((res.data as { done: boolean }).done).toBe(true);
  });

  it('resolves a TodoItem by exact text', async () => {
    await todoAdd(ctx, 'pay rent');
    const res = await todoCheck(ctx, 'pay rent');
    expect(res.ok).toBe(true);
  });
});
