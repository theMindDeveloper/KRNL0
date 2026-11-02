// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import React from 'react';
import { CanvasSwitcher } from '../../../src/renderer/components/TopBar/CanvasSwitcher';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import type { Board } from '../../../src/shared/types';

beforeEach(() => {
  useBoardStore.getState().setBoard({
    version: 1, savedAt: '', viewport: { x: 0, y: 0, zoom: 1 }, nodes: [], edges: [],
    canvases: [{ id: 'canvas-main', name: 'Main' }, { id: 'canvas-b', name: 'Ideas' }],
    activeCanvasId: 'canvas-main',
  } as unknown as Board);
});
afterEach(() => cleanup());

describe('CanvasSwitcher', () => {
  it('double-clicking a row opens the inline rename', () => {
    render(<CanvasSwitcher />);
    fireEvent.click(screen.getByTestId('topbar-canvas-switcher'));
    const row = screen.getByTestId('canvas-row-canvas-b');
    fireEvent.click(row);
    fireEvent.doubleClick(row);
    expect(screen.getByLabelText('Canvas name')).toBeTruthy();
  });

  it('Escape in the rename field cancels the rename and keeps the list open', () => {
    render(<CanvasSwitcher />);
    fireEvent.click(screen.getByTestId('topbar-canvas-switcher'));
    fireEvent.click(screen.getAllByLabelText(/^Rename /)[0]!);
    fireEvent.keyDown(screen.getByLabelText('Canvas name'), { key: 'Escape' });
    expect(screen.queryByLabelText('Canvas name')).toBeNull();
    expect(screen.getByTestId('canvas-switcher-list')).toBeTruthy();
  });

  it('a single click switches and then closes the list', () => {
    vi.useFakeTimers();
    try {
      render(<CanvasSwitcher />);
      fireEvent.click(screen.getByTestId('topbar-canvas-switcher'));
      fireEvent.click(screen.getByTestId('canvas-row-canvas-b'));
      expect(useBoardStore.getState().board!.activeCanvasId).toBe('canvas-b');
      act(() => { vi.advanceTimersByTime(300); });
      expect(screen.queryByTestId('canvas-switcher-list')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
