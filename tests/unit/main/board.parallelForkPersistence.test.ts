/**
 * ADR 0004 §1 — regression test: parallel task.next forks survive save/load.
 *
 * Pre-ADR-0004, `migrateTaskChain` in src/main/persistence/board.ts ran on
 * every load and silently collapsed any parallel fork into a single linear
 * createdAt-ordered chain by filtering out every edge whose `to.nodeId`
 * matched a task id, then re-emitting linear synthetic `edge-chain-*` edges.
 *
 * This test builds a board with taskA -task.next-> taskB AND
 * taskA -task.next-> taskC (a parallel fork), saves to a temp path, loads
 * it back, and asserts BOTH original edges survive and NO synthetic
 * `edge-chain-*` edges were synthesised by a migration.
 *
 * Also asserts that selectScheduledTasksForRange exposes both branches when
 * taskA is anchored (the fork structure must reach the cascade selector).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBoardFrom, saveBoardTo } from '../../../src/main/persistence/board';
import {
  selectSchedule,
  selectScheduledTasksForRange,
} from '../../../src/renderer/store/scheduleSelector';
import type { Board } from '../../../src/shared/types';

let tmpDir = '';
let boardPath = '';

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'krnl-fork-'));
  boardPath = join(tmpDir, 'board.json');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeTaskNode(
  id: string,
  todoId: string,
  itemId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    kind: 'todo.task',
    position: { x: 0, y: 0 },
    isMother: false,
    state: {
      text: id,
      done: false,
      durationMin: 25,
      eta: '~25 min',
      sequenceNumber: 1,
      layer: 0,
      createdAt: '2026-05-10T10:00:00.000Z',
      parentTodoId: todoId,
      parentTaskId: null,
      todoItemId: itemId,
      pomoSessionsCompleted: 0,
      plannedMin: 25,
      secondsAccumulated: 0,
      currentSessionElapsedSec: 0,
      ...overrides,
    },
    config: { showDuration: true },
  };
}

function makeForkEdge(fromId: string, toId: string): Record<string, unknown> {
  return {
    id: `edge-${fromId}-${toId}`,
    from: { nodeId: fromId, event: 'task.next' },
    to: { nodeId: toId, command: 'task.activate' },
    enabled: true,
  };
}

describe('ADR 0004 §1 — parallel task.next forks survive save/load', () => {
  it('preserves both fork edges across save/load with no synthesised chain edges', () => {
    const todoId = 'todo-fork';
    const board: Record<string, unknown> = {
      version: 1,
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: todoId,
          kind: 'todo',
          position: { x: 0, y: 0 },
          isMother: true,
          state: {
            items: [
              { id: 'item-a', text: 'A', done: false, taskNodeId: 'taskA' },
              { id: 'item-b', text: 'B', done: false, taskNodeId: 'taskB' },
              { id: 'item-c', text: 'C', done: false, taskNodeId: 'taskC' },
            ],
          },
          config: {},
        },
        makeTaskNode('taskA', todoId, 'item-a', {
          scheduledFor: '2026-05-20T10:00',
        }),
        makeTaskNode('taskB', todoId, 'item-b'),
        makeTaskNode('taskC', todoId, 'item-c'),
      ],
      edges: [
        makeForkEdge('taskA', 'taskB'),
        makeForkEdge('taskA', 'taskC'),
      ],
    };

    saveBoardTo(boardPath, board);
    const loaded = loadBoardFrom(boardPath) as { edges: Array<Record<string, unknown>> };

    // Both original fork edges survive verbatim.
    const edgeIds = loaded.edges.map((e) => e['id']);
    expect(edgeIds).toEqual(
      expect.arrayContaining(['edge-taskA-taskB', 'edge-taskA-taskC']),
    );
    expect(edgeIds).toHaveLength(2);

    // No edge id collisions (Set size matches array length).
    expect(new Set(edgeIds).size).toBe(edgeIds.length);

    // No synthesised `edge-chain-*` edges (proof migrateTaskChain is gone).
    expect(edgeIds.every((id) => typeof id === 'string' && !id.startsWith('edge-chain-'))).toBe(
      true,
    );

    // Fork structure reaches selectSchedule: both B and C share a startISO
    // (parallel) and report the same parallelGroupId.
    const { placements } = selectSchedule(loaded as unknown as Board);
    expect(placements.size).toBe(3);
    const pA = placements.get('taskA');
    const pB = placements.get('taskB');
    const pC = placements.get('taskC');
    expect(pA?.startISO).toBe('2026-05-20T10:00');
    expect(pB?.startISO).toBe('2026-05-20T10:25');
    expect(pC?.startISO).toBe('2026-05-20T10:25');
    expect(pB?.parallelGroupId).not.toBeNull();
    expect(pB?.parallelGroupId).toBe(pC?.parallelGroupId);

    // Range selector picks up both parallel placements for the anchored day.
    const inRange = selectScheduledTasksForRange(
      loaded as unknown as Board,
      '2026-05-20T00:00',
      '2026-05-21T00:00',
    );
    const ids = inRange.map((p) => p.taskId).sort();
    expect(ids).toEqual(['taskA', 'taskB', 'taskC']);
  });
});
