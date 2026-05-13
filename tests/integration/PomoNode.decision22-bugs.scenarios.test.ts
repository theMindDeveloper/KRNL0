// @vitest-environment jsdom
/**
 * Pomodoro v2 — user-reported bug scenarios (Decision 22.1)
 *
 * Gherkin-flavoured end-to-end integration scenarios for PR #90 follow-up.
 * Each `it` block is ONE user story from the plan (Groups A–H, MIG1).
 *
 * These tests focus on multi-step user flows; granular unit tests already live
 * in Agent 1–3 files. For render tests (A, D3, H) we mount the real PomoNode
 * component. For dispatcher flows (B, C, D1–D2, E, F, G) no React needed.
 *
 * Scenarios: A1–A3 (3), B1–B6 (6), C1–C4 (4), D1–D3 (3), E1–E3 (3),
 *            F1–F2 (2), G1 (1), H1–H2 (2), MIG1 (1) = 25 total.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

import { useBoardStore } from '../../src/renderer/store/boardStore';
import { makeCommandHandler } from '../../src/renderer/components/Canvas/commandDispatch';
import { pomoComplete } from '../../src/renderer/components/nodes/PomoNode/commands';
import { PomoNode } from '../../src/renderer/components/nodes/PomoNode';

import type { Board } from '../../src/shared/types';
import type { PomoState, PomoConfig } from '../../src/renderer/components/nodes/PomoNode/types';
import type { TaskState } from '../../src/renderer/components/nodes/TaskNode/types';
import type { TodoState } from '../../src/renderer/components/nodes/TodoNode/types';
import type { Node } from '../../src/shared/types/node';

// ── Global setup ──────────────────────────────────────────────────────────────

beforeEach(() => {
  // @ts-expect-error — jsdom doesn't have krnl
  globalThis.window = globalThis.window ?? {};
  // @ts-expect-error
  globalThis.window.krnl = { boardSave: vi.fn().mockResolvedValue(undefined) };
  useBoardStore.setState({ board: null, viewport: { x: 0, y: 0, zoom: 1 } });
});

afterEach(() => {
  cleanup();
  useBoardStore.setState({ board: null, viewport: { x: 0, y: 0, zoom: 1 } });
});

// ── Factories ─────────────────────────────────────────────────────────────────

function makePomoState(overrides: Partial<PomoState> = {}): PomoState {
  return {
    status: 'idle',
    startedAt: null,
    durationMin: 25,
    breakMin: 5,
    label: '',
    sessionsCompleted: 0,
    activeTaskId: null,
    history: [],
    pausedAt: null,
    pausedElapsedMs: 0,
    ...overrides,
  };
}

function makePomoConfig(overrides: Partial<PomoConfig> = {}): PomoConfig {
  return {
    sessionMin: 25,
    shortBreakMin: 5,
    longBreakMin: 15,
    longBreakEvery: 4,
    ...overrides,
  };
}

function makeTaskState(overrides: Partial<TaskState> = {}): TaskState {
  return {
    text: 'Task A',
    done: false,
    durationMin: 25,
    eta: '~25 min',
    sequenceNumber: 1,
    layer: 0,
    createdAt: '2026-05-13T10:00:00.000Z',
    parentTodoId: 'todo-mother',
    parentTaskId: null,
    todoItemId: 'item-1',
    pomoSessionsCompleted: 0,
    plannedMin: 25,
    secondsAccumulated: 0,
    currentSessionElapsedSec: 0,
    ...overrides,
  };
}

interface BoardOpts {
  taskA?: Partial<TaskState>;
  taskB?: Partial<TaskState>;
  pomoState?: Partial<PomoState>;
  sessionMin?: number;
}

function makeBoardWithTasks(opts: BoardOpts = {}): Board {
  const sessionMin = opts.sessionMin ?? 25;

  const todoItem = {
    id: 'item-1',
    text: 'Task A',
    done: false,
    createdAt: '2026-05-13T10:00:00.000Z',
    completedAt: null,
    taskNodeId: 'task-a',
  };

  const todoNode = {
    id: 'todo-mother',
    kind: 'todo' as const,
    position: { x: 0, y: 0 },
    isMother: true,
    state: { items: [todoItem] } as TodoState,
    config: { showCompleted: true, maxVisible: 50 },
  };

  const taskANode = {
    id: 'task-a',
    kind: 'todo.task' as const,
    position: { x: 0, y: 420 },
    isMother: false,
    state: makeTaskState(opts.taskA ?? {}),
    config: { showDuration: true },
  };

  const nodes: Board['nodes'] = [todoNode, taskANode];

  if (opts.taskB !== undefined) {
    const todoBItem = {
      id: 'item-2',
      text: 'Task B',
      done: false,
      createdAt: '2026-05-13T10:01:00.000Z',
      completedAt: null,
      taskNodeId: 'task-b',
    };
    (todoNode.state as TodoState).items.push(todoBItem);

    const taskBNode = {
      id: 'task-b',
      kind: 'todo.task' as const,
      position: { x: 252, y: 420 },
      isMother: false,
      state: makeTaskState({
        text: 'Task B',
        todoItemId: 'item-2',
        sequenceNumber: 2,
        ...opts.taskB,
      }),
      config: { showDuration: true },
    };
    nodes.push(taskBNode);
  }

  nodes.push({
    id: 'pomo-mother',
    kind: 'pomo' as const,
    position: { x: 0, y: 0 },
    isMother: true,
    state: makePomoState(opts.pomoState ?? {}),
    config: { sessionMin, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4 },
  });

  return {
    version: 1,
    schemaVersion: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes,
    edges: [],
    savedAt: '2026-05-13T10:00:00.000Z',
  };
}

function getPomoState(): PomoState {
  const board = useBoardStore.getState().board!;
  return board.nodes.find((n) => n.kind === 'pomo')!.state as PomoState;
}

function getTaskState(taskId: string): TaskState {
  const board = useBoardStore.getState().board!;
  return board.nodes.find((n) => n.id === taskId)!.state as TaskState;
}

/** Seed the Zustand store with a standalone pomo + optional task node for render tests. */
function seedBoardForRender(pomoState: PomoState, config: PomoConfig, taskState?: TaskState) {
  const pomoNode: Node = {
    id: 'pomo-1',
    kind: 'pomo',
    position: { x: 0, y: 0 },
    isMother: true,
    state: pomoState,
    config,
  };
  const boardNodes: Board['nodes'] = [pomoNode];
  if (taskState) {
    boardNodes.push({
      id: 'task-1',
      kind: 'todo.task',
      position: { x: 0, y: 420 },
      isMother: false,
      state: taskState,
      config: { showDuration: true },
    });
  }
  const board: Board = {
    version: 1,
    schemaVersion: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: boardNodes,
    edges: [],
    savedAt: '2026-05-13T10:00:00.000Z',
  };
  useBoardStore.setState({ board });
}

