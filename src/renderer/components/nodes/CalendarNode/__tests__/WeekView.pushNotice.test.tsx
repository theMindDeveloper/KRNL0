// @vitest-environment jsdom
/**
 * #168/#172 — dropping a chained task before its predecessor ends places it
 * after the predecessor; the calendar must say so instead of silently moving it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { WeekView } from '../WeekView';
import { useBoardStore } from '../../../../store/boardStore';
import type { Board } from '../../../../../shared/types';
import type { TaskState } from '../../TaskNode/types';

afterEach(() => {
  cleanup();
  useBoardStore.setState({ board: null });
});

function task(id: string, extra: Partial<TaskState> = {}): Board['nodes'][number] {
  const state: TaskState = {
    text: `Task ${id}`, done: false, durationMin: 60, eta: '~60 min', sequenceNumber: 1, layer: 0,
    createdAt: '2026-05-01T00:00:00.000Z', parentTodoId: 'todo', parentTaskId: null, todoItemId: null,
    pomoSessionsCompleted: 0, plannedMin: 60, secondsAccumulated: 0, currentSessionElapsedSec: 0,
    kind: 'event', ...extra,
  };
  return { id, kind: 'todo.task', position: { x: 0, y: 0 }, isMother: false, state, config: {} };
}

describe('WeekView — push notice', () => {
  it('shows where a chained task actually landed when the drop was too early', () => {
    useBoardStore.setState({
      board: {
        version: 1, schemaVersion: 2, savedAt: '', viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [task('a', { scheduledFor: '2026-05-12T09:00', scheduledDurationMin: 60 }), task('b')],
        edges: [{ id: 'e', from: { nodeId: 'a', event: 'task.next' }, to: { nodeId: 'b', command: 'task.activate' }, enabled: true }],
      } as Board,
    });
    // Apply the schedule to the store like the real dispatcher does.
    const onCommand = (cmd: string, args: Record<string, unknown>) => {
      if (cmd !== 'calendar.schedule') return;
      const st = useBoardStore.getState();
      const node = st.board!.nodes.find((n) => n.id === args['taskId'])!;
      st.updateNode(node.id, {
        state: { ...(node.state as TaskState), scheduledFor: String(args['scheduledFor']), scheduledDurationMin: Number(args['scheduledDurationMin']) },
      });
    };
    render(
      <WeekView
        state={{ selectedDate: null, anchorDate: '2026-05-11' }}
        config={{ view: 'week', weekStartsOn: 'monday', showHabits: true, showPomoHeatmap: true, hourRange: { start: 6, end: 23 } }}
        onCommand={onCommand}
      />,
    );
    const cell = document.querySelector('[data-testid="week-cell-2026-05-12-9"], [data-testid="week-cell-2026-05-12-09"]');
    expect(cell).toBeTruthy();
    const payload = JSON.stringify({ taskId: 'b', durationMin: 60 });
    fireEvent.drop(cell!, {
      dataTransfer: { getData: (t: string) => (t === 'application/krnl-task' ? payload : ''), types: ['application/krnl-task'] },
    });
    const notice = document.querySelector('[data-testid="calendar-push-notice"]');
    expect(notice?.textContent).toContain('10:00');
    expect(notice?.textContent).toContain('Task b');
  });
});
