/**
 * sys task schedule / unschedule — ADR 0003/0005 CLI parity tests.
 * Verifies that the CLI correctly sets/clears scheduledFor on TaskNode state
 * and mirrors the change to the linked TodoItem.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  taskAdd,
  taskSchedule,
  taskUnschedule,
  type TaskCtx,
} from '../../../src/sys/commands/task';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';
import type { TodoState } from '../../../src/renderer/components/nodes/TodoNode/types';

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
  edges: Array<{
    id: string;
    from: { nodeId: string; event: string };
    to: { nodeId: string; command: string };
    enabled: boolean;
  }>;
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
        position: { x: 0, y: 0 },
        state: { items: [] } as TodoState,
        config: { showCompleted: true, maxVisible: 50 },
      },
      {
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
        },
        config: { defaultDurationMin: 25, defaultBreakMin: 5, longBreakEvery: 4, longBreakMin: 15 },
      },
    ],
    edges: [],
  };
  writeFileSync(boardPath, JSON.stringify(board), 'utf-8');
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'krnl0-task-schedule-'));
  boardPath = join(tmpDir, 'board.json');
  seedBoardOnDisk();
  ctx = { boardPath };
});

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

describe('sys task schedule', () => {
  it('sets scheduledFor on the task node state', async () => {
    await taskAdd(ctx, TODO_MOTHER_ID, 'write tests');
    const taskId = (findTasks()[0]!).id;
    const res = await taskSchedule(ctx, taskId, '2026-05-15T09:00');
    expect(res.ok).toBe(true);
    const ts = findTasks()[0]!.state as TaskState;
    expect(ts.scheduledFor).toBe('2026-05-15T09:00');
  });

  it('sets scheduledDurationMin when --duration is provided', async () => {
    await taskAdd(ctx, TODO_MOTHER_ID, 'write tests');
    const taskId = (findTasks()[0]!).id;
    await taskSchedule(ctx, taskId, '2026-05-15T09:00', 45);
    const ts = findTasks()[0]!.state as TaskState;
    expect(ts.scheduledFor).toBe('2026-05-15T09:00');
    expect(ts.scheduledDurationMin).toBe(45);
  });

  it('mirrors scheduledFor to the linked TodoItem', async () => {
    await taskAdd(ctx, TODO_MOTHER_ID, 'write tests');
    const taskId = (findTasks()[0]!).id;
    await taskSchedule(ctx, taskId, '2026-05-15T10:30');
    const todoItems = (findTodoMother().state as TodoState).items;
    expect(todoItems[0]!.scheduledFor).toBe('2026-05-15T10:30');
  });

  it('accepts a task ref (prefix) instead of full id', async () => {
    await taskAdd(ctx, TODO_MOTHER_ID, 'review PR');
    const taskNode = findTasks()[0]!;
    // resolveNodeRef matches against the full id from position 0 (e.g. "task-abc123...")
    const prefix = taskNode.id.slice(0, 12);
    const res = await taskSchedule(ctx, prefix, '2026-05-16T14:00');
    expect(res.ok).toBe(true);
    expect((findTasks()[0]!.state as TaskState).scheduledFor).toBe('2026-05-16T14:00');
  });

  it('fails when task ref is not found', async () => {
    const res = await taskSchedule(ctx, 'nonexistent', '2026-05-15T09:00');
    expect(res.ok).toBe(false);
  });

  it('fails when --at is missing', async () => {
    const res = await taskSchedule(ctx, 'some-id', undefined);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/--at/);
  });
});

describe('sys task unschedule', () => {
  it('removes scheduledFor from the task node state (field absent, not null)', async () => {
    await taskAdd(ctx, TODO_MOTHER_ID, 'write tests');
    const taskId = (findTasks()[0]!).id;
    await taskSchedule(ctx, taskId, '2026-05-15T09:00');
    expect((findTasks()[0]!.state as TaskState).scheduledFor).toBe('2026-05-15T09:00');

    const res = await taskUnschedule(ctx, taskId);
    expect(res.ok).toBe(true);
    const ts = findTasks()[0]!.state as TaskState;
    // The field must be entirely absent — taskSetSchedule destructures it out.
    expect('scheduledFor' in ts).toBe(false);
  });

  it('removes scheduledDurationMin alongside scheduledFor', async () => {
    await taskAdd(ctx, TODO_MOTHER_ID, 'with duration');
    const taskId = (findTasks()[0]!).id;
    await taskSchedule(ctx, taskId, '2026-05-15T09:00', 60);
    await taskUnschedule(ctx, taskId);
    const ts = findTasks()[0]!.state as TaskState;
    expect('scheduledFor' in ts).toBe(false);
    expect('scheduledDurationMin' in ts).toBe(false);
  });

  it('mirrors the clear to the linked TodoItem', async () => {
    await taskAdd(ctx, TODO_MOTHER_ID, 'mirror test');
    const taskId = (findTasks()[0]!).id;
    await taskSchedule(ctx, taskId, '2026-05-15T09:00');
    await taskUnschedule(ctx, taskId);
    const item = (findTodoMother().state as TodoState).items[0]!;
    expect('scheduledFor' in item).toBe(false);
  });

  it('is idempotent when task was not scheduled', async () => {
    await taskAdd(ctx, TODO_MOTHER_ID, 'unscheduled task');
    const taskId = (findTasks()[0]!).id;
    const res = await taskUnschedule(ctx, taskId);
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/was not scheduled/);
  });

  it('fails when task ref is not found', async () => {
    const res = await taskUnschedule(ctx, 'nonexistent');
    expect(res.ok).toBe(false);
  });
});
