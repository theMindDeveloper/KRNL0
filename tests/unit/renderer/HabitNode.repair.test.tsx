// @vitest-environment jsdom
/**
 * "Did it yesterday?" (engagement.md F17): saying no hides that day's prompt,
 * not every later one — with KRNL0 left open overnight, the next missed day
 * still asks.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import React from 'react';
import { HabitNode } from '../../../src/renderer/components/nodes/HabitNode';
import type { Node } from '../../../src/shared/types/node';
import type { HabitState, HabitConfig } from '../../../src/renderer/components/nodes/HabitNode/types';

const nodeWith = (log: string[]) => ({
  id: 'mother-habit', kind: 'habit', isMother: true, position: { x: 0, y: 0 }, config: {},
  state: { habits: [{ id: 'h-run', name: 'Run', color: 'acid', log, createdAt: '2026-10-01T00:00:00.000Z', archived: false }] },
}) as unknown as Node<HabitState, HabitConfig>;

beforeEach(() => {
  try { localStorage.clear(); } catch { /* none */ }
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(new Date(2026, 10, 7, 10, 0));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('habit repair prompt', () => {
  it('"no" hides that day only; the next missed day asks again, even without a restart', () => {
    const { rerender } = render(<HabitNode node={nodeWith(['2026-11-05'])} selected={false} onCommand={() => {}} onSelect={() => {}} />);
    expect(screen.getByTestId('habit-repair-h-run').textContent).toContain('yesterday');
    fireEvent.click(screen.getByTestId('habit-repair-no-h-run'));
    expect(screen.queryByTestId('habit-repair-h-run')).toBeNull();

    // Later that day the 6th gets ticked from the grid; the 7th is then missed.
    rerender(<HabitNode node={nodeWith(['2026-11-05', '2026-11-06'])} selected={false} onCommand={() => {}} onSelect={() => {}} />);
    // Midnight passes with the window open.
    act(() => { vi.setSystemTime(new Date(2026, 10, 8, 0, 0, 5)); vi.advanceTimersByTime(15 * 3_600_000); });
    rerender(<HabitNode node={nodeWith(['2026-11-05', '2026-11-06'])} selected={false} onCommand={() => {}} onSelect={() => {}} />);
    expect(screen.getByTestId('habit-repair-h-run').textContent).toContain('yesterday');
  });
});
