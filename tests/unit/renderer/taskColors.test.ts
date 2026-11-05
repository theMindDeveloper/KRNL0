/** #207 — every current task has its own colour; archived ones free theirs. */
import { describe, it, expect } from 'vitest';
import { assignTaskColors, TASK_COLOR_COUNT } from '../../../src/renderer/utils/taskColor';
import { activeTasksForColor } from '../../../src/renderer/store/taskColors';
import type { Board } from '../../../src/shared/types';

const tasks = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `task-${i}-${'x'.repeat(i % 3)}`, createdAt: `2026-11-0${1 + (i % 5)}T0${i % 10}:00:00Z` }));

describe('assignTaskColors', () => {
  it('gives up to 18 tasks 18 different colours', () => {
    const m = assignTaskColors(tasks(TASK_COLOR_COUNT));
    expect(new Set(m.values()).size).toBe(TASK_COLOR_COUNT);
  });
  it('earlier tasks keep their colour when a new task is added', () => {
    const before = assignTaskColors(tasks(5));
    const after = assignTaskColors([...tasks(5), { id: 'new-task', createdAt: '2026-12-01T00:00:00Z' }]);
    for (const [id, slot] of before) expect(after.get(id)).toBe(slot);
    expect(new Set(after.values()).size).toBe(6);
  });
});

describe('activeTasksForColor', () => {
  it('leaves archived tasks out (their colour is free again)', () => {
    const board = { nodes: [
      { id: 'a', kind: 'todo.task', state: { createdAt: '2026-11-01' } },
      { id: 'b', kind: 'todo.task', state: { createdAt: '2026-11-02' } },
      { id: 'todo', kind: 'todo', state: { items: [{ taskNodeId: 'b', archivedAt: '2026-11-03' }] } },
    ] } as unknown as Board;
    expect(activeTasksForColor(board).map((t) => t.id)).toEqual(['a']);
  });
});
