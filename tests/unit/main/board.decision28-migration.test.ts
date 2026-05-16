/**
 * Decision 28 — board migration test (§10 item 4).
 *
 * Asserts that task nodes with absent or invalid `kind` fields are
 * backfilled to 'focus' on load. Boards with a valid 'event' value
 * are preserved unchanged.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBoardFrom } from '../../../src/main/persistence/board';

interface LoadedBoard {
  nodes: Array<{
    id: string;
    kind: string;
    state?: Record<string, unknown>;
    config?: Record<string, unknown>;
  }>;
  edges: unknown[];
}

describe('Decision 28 — board migration: task kind backfill', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'krnl0-d28-'));
    path = join(dir, 'board.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('backfills kind=focus when the kind field is absent (pre-Decision-28 board)', () => {
    const legacy = {
      version: 1,
      schemaVersion: 1,
      savedAt: '2026-05-16T00:00:00.000Z',
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: 'mother-todo',
          kind: 'todo',
          position: { x: -840, y: 0 },
          isMother: true,
          state: { items: [] },
          config: { showCompleted: true, maxVisible: 50 },
        },
        {
          id: 'task-no-kind',
          kind: 'todo.task',
          position: { x: 0, y: 200 },
          isMother: false,
          // No 'kind' field — pre-Decision-28 board
          state: {
            text: 'legacy task without kind',
            done: false,
            durationMin: 25,
            eta: '~25 min',
            sequenceNumber: 1,
            layer: 0,
            createdAt: '2026-05-16T10:00:00.000Z',
            parentTodoId: 'mother-todo',
            parentTaskId: null,
            todoItemId: null,
            pomoSessionsCompleted: 0,
            plannedMin: 25,
            secondsAccumulated: 0,
            currentSessionElapsedSec: 0,
          },
          config: { showDuration: true },
        },
      ],
      edges: [],
    };
    writeFileSync(path, JSON.stringify(legacy), 'utf-8');
    const loaded = loadBoardFrom(path) as LoadedBoard;
    const task = loaded.nodes.find((n) => n.id === 'task-no-kind')!;
    expect(task).toBeDefined();
    expect(task.state?.['kind']).toBe('focus');
  });

  it('rewrites kind=garbage to focus (invalid kind field)', () => {
    const legacy = {
      version: 1,
      schemaVersion: 1,
      savedAt: '2026-05-16T00:00:00.000Z',
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: 'mother-todo',
          kind: 'todo',
          position: { x: -840, y: 0 },
          isMother: true,
          state: { items: [] },
          config: { showCompleted: true, maxVisible: 50 },
        },
        {
          id: 'task-bad-kind',
          kind: 'todo.task',
          position: { x: 0, y: 200 },
          isMother: false,
          state: {
            text: 'task with garbage kind',
            done: false,
            durationMin: 25,
            eta: '~25 min',
            sequenceNumber: 1,
            layer: 0,
            createdAt: '2026-05-16T10:00:00.000Z',
            parentTodoId: 'mother-todo',
            parentTaskId: null,
            todoItemId: null,
            pomoSessionsCompleted: 0,
            plannedMin: 25,
            secondsAccumulated: 0,
            currentSessionElapsedSec: 0,
            kind: 'garbage',
          },
          config: { showDuration: true },
        },
      ],
      edges: [],
    };
    writeFileSync(path, JSON.stringify(legacy), 'utf-8');
    const loaded = loadBoardFrom(path) as LoadedBoard;
    const task = loaded.nodes.find((n) => n.id === 'task-bad-kind')!;
    expect(task).toBeDefined();
    expect(task.state?.['kind']).toBe('focus');
  });

  it('preserves kind=event when already set to a valid value', () => {
    const board = {
      version: 1,
      schemaVersion: 1,
      savedAt: '2026-05-16T00:00:00.000Z',
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: 'mother-todo',
          kind: 'todo',
          position: { x: -840, y: 0 },
          isMother: true,
          state: { items: [] },
          config: { showCompleted: true, maxVisible: 50 },
        },
        {
          id: 'task-event',
          kind: 'todo.task',
          position: { x: 0, y: 200 },
          isMother: false,
          state: {
            text: 'calendar event task',
            done: false,
            durationMin: 60,
            eta: '~60 min',
            sequenceNumber: 1,
            layer: 0,
            createdAt: '2026-05-16T10:00:00.000Z',
            parentTodoId: 'mother-todo',
            parentTaskId: null,
            todoItemId: null,
            pomoSessionsCompleted: 0,
            plannedMin: 60,
            secondsAccumulated: 0,
            currentSessionElapsedSec: 0,
            kind: 'event',
          },
          config: { showDuration: true },
        },
      ],
      edges: [],
    };
    writeFileSync(path, JSON.stringify(board), 'utf-8');
    const loaded = loadBoardFrom(path) as LoadedBoard;
    const task = loaded.nodes.find((n) => n.id === 'task-event')!;
    expect(task).toBeDefined();
    expect(task.state?.['kind']).toBe('event');
  });

  it('migrates multiple tasks with mixed kinds in a single board', () => {
    const board = {
      version: 1,
      schemaVersion: 1,
      savedAt: '2026-05-16T00:00:00.000Z',
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: 'mother-todo',
          kind: 'todo',
          position: { x: -840, y: 0 },
          isMother: true,
          state: { items: [] },
          config: { showCompleted: true, maxVisible: 50 },
        },
        {
          id: 'task-no-kind',
          kind: 'todo.task',
          position: { x: 0, y: 200 },
          isMother: false,
          state: {
            text: 'no kind',
            done: false,
            durationMin: 25,
            eta: '~25 min',
            sequenceNumber: 1,
            layer: 0,
            createdAt: '2026-05-16T10:00:00.000Z',
            parentTodoId: 'mother-todo',
            parentTaskId: null,
            todoItemId: null,
            pomoSessionsCompleted: 0,
            plannedMin: 25,
            secondsAccumulated: 0,
            currentSessionElapsedSec: 0,
          },
          config: { showDuration: true },
        },
        {
          id: 'task-bad',
          kind: 'todo.task',
          position: { x: 252, y: 200 },
          isMother: false,
          state: {
            text: 'garbage kind',
            done: false,
            durationMin: 25,
            eta: '~25 min',
            sequenceNumber: 2,
            layer: 0,
            createdAt: '2026-05-16T10:00:00.000Z',
            parentTodoId: 'mother-todo',
            parentTaskId: null,
            todoItemId: null,
            pomoSessionsCompleted: 0,
            plannedMin: 25,
            secondsAccumulated: 0,
            currentSessionElapsedSec: 0,
            kind: 'garbage',
          },
          config: { showDuration: true },
        },
        {
          id: 'task-event',
          kind: 'todo.task',
          position: { x: 504, y: 200 },
          isMother: false,
          state: {
            text: 'already event',
            done: false,
            durationMin: 60,
            eta: '~60 min',
            sequenceNumber: 3,
            layer: 0,
            createdAt: '2026-05-16T10:00:00.000Z',
            parentTodoId: 'mother-todo',
            parentTaskId: null,
            todoItemId: null,
            pomoSessionsCompleted: 0,
            plannedMin: 60,
            secondsAccumulated: 0,
            currentSessionElapsedSec: 0,
            kind: 'event',
          },
          config: { showDuration: true },
        },
      ],
      edges: [],
    };
    writeFileSync(path, JSON.stringify(board), 'utf-8');
    const loaded = loadBoardFrom(path) as LoadedBoard;

    const taskNoKind = loaded.nodes.find((n) => n.id === 'task-no-kind')!;
    expect(taskNoKind.state?.['kind']).toBe('focus');

    const taskBad = loaded.nodes.find((n) => n.id === 'task-bad')!;
    expect(taskBad.state?.['kind']).toBe('focus');

    const taskEvent = loaded.nodes.find((n) => n.id === 'task-event')!;
    expect(taskEvent.state?.['kind']).toBe('event');
  });
});
