// Decision 29 — task kind + task note CLI commands
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { taskKind, taskNote, type TaskCtx } from '../../../src/sys/commands/task';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';

let tmpDir = '';
let boardPath = '';
let ctx: TaskCtx;

function seedBoard(opts: {
  taskKind?: 'focus' | 'event';
  pomoStatus?: string;
  activeTaskId?: string | null;
} = {}) {
  const taskId = 'task-aaaa1111';
  const board = {
    version: 1,
    schemaVersion: 1,
    nodes: [
      {
        id: 'mother-todo',
        kind: 'todo',
        isMother: true,
        position: { x: 0, y: 0 },
        state: { items: [] },
        config: {},
      },
      {
        id: taskId,
        kind: 'todo.task',
        isMother: false,
        position: { x: 100, y: 100 },
        state: {
          text: 'Test task',
          done: false,
          durationMin: 25,
          eta: '~25 min',
          sequenceNumber: 1,
          layer: 0,
          createdAt: '2026-05-17T00:00:00.000Z',
          parentTodoId: 'mother-todo',
          parentTaskId: null,
          todoItemId: null,
          pomoSessionsCompleted: 0,
          plannedMin: 25,
          secondsAccumulated: 0,
          currentSessionElapsedSec: 0,
          kind: opts.taskKind ?? 'focus',
        } as TaskState,
        config: { showDuration: true },
      },
      {
        id: 'mother-pomo',
        kind: 'pomo',
        isMother: true,
        position: { x: -1400, y: 0 },
        state: {
          status: opts.pomoStatus ?? 'idle',
          startedAt: opts.pomoStatus === 'running' ? '2026-05-17T00:00:00.000Z' : null,
          durationMin: 25,
          breakMin: 5,
          label: '',
          sessionsCompleted: 0,
          activeTaskId: opts.activeTaskId !== undefined ? opts.activeTaskId : null,
          history: [],
          pausedAt: null,
          pausedElapsedMs: 0,
        },
        config: { sessionMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4 },
      },
    ],
    edges: [],
  };
  writeFileSync(boardPath, JSON.stringify(board), 'utf-8');
  return taskId;
}

function readTaskState(taskId: string): TaskState {
  const board = JSON.parse(readFileSync(boardPath, 'utf-8'));
  const node = board.nodes.find((n: { id: string }) => n.id === taskId);
  return node.state as TaskState;
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'krnl0-task-kind-'));
  boardPath = join(tmpDir, 'board.json');
  ctx = { boardPath };
});

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

describe('task kind (#180 — event-only)', () => {
  // #180: 'focus' is no longer a task kind. Tasks are events; the Pomodoro is
  // an independent observer with no task link. Loading a board also migrates
  // any legacy 'focus' task to 'event'.

  it('setting kind to event is accepted (already event after migration)', async () => {
    const id = seedBoard({ taskKind: 'event' });
    const res = await taskKind(ctx, id, 'event');
    expect(res.ok).toBe(true);
    expect(readTaskState(id).kind).toBe('event');
  });

  it("refuses 'focus' as a target kind (no longer exists)", async () => {
    const id = seedBoard({ taskKind: 'event' });
    const res = await taskKind(ctx, id, 'focus');
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/focus.*no longer/i);
  });

  it('refuses with missing ref', async () => {
    seedBoard();
    const res = await taskKind(ctx, undefined, 'event');
    expect(res.ok).toBe(false);
  });

  it('refuses with missing kind value', async () => {
    const id = seedBoard();
    const res = await taskKind(ctx, id, undefined);
    expect(res.ok).toBe(false);
  });

  it('resolves task by id prefix', async () => {
    const id = seedBoard({ taskKind: 'event' });
    const res = await taskKind(ctx, id.slice(0, 8), 'event');
    expect(res.ok).toBe(true);
    expect(readTaskState(id).kind).toBe('event');
  });
});

describe('task note', () => {
  it('sets a note on a task', async () => {
    const id = seedBoard();
    const res = await taskNote(ctx, id, 'important note', false);
    expect(res.ok).toBe(true);
    expect(readTaskState(id).note).toBe('important note');
  });

  it('clears note with --clear', async () => {
    const id = seedBoard();
    await taskNote(ctx, id, 'some note', false);
    const res = await taskNote(ctx, id, undefined, true);
    expect(res.ok).toBe(true);
    expect(readTaskState(id).note).toBeUndefined();
  });

  it('clears note when setting empty text', async () => {
    const id = seedBoard();
    await taskNote(ctx, id, 'some note', false);
    const res = await taskNote(ctx, id, '   ', false);
    expect(res.ok).toBe(true);
    expect(readTaskState(id).note).toBeUndefined();
  });

  it('refuses with missing ref', async () => {
    seedBoard();
    const res = await taskNote(ctx, undefined, 'hi', false);
    expect(res.ok).toBe(false);
  });

  it('refuses when no text and no --clear', async () => {
    const id = seedBoard();
    const res = await taskNote(ctx, id, undefined, false);
    expect(res.ok).toBe(false);
  });
});
