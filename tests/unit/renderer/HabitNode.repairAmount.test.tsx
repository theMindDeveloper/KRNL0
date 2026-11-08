// @vitest-environment jsdom
/** "Did it yesterday? Yes" on an amount habit fills the day — not one more glass. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { HabitNode } from '../../../src/renderer/components/nodes/HabitNode';
import type { Node } from '../../../src/shared/types/node';
import type { HabitState, HabitConfig } from '../../../src/renderer/components/nodes/HabitNode/types';

afterEach(cleanup);

const ymd = (k: number) => { const d = new Date(); d.setDate(d.getDate() - k); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

describe('repair on an amount habit', () => {
  it('Yes sets yesterday to the full amount', () => {
    const habit = { id: 'w', name: 'Water', createdAt: new Date(Date.now() - 20 * 864e5).toISOString(), log: [ymd(2)], archived: false, color: 'cyan', amount: { target: 8, unit: 'glasses' } };
    const node = { id: 'mother-habit', kind: 'habit', isMother: true, position: { x: 0, y: 0 }, state: { habits: [habit] }, config: {} } as unknown as Node<HabitState, HabitConfig>;
    const onCommand = vi.fn();
    render(<HabitNode node={node} selected={false} onCommand={onCommand} onSelect={() => undefined} />);
    fireEvent.click(screen.getByTestId('habit-repair-yes-w'));
    expect(onCommand).toHaveBeenCalledWith('habit.setCount', { id: 'w', date: ymd(1), count: 8 });
    expect(onCommand).not.toHaveBeenCalledWith('habit.toggleDay', expect.anything());
  });
});
