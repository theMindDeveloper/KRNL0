/**
 * sys task parallel — ADR 0004 alias-for-sibling CLI tests.
 * Verifies that `task parallel` and `task sibling` produce equivalent results
 * (both route to the same implementation).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  taskAdd,
  taskParallel,
  taskSibling,
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
        position: { x: 0, y: 0 },
        state: { items: [] } as TodoState,
        config: { showCompleted: true, maxVisible: 50 },
      },
    ],
    edges: [],
  };
  writeFileSync(boardPath, JSON.stringify(board), 'utf-8');
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'krnl0-task-parallel-'));
  boardPath = join(tmpDir, 'board.json');
  seedBoardOnDisk();
  ctx = { boardPath };
});

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

describe('sys task parallel', () => {
  it('creates a new parallel task node', async () => {
    await taskAdd(ctx, TODO_MOTHER_ID, 'first task');
    const source = findTasks()[0]!;
    const res = await taskParallel(ctx, source.id);
    expect(res.ok).toBe(true);
    expect(findTasks()).toHaveLength(2);
  });

  it('positions the new node below the source (y + 240, same x)', async () => {
    await taskAdd(ctx, TODO_MOTHER_ID, 'source');
    const source = findTasks()[0]!;
    const sourceX = source.position?.x ?? 0;
    const sourceY = source.position?.y ?? 0;
    await taskParallel(ctx, source.id);
    const parallel = findTasks().find((t) => t.id !== source.id)!;
    expect(parallel.position?.x).toBe(sourceX);
    expect(parallel.position?.y).toBe(sourceY + 240);
  });

  it('adds a TodoItem to the parent TodoNode', async () => {
    await taskAdd(ctx, TODO_MOTHER_ID, 'source task');
    const source = findTasks()[0]!;
    await taskParallel(ctx, source.id);
    const items = readBoard().nodes.find(
      (n) => n.kind === 'todo' && n.isMother === true,
    )!.state as TodoState;
    expect(items.items).toHaveLength(2);
  });

  it('is functionally equivalent to task sibling', async () => {
    // Run parallel in a fresh board, sibling in another, compare structure.
    await taskAdd(ctx, TODO_MOTHER_ID, 'task A');
    const sourceParallel = findTasks()[0]!;
    const parallelRes = await taskParallel(ctx, sourceParallel.id);
    const parallelTaskCount = findTasks().length;
    const parallelEdgeCount = readBoard().edges.length;

    // Reset board.
    seedBoardOnDisk();
    await taskAdd(ctx, TODO_MOTHER_ID, 'task A');
    const sourceSibling = findTasks()[0]!;
    await taskSibling(ctx, sourceSibling.id);
    const siblingTaskCount = findTasks().length;
    const siblingEdgeCount = readBoard().edges.length;

    expect(parallelRes.ok).toBe(true);
    expect(parallelTaskCount).toBe(siblingTaskCount);
    expect(parallelEdgeCount).toBe(siblingEdgeCount);
  });

  it('fails when task ref is not found', async () => {
    const res = await taskParallel(ctx, 'nonexistent');
    expect(res.ok).toBe(false);
  });

  it('fails when id is undefined', async () => {
    const res = await taskParallel(ctx, undefined);
    expect(res.ok).toBe(false);
  });
});
