// @vitest-environment jsdom
/**
 * A lane whose habit was deleted removes itself — once. Before, it wrote a new
 * board on every render; the canvas keeps the lane mounted a moment after the
 * removal, so each write re-rendered it into the next write: "Maximum update
 * depth exceeded" and the whole app on the render-error screen whenever a
 * habit with a lane (or every habit) was deleted.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import React from 'react';
import { HabitLaneNode } from '../../../src/renderer/components/nodes/HabitLaneNode';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import type { Board } from '../../../src/shared/types';

vi.mock('../../../src/renderer/store/eventLog', async (orig) => ({
  ...(await orig<typeof import('../../../src/renderer/store/eventLog')>()),
  saveBoard: vi.fn(async () => undefined),
}));

afterEach(() => { cleanup(); useBoardStore.setState({ board: null }); });

const lane = { id: 'lane-1', kind: 'habit.lane', isMother: false, position: { x: 0, y: 0 }, state: { habitId: 'gone' }, config: { days: 28 } };

describe('HabitLaneNode with its habit deleted', () => {
  it('removes itself from the board exactly once, even while it stays mounted', () => {
    useBoardStore.getState().setBoard({
      version: 1, savedAt: '', viewport: { x: 0, y: 0, zoom: 1 }, edges: [],
      nodes: [
        { id: 'mother-habit', kind: 'habit', isMother: true, position: { x: 0, y: 0 }, config: {}, state: { habits: [] } },
        lane,
      ],
    } as unknown as Board);
    let writes = 0;
    const unsub = useBoardStore.subscribe(() => { writes++; });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const props = { node: lane as never, selected: false, onCommand: () => {}, onSelect: () => {} };
    const { rerender, container } = render(<HabitLaneNode {...props} />);
    // The canvas keeps the old node mounted and re-renders it a few times.
    for (let i = 0; i < 5; i++) act(() => { rerender(<HabitLaneNode {...props} />); });
    unsub();
    expect(useBoardStore.getState().board!.nodes.some((n) => n.id === 'lane-1')).toBe(false);
    expect(writes).toBe(1);
    expect(errors.mock.calls.some((c) => String(c[0]).includes('Maximum update depth'))).toBe(false);
    expect(container.textContent).toBe('');
    errors.mockRestore();
  });
});
