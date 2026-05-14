/**
 * sys task addNext — ADR 0004 sequential successor CLI tests.
 * Verifies that addNext creates a task positioned beside (x+252) the source,
 * at the same layer, wires a task.next edge, and creates a linked TodoItem.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  taskAdd,
  taskAddNext,
  type TaskCtx,
} from '../../../src/sys/commands/task';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';
import type { TodoState } from '../../../src/renderer/components/nodes/TodoNode/types';

let tmpDir = '';
let boardPath = '';
let ctx: TaskCtx;

const TODO_MOTHER_ID = 'mother-todo';

interface AnyNode {
  id: string;
  kind: string;
  isMother?: boolean;
  state: unknown;
  position?: { x: number; y: number };
  [k: string]: unknown;
}

interface AnyEdge {
  id: string;
  from: { nodeId: string; event: string };
  to: { nodeId: string; command: string };
  enabled: boolean;
}

interface BoardOnDisk {
  nodes: AnyNode[];
  edges: AnyEdge[];
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

function seedBoardOnDisk(): void {
  const board = {
    version: 1,
    schemaVersion: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: TODO_MOTHER_ID,
        kind: 'todo',
        isMother: true,
        position: { x: 100, y: 200 },
        state: { items: [] } as TodoState,
        config: { showCompleted: true, maxVisible: 50 },
      },
    ],
    edges: [],
  };
  writeFileSync(boardPath, JSON.stringify(board), 'utf-8');
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'krnl0-task-addnext-'));
  boardPath = join(tmpDir, 'board.json');
  seedBoardOnDisk();
  ctx = { boardPath };
});

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

describe('sys task addNext', () => {
  it('creates a new task with the given text', async () => {
    await taskAdd(ctx, TODO_MOTHER_ID, 'first task');
    const sourceId = findTasks()[0]!.id;
    const res = await taskAddNext(ctx, sourceId, 'second task');
    expect(res.ok).toBe(true);
    const tasks = findTasks();
    expect(tasks).toHaveLength(2);
    const next = tasks.find((t) => (t.state as TaskState).text === 'second task');
    expect(next).toBeDefined();
  });

  it('positions the new task beside the source (x + 252)', async () => {
    await taskAdd(ctx, TODO_MOTHER_ID, 'first task');
    const source = findTasks()[0]!;
    const sourceX = source.position?.x ?? 0;
    const sourceY = source.position?.y ?? 0;
    await taskAddNext(ctx, source.id, 'next task');
    const next = findTasks().find((t) => (t.state as TaskState).text === 'next task')!;
    expect(next.position?.x).toBe(sourceX + 252);
    expect(next.position?.y).toBe(sourceY);
  });

  it('creates a task.next edge from source to the new node', async () => {
    await taskAdd(ctx, TODO_MOTHER_ID, 'first task');
    const source = findTasks()[0]!;
    await taskAddNext(ctx, source.id, 'second task');
    const next = findTasks().find((t) => (t.state as TaskState).text === 'second task')!;
    const board = readBoard();
    const edge = board.edges.find(
      (e) =>
        e.from.nodeId === source.id &&
        e.from.event === 'task.next' &&
        e.to.nodeId === next.id &&
        e.to.command === 'task.activate',
    );
    expect(edge).toBeDefined();
  });

  it('creates a linked TodoItem on the parent TodoNode', async () => {
    await taskAdd(ctx, TODO_MOTHER_ID, 'first task');
    const source = findTasks()[0]!;
    const res = await taskAddNext(ctx, source.id, 'next with item');
    expect(res.ok).toBe(true);
    const items = (findTodoMother().state as TodoState).items;
    expect(items).toHaveLength(2);
    const newItem = items.find((i) => i.text === 'next with item');
    expect(newItem).toBeDefined();
    const newNodeId = (res.data as { id: string }).id;
    expect(newItem!.taskNodeId).toBe(newNodeId);
  });

  it('sets todoItemId back-link on the new TaskState', async () => {
    await taskAdd(ctx, TODO_MOTHER_ID, 'first task');
    const source = findTasks()[0]!;
    const res = await taskAddNext(ctx, source.id, 'linked task');
    const newNodeId = (res.data as { id: string }).id;
    const newTask = findTasks().find((t) => t.id === newNodeId)!;
    const items = (findTodoMother().state as TodoState).items;
    const item = items.find((i) => i.text === 'linked task')!;
    expect((newTask.state as TaskState).todoItemId).toBe(item.id);
  });

  it('inherits source parentTaskId (both null at root level)', async () => {
    await taskAdd(ctx, TODO_MOTHER_ID, 'root task');
    const source = findTasks()[0]!;
    await taskAddNext(ctx, source.id, 'root next');
    const next = findTasks().find((t) => (t.state as TaskState).text === 'root next')!;
    expect((next.state as TaskState).parentTaskId).toBe(null);
  });

  it('uses the provided --duration for the new task', async () => {
    await taskAdd(ctx, TODO_MOTHER_ID, 'first task');
    const source = findTasks()[0]!;
    await taskAddNext(ctx, source.id, 'timed task', 45);
    const next = findTasks().find((t) => (t.state as TaskState).text === 'timed task')!;
    expect((next.state as TaskState).durationMin).toBe(45);
  });

  it('inherits source durationMin when --duration is omitted', async () => {
    await taskAdd(ctx, TODO_MOTHER_ID, 'first task', 30);
    const source = findTasks()[0]!;
    await taskAddNext(ctx, source.id, 'inherits duration');
    const next = findTasks().find((t) => (t.state as TaskState).text === 'inherits duration')!;
    expect((next.state as TaskState).durationMin).toBe(30);
  });

  it('fails when sourceRef is not found', async () => {
    const res = await taskAddNext(ctx, 'nonexistent', 'some task');
    expect(res.ok).toBe(false);
  });

  it('fails when text is missing', async () => {
    const res = await taskAddNext(ctx, 'some-ref', undefined);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/text/i);
  });
});