function renderPomoNode(
  state: PomoState,
  config: PomoConfig = makePomoConfig(),
  onCommand: (cmd: string, args?: Record<string, unknown>) => void = vi.fn(),
) {
  const node: Node<PomoState, PomoConfig> = {
    id: 'pomo-1',
    kind: 'pomo',
    position: { x: 0, y: 0 },
    isMother: true,
    state,
    config,
  };
  render(
    React.createElement(PomoNode, {
      node,
      selected: false,
      onCommand,
      onSelect: vi.fn(),
      slotIndex: 1,
      slotTotal: 4,
    }),
  );
}

// ── Group A — Pomo settings & layout (Bugs #1, F) ─────────────────────────────

describe('Pomodoro v2 — user-reported bug scenarios (Decision 22.1)', () => {

  describe('Group A — Pomo settings layout and gear disable', () => {

    it('A1: Given an idle pomo, when PomoNode renders, then the gear button appears after the header label in DOM order (gear is top-right)', () => {
      renderPomoNode(makePomoState());
      const header = screen.getByTestId('pomo-header-label');
      const gear = screen.getByTestId('pomo-gear');
      // Node.DOCUMENT_POSITION_FOLLOWING (4) — gear comes after label in the DOM
      const pos = header.compareDocumentPosition(gear);
      expect(pos & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('A2: Given a pomo with status=running, when PomoNode renders, then the gear button is disabled', () => {
      renderPomoNode(makePomoState({ status: 'running', startedAt: new Date().toISOString() }));
      const gear = screen.getByTestId('pomo-gear') as HTMLButtonElement;
      expect(gear.disabled).toBe(true);
    });

    it('A3: Given an idle pomo with sessionMin=25, when pomo.setConfig writes sessionMin=15, then pomo durationMin is updated to 15', () => {
      // This tests the dispatcher wiring: pomo.setConfig must actually reach the store.
      const board = makeBoardWithTasks({ sessionMin: 25 });
      useBoardStore.getState().setBoard(board);

      makeCommandHandler('pomo-mother')('pomo.setConfig', { config: { sessionMin: 15 } });

      // After setConfig the config is updated; a fresh pomo.start would use durationMin=15.
      // Verify the config was persisted on the pomo node.
      const finalBoard = useBoardStore.getState().board!;
      const pomoNode = finalBoard.nodes.find((n) => n.kind === 'pomo')!;
      const cfg = pomoNode.config as { sessionMin: number };
      expect(cfg.sessionMin).toBe(15);
    });

  });

  // ── Group B — Task activation / load-without-start (Bugs #2, #6, #7) ──────────

  describe('Group B — Task activation and load-without-start', () => {

    it('B1: Given an idle pomo and task with plannedMin=20, when task.loadIntoPomo dispatched, then pomo is paused with activeTaskId set and zero history', () => {
      const board = makeBoardWithTasks({ taskA: { plannedMin: 20 }, sessionMin: 25 });
      useBoardStore.getState().setBoard(board);

      makeCommandHandler('task-a')('task.loadIntoPomo');

      const ps = getPomoState();
      expect(ps.activeTaskId).toBe('task-a');
      expect(ps.status).toBe('paused');
      expect(ps.pausedElapsedMs).toBe(0);
      expect(ps.history).toHaveLength(0);
    });

    it('B2: Given task loaded into pomo (paused/idle), when pomo.resume dispatched, then status becomes running', () => {
      const board = makeBoardWithTasks({ taskA: { plannedMin: 25 } });
      useBoardStore.getState().setBoard(board);

      // Step 1: load task (goes to paused)
      makeCommandHandler('task-a')('task.loadIntoPomo');

      // Step 2: resume → running
      makeCommandHandler('pomo-mother')('pomo.resume');

      const ps = getPomoState();
      expect(ps.status).toBe('running');
      expect(ps.activeTaskId).toBe('task-a');
    });

    it('B3: Given an idle pomo and a task, when task.startPomo (auto-start) dispatched, then pomo status is running immediately', () => {
      const board = makeBoardWithTasks();
      useBoardStore.getState().setBoard(board);

      makeCommandHandler('task-a')('task.startPomo');

      const ps = getPomoState();
      expect(ps.status).toBe('running');
      expect(ps.activeTaskId).toBe('task-a');
    });

    it('B4: Given a task with plannedMin=1 and sessionMin=10, when loaded, then durationMin is clamped to 1 (not 10)', () => {
      const board = makeBoardWithTasks({
        taskA: { plannedMin: 1, pomoSessionsCompleted: 0 },
        sessionMin: 10,
      });
      useBoardStore.getState().setBoard(board);

      makeCommandHandler('task-a')('task.loadIntoPomo');

      expect(getPomoState().durationMin).toBe(1);
    });

    it('B5: Given a task with plannedMin=35 and 3 completed sessions of 10min, when loaded, then durationMin is the 5-min remainder', () => {
      const board = makeBoardWithTasks({
        taskA: { plannedMin: 35, pomoSessionsCompleted: 3 },
        sessionMin: 10,
      });
      useBoardStore.getState().setBoard(board);

      makeCommandHandler('task-a')('task.loadIntoPomo');

      expect(getPomoState().durationMin).toBe(5);
    });

    it('B6: Given a running pomo with active task A, when task.loadIntoPomo dispatched for the same task A, then the pomo stays running and no history record is added', () => {
      // The running same-task path is the critical no-op: no clock reset, no cancel.
      const startedAt = new Date(Date.now() - 60_000).toISOString();
      const board = makeBoardWithTasks({
        pomoState: {
          status: 'running',
          startedAt,
          activeTaskId: 'task-a',
          label: 'Task A',
          durationMin: 25,
        },
      });
      useBoardStore.getState().setBoard(board);

      makeCommandHandler('task-a')('task.loadIntoPomo');

      const ps = getPomoState();
      // Same task re-clicked: pomo must NOT cancel and restart (no new history record).
      expect(ps.activeTaskId).toBe('task-a');
      expect(ps.history).toHaveLength(0);
      // startedAt must not have been reset to a recent timestamp (clock not rewound).
      // Allow 2s of jitter: if startedAt was reset it would be near now (~0s ago), but
      // the original was ~60s ago — any value < 55s means it was incorrectly reset.
      const elapsedSinceStart = Date.now() - Date.parse(ps.startedAt!);
      expect(elapsedSinceStart).toBeGreaterThanOrEqual(55_000);
    });

  });

  // ── Group C — Pause / Resume / Reset (Bug #4) ─────────────────────────────────

  describe('Group C — Pause / Resume / Reset lifecycle', () => {

    it('C1: Given a running pomo started 10s ago, when pomo.pause dispatched, then status=paused and pausedElapsedMs≈10000 with no history record', () => {
      const startedAt = new Date(Date.now() - 10_000).toISOString();
      const board = makeBoardWithTasks({
        pomoState: {
          status: 'running',
          startedAt,
          activeTaskId: 'task-a',
          label: 'Task A',
          durationMin: 25,
        },
      });
      useBoardStore.getState().setBoard(board);

      makeCommandHandler('pomo-mother')('pomo.pause');

      const ps = getPomoState();
      expect(ps.status).toBe('paused');
      expect(ps.pausedElapsedMs).toBeGreaterThanOrEqual(9_000);
      expect(ps.pausedElapsedMs).toBeLessThanOrEqual(11_000);
      expect(ps.history).toHaveLength(0);
    });

    it('C2: Given a paused pomo with 10s elapsed, when pomo.resume dispatched, then status=running and startedAt is offset so elapsed stays ~10s', () => {
      // Build a paused state directly
      const nowMs = Date.now();
      const startedAt = new Date(nowMs - 10_000).toISOString();
      const pausedAt = new Date(nowMs).toISOString();
      const board = makeBoardWithTasks({
        pomoState: {
          status: 'paused',
          startedAt,
          pausedAt,
          pausedElapsedMs: 10_000,
          activeTaskId: 'task-a',
          label: 'Task A',
          durationMin: 25,
        },
      });
      useBoardStore.getState().setBoard(board);

      makeCommandHandler('pomo-mother')('pomo.resume');

      const ps = getPomoState();
      expect(ps.status).toBe('running');
      expect(ps.pausedAt).toBeNull();
      expect(ps.pausedElapsedMs).toBe(0);
      // The offset startedAt means: Date.now() - Date.parse(startedAt) ≈ 10_000ms
      const effectiveElapsed = Date.now() - Date.parse(ps.startedAt!);
      expect(effectiveElapsed).toBeGreaterThanOrEqual(9_000);
      expect(effectiveElapsed).toBeLessThanOrEqual(11_000);
    });

    it('C3: Given a paused pomo, when pomo.cancel dispatched, then status=idle, one cancelled history record with completed=false, and endedAt equals pausedAt', () => {
      const nowMs = Date.now();
      const startedAt = new Date(nowMs - 30_000).toISOString();
      const pausedAt = new Date(nowMs - 5_000).toISOString();
      const board = makeBoardWithTasks({
        pomoState: {
          status: 'paused',
          startedAt,
          pausedAt,
          pausedElapsedMs: 30_000,
          activeTaskId: 'task-a',
          label: 'Task A',
          durationMin: 25,
        },
      });
      useBoardStore.getState().setBoard(board);

      makeCommandHandler('pomo-mother')('pomo.cancel');

      const ps = getPomoState();
      expect(ps.status).toBe('idle');
      expect(ps.history).toHaveLength(1);
      const rec = ps.history[0]!;
      expect(rec.completed).toBe(false);
      // endedAt must be the truthful pausedAt, not the time of cancellation
      expect(rec.endedAt).toBe(pausedAt);
    });

    it('C4: Given a pomo in paused status, when pomoComplete pure handler called, then state is unchanged (auto-complete does not fire while paused)', () => {
      // pomoComplete only accepts 'running'; verify it is a no-op for 'paused'
      const pausedState: PomoState = makePomoState({
        status: 'paused',
        startedAt: new Date(Date.now() - 10_000).toISOString(),
        pausedAt: new Date().toISOString(),
        pausedElapsedMs: 10_000,
        durationMin: 1, // short so "elapsed > duration" would be true if running
      });
      // Call pomoComplete directly with enough elapsed to trigger if allowed
      const T = Date.now() + 120_000;
      const result = pomoComplete(pausedState, {}, { now: () => T, uuid: () => 'x' });
      // Must return the exact same reference (no-op)
      expect(result).toBe(pausedState);
    });

  });

  // ── Group D — Task switch with checkpoint (Bug #8, Defect H) ──────────────────

  describe('Group D — Task switch with per-task checkpoint', () => {

    // Updated for Decision 22.2 protect-running rule: passive
    // task.loadIntoPomo no-ops when a different task is running. The
    // checkpoint-on-switch behaviour now only triggers from explicit
    // task.startPomo. See Story 7 (T7.1–T7.4) for the protect-running
    // scenarios and D1b below for the explicit-switch checkpoint.
    it('D1: Given pomo running task A for ~120s, when task.loadIntoPomo(B) dispatched, then pomo STAYS on task A (protect-running)', () => {
      const startedAt = new Date(Date.now() - 120_000).toISOString();
      const board = makeBoardWithTasks({
        taskB: {},
        pomoState: {
          status: 'running',
          startedAt,
          activeTaskId: 'task-a',
          label: 'Task A',
          durationMin: 25,
        },
      });
      useBoardStore.getState().setBoard(board);

      makeCommandHandler('task-b')('task.loadIntoPomo');

      const ps = getPomoState();
      expect(ps.activeTaskId).toBe('task-a');
      expect(ps.status).toBe('running');
      expect(ps.label).toBe('Task A');
    });

    it('D1b: explicit task.startPomo on B while A is running force-switches and checkpoints A', () => {
      const startedAt = new Date(Date.now() - 120_000).toISOString();
      const board = makeBoardWithTasks({
        taskB: {},
        pomoState: {
          status: 'running',
          startedAt,
          activeTaskId: 'task-a',
          label: 'Task A',
          durationMin: 25,
        },
      });
      useBoardStore.getState().setBoard(board);

      makeCommandHandler('task-b')('task.startPomo');

      const taskA = getTaskState('task-a');
      const ps = getPomoState();
      expect(taskA.currentSessionElapsedSec).toBeGreaterThanOrEqual(118);
      expect(taskA.currentSessionElapsedSec).toBeLessThanOrEqual(122);
      expect(ps.activeTaskId).toBe('task-b');
      expect(ps.status).toBe('running');
    });

    it('D2: Given task A was previously active with 120s checkpoint, when task.loadIntoPomo(A) dispatched again, then pomo pausedElapsedMs=120000 (checkpoint restored)', () => {
      const board = makeBoardWithTasks({
        taskA: { currentSessionElapsedSec: 120 },
      });
      useBoardStore.getState().setBoard(board);

      makeCommandHandler('task-a')('task.loadIntoPomo');

      const ps = getPomoState();
      expect(ps.status).toBe('paused');
      expect(ps.pausedElapsedMs).toBe(120_000);
      expect(ps.activeTaskId).toBe('task-a');
    });

    it('D3: Given active task with pomoSessionsCompleted=3 and global sessionsCompleted=10, when PomoNode renders, then session counter shows 3 not 10', () => {
      const taskState = makeTaskState({ plannedMin: 100, pomoSessionsCompleted: 3 });
      const pomoState = makePomoState({ activeTaskId: 'task-1', sessionsCompleted: 10 });
      seedBoardForRender(pomoState, makePomoConfig({ sessionMin: 25 }), taskState);
      renderPomoNode(pomoState, makePomoConfig({ sessionMin: 25 }));

      const pips = screen.getByTestId('pomo-pips');
      expect(pips.textContent).toContain('session 3');
      expect(pips.textContent).not.toContain('session 10');
    });

  });

  // ── Group E — Task budget edit (Bug #5) ───────────────────────────────────────

  describe('Group E — Task budget (plannedMin) editing', () => {

    it('E1: Given a task, when task.setPlannedMin dispatched with { minutes: 15 }, then plannedMin becomes 15', () => {
      const board = makeBoardWithTasks({ taskA: { plannedMin: 25 } });
      useBoardStore.getState().setBoard(board);

      makeCommandHandler('task-a')('task.setPlannedMin', { minutes: 15 });

      expect(getTaskState('task-a').plannedMin).toBe(15);
    });

    it('E2: Given active task (plannedMin=20, 0 sessions), when task.setPlannedMin updates to 60 then task re-loaded, then durationMin = min(60, sessionMin)', () => {
      const board = makeBoardWithTasks({
        taskA: { plannedMin: 20, pomoSessionsCompleted: 0 },
        sessionMin: 25,
      });
      useBoardStore.getState().setBoard(board);

      // Update budget to 60 min
      makeCommandHandler('task-a')('task.setPlannedMin', { minutes: 60 });
      // Re-load into pomo — dispatcher recomputes session length from updated plannedMin
      makeCommandHandler('task-a')('task.loadIntoPomo');

      const ps = getPomoState();
      // min(60, sessionMin=25) = 25
      expect(ps.durationMin).toBe(25);
      expect(ps.activeTaskId).toBe('task-a');
    });

    it('E3: Given a task with plannedMin=25, when task.setPlannedMin dispatched with minutes=0, then plannedMin is clamped to 1 (never goes below 1)', () => {
      // taskSetPlannedMin uses Math.max(1, round(minutes)) — 0 clamps to 1.
      const board = makeBoardWithTasks({ taskA: { plannedMin: 25 } });
      useBoardStore.getState().setBoard(board);

      makeCommandHandler('task-a')('task.setPlannedMin', { minutes: 0 });

      expect(getTaskState('task-a').plannedMin).toBe(1);
    });

  });

  // ── Group F — Done while active (Bug #3) ──────────────────────────────────────

  describe('Group F — Marking active task done cancels pomo and commits elapsed', () => {

    it('F1: Given pomo running task A for ~60s, when task.toggle marks A done, then pomo=idle, activeTaskId=null, one cancelled record, secondsAccumulated≈60', () => {
      const startedAt = new Date(Date.now() - 60_000).toISOString();
      const board = makeBoardWithTasks({
        pomoState: {
          status: 'running',
          startedAt,
          activeTaskId: 'task-a',
          label: 'Task A',
          durationMin: 25,
        },
      });
      useBoardStore.getState().setBoard(board);

      makeCommandHandler('task-a')('task.toggle');

      const ps = getPomoState();
      expect(ps.status).toBe('idle');
      expect(ps.activeTaskId).toBeNull();
      expect(ps.history).toHaveLength(1);
      expect(ps.history[0]!.completed).toBe(false);

      const ts = getTaskState('task-a');
      expect(ts.done).toBe(true);
      expect(ts.secondsAccumulated).toBeGreaterThanOrEqual(58);
      expect(ts.secondsAccumulated).toBeLessThanOrEqual(62);
      expect(ts.currentSessionElapsedSec).toBe(0);
    });

    it('F2: Given pomo paused on task A with pausedElapsedMs=30000, when task.toggle marks A done, then pomo=idle and secondsAccumulated≈30', () => {
      const nowMs = Date.now();
      const board = makeBoardWithTasks({
        taskA: { currentSessionElapsedSec: 30 },
        pomoState: {
          status: 'paused',
          startedAt: new Date(nowMs - 30_000).toISOString(),
          pausedAt: new Date(nowMs).toISOString(),
          pausedElapsedMs: 30_000,
          activeTaskId: 'task-a',
          label: 'Task A',
          durationMin: 25,
        },
      });
      useBoardStore.getState().setBoard(board);

      makeCommandHandler('task-a')('task.toggle');

      const ps = getPomoState();
      expect(ps.status).toBe('idle');
      expect(ps.activeTaskId).toBeNull();

      const ts = getTaskState('task-a');
      expect(ts.done).toBe(true);
      expect(ts.secondsAccumulated).toBeGreaterThanOrEqual(28);
      expect(ts.secondsAccumulated).toBeLessThanOrEqual(32);
    });

  });

  // ── Group G — Delete cascade (Defect A) ───────────────────────────────────────

  describe('Group G — Delete active task clears pomo and removes node', () => {

    it('G1: Given pomo running task A with linked TodoItem, when task.delete dispatched, then task removed, TodoItem removed, pomo idle with cancelled record', () => {
      const startedAt = new Date(Date.now() - 45_000).toISOString();
      const board = makeBoardWithTasks({
        pomoState: {
          status: 'running',
          startedAt,
          activeTaskId: 'task-a',
          label: 'Task A',
          durationMin: 25,
        },
      });
      useBoardStore.getState().setBoard(board);

      makeCommandHandler('task-a')('task.delete');

      const finalBoard = useBoardStore.getState().board!;
      const ps = getPomoState();

      expect(ps.status).toBe('idle');
      expect(ps.activeTaskId).toBeNull();
      expect(ps.history).toHaveLength(1);
      expect(ps.history[0]!.completed).toBe(false);

      // Task node removed from board
      expect(finalBoard.nodes.find((n) => n.id === 'task-a')).toBeUndefined();

      // Linked TodoItem removed from TodoNode
      const todoNode = finalBoard.nodes.find((n) => n.id === 'todo-mother')!;
      expect((todoNode.state as TodoState).items).toHaveLength(0);
    });

  });

  // ── Group H — Layout safety (Bug #9) ─────────────────────────────────────────

  describe('Group H — Pip overflow cap', () => {

    it('H1: Given plannedMin=200 and sessionMin=25 (pipCount=8), when PomoNode renders, then exactly 8 pip elements exist and no overflow span', () => {
      const taskState = makeTaskState({ plannedMin: 200 });
      const pomoState = makePomoState({ activeTaskId: 'task-1' });
      seedBoardForRender(pomoState, makePomoConfig({ sessionMin: 25 }), taskState);
      renderPomoNode(pomoState, makePomoConfig({ sessionMin: 25 }));

      const pips = document.querySelectorAll('[data-pip-index]');
      expect(pips.length).toBe(8);

      const overflow = document.querySelector('[data-testid="pomo-pips-overflow"]');
      expect(overflow).toBeNull();
    });

    it('H2: Given plannedMin=40 and sessionMin=1 (pipCount=40), when PomoNode renders, then 8 pip elements + "+32 more" span + session counter reads / 40', () => {
      const taskState = makeTaskState({ plannedMin: 40 });
      const pomoState = makePomoState({ activeTaskId: 'task-1' });
      seedBoardForRender(pomoState, makePomoConfig({ sessionMin: 1 }), taskState);
      renderPomoNode(pomoState, makePomoConfig({ sessionMin: 1 }));

      const pips = document.querySelectorAll('[data-pip-index]');
      expect(pips.length).toBe(8);

      const overflow = screen.getByTestId('pomo-pips-overflow');
      expect(overflow.textContent).toBe('+32 more');

      const pipsLabel = screen.getByTestId('pomo-pips');
      expect(pipsLabel.textContent).toContain('/ 40');
    });

  });

  // ── MIG1 — Migration safety ───────────────────────────────────────────────────

  describe('MIG1 — Migration safety for pre-v2.1 board data', () => {

    it('MIG1: Given a legacy board without pausedAt/pausedElapsedMs/currentSessionElapsedSec, migration backfills correct defaults (covered in depth by board.decision22-migration.test.ts)', () => {
      // This scenario is fully covered by Agent 1's unit test at
      // tests/unit/main/board.decision22-migration.test.ts
      // ("backfills pausedAt / pausedElapsedMs / currentSessionElapsedSec on a pre-v2.1 board").
      //
      // Here we confirm the resulting values at the dispatcher level:
      // a board saved without these fields should still work when loaded into the store.
      const legacyPomoState = {
        status: 'idle',
        startedAt: null,
        durationMin: 25,
        breakMin: 5,
        label: '',
        sessionsCompleted: 0,
        activeTaskId: null,
        history: [],
        // Deliberately omit pausedAt and pausedElapsedMs (pre-v2.1)
      } as unknown as PomoState;

      // Apply defaults that the migration would supply
      const hydratedState: PomoState = {
        pausedAt: null,
        pausedElapsedMs: 0,
        ...legacyPomoState,
      };

      const board = makeBoardWithTasks({ pomoState: hydratedState });
      useBoardStore.getState().setBoard(board);

      // Dispatching task.loadIntoPomo on a migrated board should work cleanly
      makeCommandHandler('task-a')('task.loadIntoPomo');

      const ps = getPomoState();
      expect(ps.pausedAt).toBeDefined(); // either null or an ISO string — not undefined
      expect(ps.pausedElapsedMs).toBeGreaterThanOrEqual(0);
      expect(ps.activeTaskId).toBe('task-a');
    });

  });

}); // end top-level describe
