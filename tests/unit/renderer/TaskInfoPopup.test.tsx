// @vitest-environment jsdom
/** Left-click task info popup (Clock arcs/rows, Calendar month chips). */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TaskInfoPopup } from '../../../src/renderer/components/ui/TaskInfoPopup';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import { defaultPomoState } from '../../../src/renderer/components/nodes/PomoNode/types';
import type { Board } from '../../../src/shared/types';

const board = {
  version: 1, schemaVersion: 2, viewport: { x: 0, y: 0, zoom: 1 }, edges: [], completions: [],
  nodes: [
    { id: 'todo', kind: 'todo', isMother: true, position: { x: 0, y: 0 }, config: {},
      state: { items: [{ id: 'i1', text: 'Fix bug', done: false, createdAt: '2026-11-02T08:00:00Z', completedAt: null, taskNodeId: 't1', tag: 'code', tagSource: 'user' }] } },
    { id: 't1', kind: 'todo.task', isMother: false, position: { x: 0, y: 0 }, config: {},
      state: { text: 'Fix bug', done: false, parentTodoId: 'todo', parentTaskId: null, todoItemId: 'i1', plannedMin: 90, durationMin: 25,
        scheduledFor: '2026-11-02T11:00', scheduledDurationMin: 90, createdAt: '2026-11-02T08:00:00Z' } },
    { id: 'pomo', kind: 'pomo', isMother: true, position: { x: 0, y: 0 }, config: {},
      state: { ...defaultPomoState(), history: [
        { id: 's1', startedAt: '2026-11-02T10:20:00Z', endedAt: '2026-11-02T11:10:00Z', durationMin: 50, label: 'Fix bug', completed: false, taskId: 't1', kind: 'work' },
        { id: 's2', startedAt: '2026-11-02T11:10:00Z', endedAt: '2026-11-02T11:55:00Z', durationMin: 45, label: 'Fix bug', completed: false, taskId: 't1', kind: 'break' },
      ] } },
  ],
} as unknown as Board;

describe('TaskInfoPopup', () => {
  beforeEach(() => { useBoardStore.setState({ board }); });
  afterEach(cleanup);

  it('shows the task, its category, plan and tracked work (breaks excluded)', () => {
    render(<TaskInfoPopup taskId="t1" x={10} y={10} onClose={() => {}} />);
    const pop = screen.getByTestId('task-info-popup');
    expect(pop.textContent).toContain('Fix bug');
    expect(pop.textContent).toContain('Code');
    expect(pop.textContent).toContain('plan 1h 30m');
    expect(pop.textContent).toContain('tracked 50m');
  });

  it('renders nothing for a non-task id', () => {
    render(<TaskInfoPopup taskId="pomo" x={0} y={0} onClose={() => {}} />);
    expect(screen.queryByTestId('task-info-popup')).toBeNull();
  });
});
