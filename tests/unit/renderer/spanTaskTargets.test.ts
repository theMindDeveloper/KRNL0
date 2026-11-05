// #204 — tagged recorded time must never look untagged: the task list a span
// can count toward keeps finished tasks, and a span names its task (falling
// back to its own label when the task node is gone).

import { describe, it, expect } from 'vitest';
import {
  decodeTargets,
  encodeTargets,
  spanTaskName,
  spanTaskTargets,
  startOfLocalDayMs,
} from '../../../src/renderer/components/nodes/PomoNode/taskTargets';
import { segmentMenuItems } from '../../../src/renderer/components/ContextMenu/scheduleMenus';

function task(id: string, text: string, extra: Record<string, unknown> = {}) {
  return { id, kind: 'todo.task', state: { text, done: false, parentTaskId: null, ...extra } };
}

const nodes = [
  task('t-done-old', 'old', { done: true, completedAt: '2026-11-01T10:00:00' }),
  task('t-open', 'open one'),
  task('t-done-new', 'build cluster', { done: true, completedAt: '2026-11-05T16:27:00' }),
  task('t-sub', 'subtask', { parentTaskId: 't-open' }),
  { id: 'pomo', kind: 'pomo', state: {} },
];

describe('spanTaskTargets', () => {
  it('lists open root tasks first, then done tasks newest first', () => {
    expect(spanTaskTargets(nodes).map((t) => t.id)).toEqual(['t-open', 't-done-new', 't-done-old']);
  });

  it('doneSinceMs keeps only tasks finished since then (the Pomo\'s "Done today")', () => {
    const since = startOfLocalDayMs(Date.parse('2026-11-05T12:00:00'));
    const t = spanTaskTargets(nodes, { doneSinceMs: since });
    expect(t).toEqual([
      { id: 't-open', text: 'open one', done: false },
      { id: 't-done-new', text: 'build cluster', done: true },
    ]);
  });

  it('round-trips through the shallow-selector encoding', () => {
    const t = spanTaskTargets(nodes);
    expect(decodeTargets(encodeTargets(t))).toEqual(t);
  });
});

describe('spanTaskName', () => {
  it('names the live task, else the span label when the node is gone, else null', () => {
    expect(spanTaskName(nodes, { taskId: 't-done-new', label: 'stale' })).toBe('build cluster');
    expect(spanTaskName(nodes, { taskId: 'deleted', label: 'build cluster' })).toBe('build cluster');
    expect(spanTaskName(nodes, { taskId: null, label: 'emails' })).toBeNull();
  });
});

describe('segmentMenuItems — "Tagged: X" (#204)', () => {
  const seg = { id: 's', kind: 'work' as const, taskId: 't-done-new', startMs: 0, endMs: 60_000, live: false };

  it('shows which task a tagged span counts toward', () => {
    const labels = segmentMenuItems({ ...seg, taskName: 'build cluster' }, { targets: [] }).map((i) => i.label);
    expect(labels).toContain('Tagged: build cluster');
    expect(labels).toContain('Untag');
  });

  it('omits the line for an untagged span and in Easy mode', () => {
    const untagged = segmentMenuItems({ ...seg, taskId: null, taskName: null }, { targets: [] }).map((i) => i.label);
    expect(untagged.some((l) => l.startsWith('Tagged:'))).toBe(false);
    const easy = segmentMenuItems({ ...seg, taskName: 'build cluster' }, { targets: [], easy: true }).map((i) => i.label);
    expect(easy.some((l) => l.startsWith('Tagged:'))).toBe(false);
  });
});
