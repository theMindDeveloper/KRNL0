/**
 * sys clock day / clock show — ADR 0004 day-selector CLI tests.
 * Verifies that clockDay mutates the clock mother selectedDate and
 * clockShow filters placements to the selected day + viewWindow.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { clockDay, clockShow, type ClockCtx } from '../../../src/sys/commands/clock';
import type { ClockState } from '../../../src/renderer/components/nodes/ClockNode/types';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';
import type { TodoState } from '../../../src/renderer/components/nodes/TodoNode/types';

let tmpDir = '';
let boardPath = '';
let ctx: ClockCtx;

const TODO_MOTHER_ID = 'mother-todo';
const CLOCK_MOTHER_ID = 'mother-clock';

interface AnyNode {
  id: string;
  kind: string;
  isMother?: boolean;
  state: unknown;
  position?: { x: number; y: number };
  config?: unknown;
  [k: string]: unknown;
}

function readBoard(): { nodes: AnyNode[]; edges: unknown[] } {
  return JSON.parse(readFileSync(boardPath, 'utf-8')) as { nodes: AnyNode[]; edges: unknown[] };
}

function writeBoard(board: unknown): void {
  writeFileSync(boardPath, JSON.stringify(board), 'utf-8');
}

function findClockMother(): AnyNode {
  return readBoard().nodes.find((n) => n.kind === 'clock' && n.isMother === true)!;
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

const TASK_SCHEDULED_DATE = '2026-05-15';

function seedBoard(selectedDate = '2026-05-15', viewWindow: 0 | 1 = 0, includeScheduled = false): void {
  const anchorId = 'task-clock-001';
  const itemA = 'item-clock-a';

  const taskNodes: AnyNode[] = includeScheduled ? [
    {
      id: anchorId,
      kind: 'todo.task',
      isMother: false,
      position: { x: 0, y: 420 },
      state: makeTaskState({
        text: 'scheduled task',
        todoItemId: itemA,
        // Always pin task to TASK_SCHEDULED_DATE so we can set clock to a different date.
        scheduledFor: `${TASK_SCHEDULED_DATE}T09:00`,
        plannedMin: 30,
      }),
      config: { showDuration: true },
    },
  ] : [];

  const todoState: TodoState = {
    items: includeScheduled
      ? [{ id: itemA, text: 'scheduled task', done: false, createdAt: new Date().toISOString(), completedAt: null, taskNodeId: anchorId }]
      : [],
  };

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
        state: todoState,
        config: { showCompleted: true, maxVisible: 50 },
      },
      {
        id: CLOCK_MOTHER_ID,
        kind: 'clock',
        isMother: true,
        position: { x: 500, y: 0 },
        state: { linkedTodoId: null, viewWindow, selectedDate } as ClockState,
        config: {},
      },
      ...taskNodes,
    ],
    edges: [],
  };
  writeBoard(board);
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'krnl0-clock-'));
  boardPath = join(tmpDir, 'board.json');
  ctx = { boardPath };
});

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

describe('sys clock day', () => {
  it('sets an absolute YYYY-MM-DD date', async () => {
    seedBoard('2026-05-15');
    const res = await clockDay(ctx, '2026-05-20');
    expect(res.ok).toBe(true);
    expect((findClockMother().state as ClockState).selectedDate).toBe('2026-05-20');
  });

  it('"today" resets to today\'s local date (YYYY-MM-DD pattern)', async () => {
    seedBoard('2020-01-01');
    const res = await clockDay(ctx, 'today');
    expect(res.ok).toBe(true);
    const date = (findClockMother().state as ClockState).selectedDate;
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('"+1" advances the selected date by one day', async () => {
    seedBoard('2026-05-15');
    const res = await clockDay(ctx, '+1');
    expect(res.ok).toBe(true);
    expect((findClockMother().state as ClockState).selectedDate).toBe('2026-05-16');
  });

  it('"-1" retreats the selected date by one day', async () => {
    seedBoard('2026-05-15');
    const res = await clockDay(ctx, '-1');
    expect(res.ok).toBe(true);
    expect((findClockMother().state as ClockState).selectedDate).toBe('2026-05-14');
  });

  it('rejects an invalid date string', async () => {
    seedBoard('2026-05-15');
    const res = await clockDay(ctx, 'not-a-date');
    expect(res.ok).toBe(false);
  });

  it('finds the clock mother even in a minimal board (migration injects one)', async () => {
    // loadBoardFrom runs migrateAddClockMother so a clock mother always exists.
    writeBoard({
      version: 1, schemaVersion: 1, savedAt: '', viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [], edges: [],
    });
    const res = await clockDay(ctx, '2026-05-15');
    expect(res.ok).toBe(true);
  });

  it('fails when arg is undefined', async () => {
    seedBoard('2026-05-15');
    const res = await clockDay(ctx, undefined);
    expect(res.ok).toBe(false);
  });
});

describe('sys clock show', () => {
  it('returns "no scheduled tasks in window" when nothing is scheduled', async () => {
    seedBoard('2026-05-15', 0, false);
    const res = await clockShow(ctx, false);
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/no scheduled tasks in window/);
  });

  it('shows scheduled task for the selected date', async () => {
    seedBoard(TASK_SCHEDULED_DATE, 0, true);
    const res = await clockShow(ctx, false);
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/09:00/);
    expect(res.message).toMatch(/scheduled task/);
  });

  it('includes the selectedDate in the header', async () => {
    seedBoard(TASK_SCHEDULED_DATE, 0, true);
    const res = await clockShow(ctx, false);
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(new RegExp(TASK_SCHEDULED_DATE));
  });

  it('does not show tasks from a different date', async () => {
    // Task is always at TASK_SCHEDULED_DATE (2026-05-15); clock is on 2026-05-16.
    seedBoard('2026-05-16', 0, true);
    const res = await clockShow(ctx, false);
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/no scheduled tasks in window/);
  });

  it('returns JSON payload when --json is set', async () => {
    seedBoard(TASK_SCHEDULED_DATE, 0, true);
    const res = await clockShow(ctx, true);
    expect(res.ok).toBe(true);
    const payload = JSON.parse(res.message!) as { selectedDate: string; viewWindow: number; placements: unknown[] };
    expect(payload).toHaveProperty('selectedDate', TASK_SCHEDULED_DATE);
    expect(payload).toHaveProperty('viewWindow', 0);
    expect(Array.isArray(payload.placements)).toBe(true);
  });

  it('shows no tasks when board has clock mother but no tasks (migration injects clock mother)', async () => {
    // loadBoardFrom runs migrateAddClockMother so a clock mother always exists.
    writeBoard({
      version: 1, schemaVersion: 1, savedAt: '', viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [], edges: [],
    });
    const res = await clockShow(ctx, false);
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/no scheduled tasks in window/);
  });

  it('window=1 does not show 09:00 tasks (morning is window 0)', async () => {
    // Task is at 2026-05-15T09:00 (AM window). Clock selectedDate matches but viewWindow=1 (PM).
    seedBoard(TASK_SCHEDULED_DATE, 1, true);
    const res = await clockShow(ctx, false);
    expect(res.ok).toBe(true);
    // 09:00 task is in window 0 (AM), clock is on window 1 (PM)
    expect(res.message).toMatch(/no scheduled tasks in window/);
  });
});
