import { describe, it, expect } from 'vitest';
import { stampCompletedAt } from '../../../shared/dispatch/task';
import type { TaskState } from '../../components/nodes/TaskNode/types';

const ctx = {
  uuid: () => 'uuid',
  now: () => '2026-05-16T12:00:00.000Z',
};

const base: TaskState = {
  text: 't',
  done: false,
  durationMin: 25,
  eta: '~25 min',
  sequenceNumber: 1,
  layer: 0,
  createdAt: '2026-05-10T00:00:00.000Z',
  parentTodoId: 'todo',
  parentTaskId: null,
  todoItemId: null,
  pomoSessionsCompleted: 0,
  plannedMin: 25,
  secondsAccumulated: 0,
  currentSessionElapsedSec: 0,
  kind: 'focus',
};

describe('stampCompletedAt', () => {
  it('stamps on false → true', () => {
    const next = stampCompletedAt(base, { ...base, done: true }, ctx);
    expect(next.completedAt).toBe('2026-05-16T12:00:00.000Z');
  });

  it('clears on true → false', () => {
    const prev: TaskState = { ...base, done: true, completedAt: '2026-05-10T09:00:00.000Z' };
    const next = stampCompletedAt(prev, { ...prev, done: false }, ctx);
    expect(next.completedAt).toBeUndefined();
  });

  it('preserves field on done=true → done=true (no toggle)', () => {
    const prev: TaskState = { ...base, done: true, completedAt: '2026-05-10T09:00:00.000Z' };
    const next = stampCompletedAt(prev, { ...prev, text: 'edited' }, ctx);
    expect(next.completedAt).toBe('2026-05-10T09:00:00.000Z');
  });
});
