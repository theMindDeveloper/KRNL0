// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { Switch } from '../../../src/renderer/components/ui/Switch';
import { CloseButton } from '../../../src/renderer/components/ui/CloseButton';
import { TaskInfoPopup } from '../../../src/renderer/components/ui/TaskInfoPopup';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import type { Board } from '../../../src/shared/types';

afterEach(() => cleanup());

describe('Switch', () => {
  it('is a role=switch that reports the next value', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} testId="sw" />);
    const sw = screen.getByTestId('sw');
    expect(sw.getAttribute('role')).toBe('switch');
    expect(sw.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('CloseButton', () => {
  it('has an accessible name and closes', () => {
    const onClick = vi.fn();
    render(<CloseButton onClick={onClick} label="Close settings" />);
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('TaskInfoPopup', () => {
  it('closes on Escape', () => {
    useBoardStore.getState().setBoard({
      version: 1, savedAt: '', viewport: { x: 0, y: 0, zoom: 1 }, edges: [],
      nodes: [{ id: 't1', kind: 'todo.task', isMother: false, position: { x: 0, y: 0 }, config: {},
        state: { text: 'Write', done: false, parentTodoId: 'x', parentTaskId: null, todoItemId: null, plannedMin: 30, durationMin: 30 } }],
    } as unknown as Board);
    const onClose = vi.fn();
    render(<TaskInfoPopup taskId="t1" x={10} y={10} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
