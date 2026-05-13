/**
 * TaskNode FSM command tests — Decision #20
 * Source: docs/06-requirements/task-node.md (F8–F13 from plan)
 *
 * F# mapping (plan F-prime → task-node F#):
 *   F8  — opacity on done (styling side; FSM side: taskToggle flips done flag)
 *   F9  — body-click pomo (dispatcher concern; FSM: taskToggle/taskActivate are entry points)
 *   F10 — right-click menu (component concern)
 *   F11 — inline edit via task.edit (taskEdit FSM)
 *   F12 — subtask spawn (dispatcher concern; FSM: taskActivate)
 *   F13 — task.delete cascade (dispatcher concern)
 *
 * This file covers pure FSM: taskToggle, taskEdit, taskIncrementPomo, taskActivate.
 */

import { describe, it, expect } from 'vitest';
import {
  taskToggle,
  taskEdit,
  taskIncrementPomo,
  taskActivate,
  taskSetCurrentSessionElapsedSec,
  taskClearCurrentSessionElapsedSec,
  taskSetDuration,
} from '../../../src/renderer/components/nodes/TaskNode/commands';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';

function makeTaskState(overrides: Partial<TaskState> = {}): TaskState {
  return {
    text: 'write tests',
    done: false,
    tag: 'dev',
    durationMin: 25,
    eta: '~25 min',
    sequenceNumber: 1,
    layer: 0,
    createdAt: '2026-05-10T10:00:00.000Z',
    parentTodoId: 'todo-1',
    parentTaskId: null,
    todoItemId: 'item-1',
    pomoSessionsCompleted: 0,
    plannedMin: 25,
    secondsAccumulated: 0,
    currentSessionElapsedSec: 0,
    ...overrides,
  };
}

// ── taskToggle ────────────────────────────────────────────────────────────────

describe('taskToggle', () => {
  it('F8 — flips done from false to true', () => {
    const s = makeTaskState({ done: false });
    const next = taskToggle(s);
    expect(next.done).toBe(true);
  });

  it('F8 — flips done from true to false', () => {
    const s = makeTaskState({ done: true });
    const next = taskToggle(s);
    expect(next.done).toBe(false);
  });

  it('F8 — all other fields remain unchanged', () => {
    const s = makeTaskState();
    const next = taskToggle(s);
    expect(next.text).toBe(s.text);
    expect(next.durationMin).toBe(s.durationMin);
    expect(next.sequenceNumber).toBe(s.sequenceNumber);
    expect(next.layer).toBe(s.layer);
    expect(next.parentTodoId).toBe(s.parentTodoId);
    expect(next.todoItemId).toBe(s.todoItemId);
    expect(next.pomoSessionsCompleted).toBe(s.pomoSessionsCompleted);
  });

  it('F8 — does not mutate original state (immutable)', () => {
    const s = makeTaskState({ done: false });
    taskToggle(s);
    expect(s.done).toBe(false);
  });

  it('F8 — double-toggle returns to original done state', () => {
    const s = makeTaskState({ done: false });
    expect(taskToggle(taskToggle(s)).done).toBe(false);
  });
});

// ── taskEdit ─────────────────────────────────────────────────────────────────

describe('taskEdit', () => {
  it('F11 — updates the task text', () => {
    const s = makeTaskState({ text: 'old text' });
    const next = taskEdit(s, { text: 'new text' });
    expect(next.text).toBe('new text');
  });

  it('F11 — trims whitespace from text', () => {
    const s = makeTaskState({ text: 'old' });
    const next = taskEdit(s, { text: '  trimmed  ' });
    expect(next.text).toBe('trimmed');
  });

  it('F11 — is a no-op when text is empty', () => {
    const s = makeTaskState({ text: 'keep me' });
    const next = taskEdit(s, { text: '' });
    expect(next).toBe(s); // same reference
  });

  it('F11 — is a no-op when text is only whitespace', () => {
    const s = makeTaskState({ text: 'keep me' });
    const next = taskEdit(s, { text: '   ' });
    expect(next).toBe(s);
  });

  it('F11 — preserves all other fields', () => {
    const s = makeTaskState({ done: true, sequenceNumber: 3 });
    const next = taskEdit(s, { text: 'updated' });
    expect(next.done).toBe(true);
    expect(next.sequenceNumber).toBe(3);
    expect(next.parentTodoId).toBe(s.parentTodoId);
  });

  it('F11 — does not mutate original state', () => {
    const s = makeTaskState({ text: 'original' });
    taskEdit(s, { text: 'changed' });
    expect(s.text).toBe('original');
  });
});

// ── taskIncrementPomo ─────────────────────────────────────────────────────────

describe('taskIncrementPomo', () => {
  it('increments pomoSessionsCompleted by 1', () => {
    const s = makeTaskState({ pomoSessionsCompleted: 0 });
    const next = taskIncrementPomo(s);
    expect(next.pomoSessionsCompleted).toBe(1);
  });

  it('can be called multiple times cumulatively', () => {
    let s = makeTaskState({ pomoSessionsCompleted: 0 });
    s = taskIncrementPomo(s);
    s = taskIncrementPomo(s);
    s = taskIncrementPomo(s);
    expect(s.pomoSessionsCompleted).toBe(3);
  });

  it('preserves all other fields', () => {
    const s = makeTaskState({ text: 'my task', done: false });
    const next = taskIncrementPomo(s);
    expect(next.text).toBe('my task');
    expect(next.done).toBe(false);
  });

  it('does not mutate original state', () => {
    const s = makeTaskState({ pomoSessionsCompleted: 2 });
    taskIncrementPomo(s);
    expect(s.pomoSessionsCompleted).toBe(2);
  });
});

