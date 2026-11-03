// @vitest-environment jsdom
/**
 * Unschedule / Show on calendar for chain successors: a successor stores no
 * time of its own, so its actions resolve through the chain's anchor.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import { scheduleAnchorOf, placementOf, unscheduleTask } from '../../../src/renderer/store/scheduleActions';
import { taskMenuItems } from '../../../src/renderer/components/ContextMenu/scheduleMenus';
import type { Board } from '../../../src/shared/types';
import type { Node } from '../../../src/shared/types/node';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';

const TODO = 'todo-u';
function task(id: string, extra: Partial<TaskState> = {}): Node {
  const state: TaskState = {
    text: id, done: false, durationMin: 30, eta: '~30 min', sequenceNumber: 1, layer: 0,
    createdAt: '2026-11-01T00:00:00.000Z', parentTodoId: TODO, parentTaskId: null, todoItemId: null,
    pomoSessionsCompleted: 0, plannedMin: 30, secondsAccumulated: 0, currentSessionElapsedSec: 0,
    kind: 'event', ...extra,
  };
  return { id, kind: 'todo.task', position: { x: 0, y: 0 }, isMother: false, state, config: {} };
}

beforeEach(() => {
  (window as unknown as { krnl: unknown }).krnl = { boardSave: vi.fn(async () => undefined) };
  useBoardStore.getState().setBoard({
    version: 1, schemaVersion: 2, savedAt: '', viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      { id: TODO, kind: 'todo', position: { x: 0, y: 0 }, isMother: true, state: { items: [] }, config: {} },
      task('a', { scheduledFor: '2026-11-03T09:00' }),
      task('b'),
    ],
    edges: [{ id: 'e1', from: { nodeId: 'a', event: 'task.next' }, to: { nodeId: 'b', command: 'task.activate' }, enabled: true }],
  } as unknown as Board);
});

describe('chain successor schedule actions', () => {
  it('resolves the anchor and the real placement', () => {
    expect(scheduleAnchorOf('a')).toBe('a');
    expect(scheduleAnchorOf('b')).toBe('a');
    expect(placementOf('b')?.startISO).toBe('2026-11-03T09:30');
  });

  it('labels the menu action and takes the whole chain off the calendar', async () => {
    const items = taskMenuItems({ id: 'b', text: 'b', done: false });
    expect(items.some((i) => i.label === 'Unschedule chain')).toBe(true);
    await unscheduleTask('b');
    const a = useBoardStore.getState().board!.nodes.find((n) => n.id === 'a')!;
    expect((a.state as TaskState).scheduledFor ?? null).toBeNull();
    expect(placementOf('b')).toBeNull();
  });
});
