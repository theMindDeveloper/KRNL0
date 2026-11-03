// @vitest-environment jsdom
/** The habit add field: Escape abandons, a half-set repeat is never dropped silently. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { HabitNode } from '../../../src/renderer/components/nodes/HabitNode';
import { defaultHabitState } from '../../../src/renderer/components/nodes/HabitNode/types';
import type { Node } from '../../../src/shared/types/node';
import type { HabitState, HabitConfig } from '../../../src/renderer/components/nodes/HabitNode/types';

afterEach(cleanup);

const node = { id: 'mother-habit', kind: 'habit', isMother: true, position: { x: 0, y: 0 }, state: defaultHabitState(), config: {} } as unknown as Node<HabitState, HabitConfig>;

function setup() {
  const onCommand = vi.fn();
  render(<HabitNode node={node} selected={false} onCommand={onCommand} onSelect={() => undefined} />);
  const input = screen.getByPlaceholderText('+ add habit or recurring event') as HTMLInputElement;
  return { onCommand, input };
}

describe('habit add field', () => {
  it('Escape clears what was typed', () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: 'gym' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('');
  });

  it('a weekly repeat with no days blocks Enter and says why', () => {
    const { input, onCommand } = setup();
    fireEvent.change(input, { target: { value: 'gym' } });
    fireEvent.click(screen.getByTestId('habit-add-repeat'));
    for (let d = 1; d <= 7; d++) fireEvent.click(screen.getByTestId(`habit-add-day-${d}`));
    // Done is disabled for an invalid repeat; the backdrop still closes the popover.
    fireEvent.click(screen.getByTestId('habit-add-repeat-pop').previousElementSibling as Element);
    expect(screen.queryByTestId('habit-add-repeat-pop')).toBeNull();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommand).not.toHaveBeenCalledWith('habit.add', expect.anything());
    expect(screen.getByTestId('habit-add-repeat-invalid')).toBeTruthy();
  });
});