// ── taskActivate ──────────────────────────────────────────────────────────────

describe('taskActivate', () => {
  it('returns state unchanged (identity / no-op signal)', () => {
    const s = makeTaskState();
    const next = taskActivate(s);
    expect(next).toEqual(s);
  });

  it('returns the same reference when called on an undone task', () => {
    const s = makeTaskState({ done: false });
    expect(taskActivate(s)).toBe(s);
  });

  it('returns the same reference when called on a done task', () => {
    const s = makeTaskState({ done: true });
    expect(taskActivate(s)).toBe(s);
  });
});

// ── taskSetCurrentSessionElapsedSec ──────────────────────────────────────────

describe('taskSetCurrentSessionElapsedSec', () => {
  it('writes the given seconds to currentSessionElapsedSec', () => {
    const s = makeTaskState({ currentSessionElapsedSec: 0 });
    const next = taskSetCurrentSessionElapsedSec(s, { seconds: 120 });
    expect(next.currentSessionElapsedSec).toBe(120);
  });

  it('floors a fractional value', () => {
    const s = makeTaskState();
    const next = taskSetCurrentSessionElapsedSec(s, { seconds: 45.9 });
    expect(next.currentSessionElapsedSec).toBe(45);
  });

  it('clamps negative values to 0', () => {
    const s = makeTaskState();
    const next = taskSetCurrentSessionElapsedSec(s, { seconds: -10 });
    expect(next.currentSessionElapsedSec).toBe(0);
  });

  it('clamps 0 explicitly (boundary)', () => {
    const s = makeTaskState();
    const next = taskSetCurrentSessionElapsedSec(s, { seconds: 0 });
    expect(next.currentSessionElapsedSec).toBe(0);
  });

  it('does not mutate original state', () => {
    const s = makeTaskState({ currentSessionElapsedSec: 5 });
    taskSetCurrentSessionElapsedSec(s, { seconds: 99 });
    expect(s.currentSessionElapsedSec).toBe(5);
  });

  it('preserves all other fields', () => {
    const s = makeTaskState({ text: 'important', done: false, plannedMin: 30 });
    const next = taskSetCurrentSessionElapsedSec(s, { seconds: 60 });
    expect(next.text).toBe('important');
    expect(next.done).toBe(false);
    expect(next.plannedMin).toBe(30);
  });
});

// ── taskClearCurrentSessionElapsedSec ─────────────────────────────────────────

describe('taskClearCurrentSessionElapsedSec', () => {
  it('resets currentSessionElapsedSec to 0', () => {
    const s = makeTaskState({ currentSessionElapsedSec: 300 });
    const next = taskClearCurrentSessionElapsedSec(s);
    expect(next.currentSessionElapsedSec).toBe(0);
  });

  it('returns same reference when already 0 (no-op)', () => {
    const s = makeTaskState({ currentSessionElapsedSec: 0 });
    const next = taskClearCurrentSessionElapsedSec(s);
    expect(next).toBe(s);
  });

  it('does not mutate original state', () => {
    const s = makeTaskState({ currentSessionElapsedSec: 100 });
    taskClearCurrentSessionElapsedSec(s);
    expect(s.currentSessionElapsedSec).toBe(100);
  });

  it('preserves all other fields', () => {
    const s = makeTaskState({ text: 'focus task', secondsAccumulated: 600 });
    const next = taskClearCurrentSessionElapsedSec({ ...s, currentSessionElapsedSec: 50 });
    expect(next.text).toBe('focus task');
    expect(next.secondsAccumulated).toBe(600);
  });
});

// ── taskSetDuration ───────────────────────────────────────────────────────────

describe('taskSetDuration', () => {
  it('updates durationMin and eta', () => {
    const s = makeTaskState({ durationMin: 20, eta: '~20 min' });
    const next = taskSetDuration(s, { durationMin: 45 });
    expect(next.durationMin).toBe(45);
    expect(next.eta).toBe('~45 min');
  });

  it('clamps minimum to 1', () => {
    const s = makeTaskState({ durationMin: 20 });
    expect(taskSetDuration(s, { durationMin: 0 }).durationMin).toBe(1);
    expect(taskSetDuration(s, { durationMin: -5 }).durationMin).toBe(1);
  });

  it('clamps maximum to 480', () => {
    const s = makeTaskState({ durationMin: 20 });
    expect(taskSetDuration(s, { durationMin: 600 }).durationMin).toBe(480);
  });

  it('rounds fractional input', () => {
    const s = makeTaskState({ durationMin: 20 });
    expect(taskSetDuration(s, { durationMin: 22.6 }).durationMin).toBe(23);
  });

  it('preserves all other fields', () => {
    const s = makeTaskState({ text: 'duration task', done: false, secondsAccumulated: 1000 });
    const next = taskSetDuration(s, { durationMin: 30 });
    expect(next.text).toBe('duration task');
    expect(next.done).toBe(false);
    expect(next.secondsAccumulated).toBe(1000);
  });

  it('does not mutate original state', () => {
    const s = makeTaskState({ durationMin: 20 });
    taskSetDuration(s, { durationMin: 30 });
    expect(s.durationMin).toBe(20);
  });
});
