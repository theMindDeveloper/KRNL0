/**
 * sys cal show — ADR 0003/0005 cascade-schedule CLI tests.
 * Verifies that calShow reads selectSchedule and formats placements correctly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { calShow, type CalCtx } from '../../../src/sys/commands/cal';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';
import type { TodoState } from '../../../src/renderer/components/nodes/TodoNode/types';

let tmpDir = '';
let boardPath = '';
let ctx: CalCtx;

const TODO_MOTHER_ID = 'mother-todo';

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

function writeBoard(board: unknown): void {
  writeFileSync(boardPath, JSON.stringify(board), 'utf-8');
}

function makeTaskState(overrides: Partial<TaskState> = {}): TaskState {
  return {
    text: 'test task',
    done: false,
    durationMin: 25,
    eta: '~25 min',
    sequenceNumber: 1,
    layer: 0,
    createdAt: new Date().toISOString(),
    parentTodoId: TODO_MOTHER_ID,
    parentTaskId: null,
    todoItemId: null,
    pomoSessionsCompleted: 0,
    plannedMin: 25,
    secondsAccumulated: 0,
    currentSessionElapsedSec: 0,
    ...overrides,
  };
}

function seedBoardWithScheduledTasks(): void {
  // task-anchor: scheduled at 09:00 on 2026-05-15 (25 min)
  // task-derived: chained after task-anchor, derived placement at 09:25
  const anchorId = 'task-anchor-001';
  const derivedId = 'task-derived-01';
  const itemA = 'item-a';
  const itemB = 'item-b';

  const board = {
    version: 1,
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: TODO_MOTHER_ID,
        kind: 'todo',
        isMother: true,
        position: { x: 0, y: 0 },
        state: {
          items: [
            { id: itemA, text: 'anchor task', done: false, createdAt: new Date().toISOString(), completedAt: null, taskNodeId: anchorId },
            { id: itemB, text: 'derived task', done: false, createdAt: new Date().toISOString(), completedAt: null, taskNodeId: derivedId },
          ],
        } as TodoState,
        config: { showCompleted: true, maxVisible: 50 },
      },
      {
        id: anchorId,
        kind: 'todo.task',
        isMother: false,
        position: { x: 0, y: 420 },
        state: makeTaskState({
          text: 'anchor task',
          todoItemId: itemA,
          scheduledFor: '2026-05-15T09:00',
          plannedMin: 25,
        }),
        config: { showDuration: true },
      },
      {
        id: derivedId,
        kind: 'todo.task',
        isMother: false,
        position: { x: 252, y: 420 },
        state: makeTaskState({
          text: 'derived task',
          todoItemId: itemB,
          sequenceNumber: 2,
          plannedMin: 30,
        }),
        config: { showDuration: true },
      },
    ],
    edges: [
      {
        id: 'edge-chain-001',
        from: { nodeId: anchorId, event: 'task.next' },
        to: { nodeId: derivedId, command: 'task.activate' },
        enabled: true,
      },
    ],
  };
  writeBoard(board);
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'krnl0-cal-'));
  boardPath = join(tmpDir, 'board.json');
  ctx = { boardPath };
});

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

describe('sys cal show', () => {
  it('returns ok with "No scheduled tasks" when board is empty', async () => {
    const emptyBoard = {
      version: 1, schemaVersion: 1, savedAt: '', viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [{ id: TODO_MOTHER_ID, kind: 'todo', isMother: true, position: { x: 0, y: 0 },
        state: { items: [] }, config: {} }],
      edges: [],
    };
    writeBoard(emptyBoard);
    const res = await calShow(ctx, undefined, undefined, false);
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/No scheduled tasks/);
  });

  it('lists the anchor task placement', async () => {
    seedBoardWithScheduledTasks();
    const res = await calShow(ctx, undefined, undefined, false);
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/09:00/);
    expect(res.message).toMatch(/anchor task/);
    expect(res.message).toMatch(/\[A\]/);
  });

  it('lists the derived task placement after the anchor', async () => {
    seedBoardWithScheduledTasks();
    const res = await calShow(ctx, undefined, undefined, false);
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/09:25/);
    expect(res.message).toMatch(/derived task/);
    expect(res.message).toMatch(/->/);
  });

  it('returns JSON when --json is set', async () => {
    seedBoardWithScheduledTasks();
    const res = await calShow(ctx, undefined, undefined, true);
    expect(res.ok).toBe(true);
    const payload = JSON.parse(res.message!) as Array<{ taskId: string; startISO: string }>;
    expect(Array.isArray(payload)).toBe(true);
    expect(payload.length).toBeGreaterThanOrEqual(1);
    expect(payload[0]).toHaveProperty('taskId');
    expect(payload[0]).toHaveProperty('startISO');
  });

  it('filters by --from date', async () => {
    seedBoardWithScheduledTasks();
    // Filter to exclude 2026-05-15 (i.e., from 2026-05-16 onwards)
    const res = await calShow(ctx, '2026-05-16', undefined, false);
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/No scheduled tasks/);
  });

  it('filters by --to date (exclusive)', async () => {
    seedBoardWithScheduledTasks();
    // --to is the day of the scheduled tasks — so startISO.slice(0,10) < '2026-05-15' → empty
    const res = await calShow(ctx, undefined, '2026-05-15', false);
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/No scheduled tasks/);
  });

  it('includes the task on the boundary when --to is after it', async () => {
    seedBoardWithScheduledTasks();
    const res = await calShow(ctx, undefined, '2026-05-16', false);
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/anchor task/);
  });

  it('returns "No scheduled tasks" when board file is missing (loadBoardFrom seeds empty board)', async () => {
    // boardPath does not exist — loadBoardFrom seeds a fresh empty board.
    const res = await calShow(ctx, undefined, undefined, false);
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/No scheduled tasks/);
  });
});
