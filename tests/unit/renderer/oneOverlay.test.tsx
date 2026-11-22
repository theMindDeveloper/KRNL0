// @vitest-environment jsdom
/**
 * One overlay at a time (the owner's rule): a right-click menu and an info
 * card never stand on top of each other; opening one closes the other.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import React, { useState } from 'react';
import { claimOverlay } from '../../../src/renderer/components/ui/oneOverlay';
import { ContextMenu } from '../../../src/renderer/components/ContextMenu';
import { TaskInfoPopup } from '../../../src/renderer/components/ui/TaskInfoPopup';
import { useBoardStore } from '../../../src/renderer/store/boardStore';

afterEach(() => { cleanup(); useBoardStore.setState({ board: null }); });

describe('claimOverlay', () => {
  it('the next one closes the one before; a released one is not closed again', () => {
    const a = vi.fn();
    const b = vi.fn();
    const releaseA = claimOverlay(a);
    const releaseB = claimOverlay(b);
    expect(a).toHaveBeenCalledTimes(1);
    releaseA();
    releaseB();
    claimOverlay(vi.fn())();
    expect(b).not.toHaveBeenCalled();
  });
});

describe('a menu and an info card', () => {
  function Both() {
    const [menu, setMenu] = useState(false);
    const [info, setInfo] = useState(false);
    return (
      <div>
        <button type="button" data-testid="open-menu" onClick={() => setMenu(true)}>menu</button>
        <button type="button" data-testid="open-info" onClick={() => setInfo(true)}>info</button>
        {menu && <ContextMenu x={10} y={10} items={[{ label: 'Rename', onSelect: () => undefined }]} onDismiss={() => setMenu(false)} />}
        {info && <TaskInfoPopup taskId="t-1" x={20} y={20} onClose={() => setInfo(false)} />}
      </div>
    );
  }

  it('opening the info card closes the menu; opening the menu closes the card', () => {
    useBoardStore.setState({ board: { version: 1, schemaVersion: 2, savedAt: '', viewport: { x: 0, y: 0, zoom: 1 }, edges: [], layoutMode: 'canvas', nodes: [
      { id: 't-1', kind: 'todo.task', isMother: false, position: { x: 0, y: 0 }, config: {}, state: { text: 'Write report', done: false, plannedMin: 30 } },
    ] } as never });
    const { getByTestId, queryByTestId } = render(<Both />);
    fireEvent.click(getByTestId('open-menu'));
    expect(queryByTestId('context-menu')).not.toBeNull();
    act(() => { getByTestId('open-info').click(); });
    expect(queryByTestId('task-info-popup')).not.toBeNull();
    expect(queryByTestId('context-menu')).toBeNull();
    act(() => { getByTestId('open-menu').click(); });
    expect(queryByTestId('context-menu')).not.toBeNull();
    expect(queryByTestId('task-info-popup')).toBeNull();
  });

  it('a press that stops its mouse events still closes the menu', () => {
    const onDismiss = vi.fn();
    render(<div><span data-testid="out" /><ContextMenu x={10} y={10} items={[{ label: 'Rename', onSelect: () => undefined }]} onDismiss={onDismiss} /></div>);
    fireEvent.pointerDown(document.querySelector('[data-testid="out"]')!);
    expect(onDismiss).toHaveBeenCalled();
  });
});
