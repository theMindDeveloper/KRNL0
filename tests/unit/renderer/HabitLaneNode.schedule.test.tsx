// @vitest-environment jsdom
/** The lane's today tick follows the habit's schedule, like the Habit window. */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { HabitLaneNode } from '../../../src/renderer/components/nodes/HabitLaneNode';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import type { Board } from '../../../src/shared/types';

afterEach(() => { cleanup(); vi.useRealTimers(); });

function seed(log: string[]) {
  useBoardStore.getState().setBoard({
    version: 1, savedAt: '', viewport: { x: 0, y: 0, zoom: 1 }, edges: [],
    nodes: [{
      id: 'mother-habit', kind: 'habit', isMother: true, position: { x: 0, y: 0 }, config: {},
      state: { habits: [{ id: 'h1', name: 'gym', color: 'acid', log, createdAt: '2026-11-01T00:00:00.000Z', schedule: { kind: 'weekdays' } }] },
    }],
  } as unknown as Board);
}

const lane = { id: 'lane-1', kind: 'habit.lane', isMother: false, position: { x: 0, y: 0 }, state: { habitId: 'h1' }, config: { days: 28 } };

describe('HabitLaneNode today tick', () => {
  it('is disabled on a day the habit is not scheduled (Saturday for a weekdays habit)', () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 7, 10, 0).getTime(), toFake: ['Date'] }); // Sat 7 Nov 2026
    seed([]);
    render(<HabitLaneNode node={lane as never} selected={false} onCommand={() => {}} onSelect={() => {}} />);
    expect((screen.getByRole('button', { name: /gym today/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('is enabled on a scheduled day', () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 9, 10, 0).getTime(), toFake: ['Date'] }); // Mon 9 Nov 2026
    seed([]);
    render(<HabitLaneNode node={lane as never} selected={false} onCommand={() => {}} onSelect={() => {}} />);
    expect((screen.getByRole('button', { name: /gym today/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});
