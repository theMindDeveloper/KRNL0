// @vitest-environment jsdom
/** Window swap by drag — the drop target lights up with "Swap here" and every mark clears. */
import { describe, it, expect, afterEach, vi } from 'vitest';
import type React from 'react';
import { markDropTarget, leaveDropTarget, endMotherDrag, beginHold } from '../../../src/renderer/components/nodes/MotherFrame/motherDrag';
import { useBoardStore } from '../../../src/renderer/store/boardStore';

vi.mock('../../../src/renderer/store/eventLog', async (orig) => ({
  ...(await orig<typeof import('../../../src/renderer/store/eventLog')>()),
  saveBoard: vi.fn(async () => undefined),
}));

const press = (x: number, y: number): React.PointerEvent =>
  ({ button: 0, clientX: x, clientY: y, preventDefault: () => {}, stopPropagation: () => {} }) as unknown as React.PointerEvent;
const move = (x: number, y: number): void => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y })); };
const up = (): void => { window.dispatchEvent(new MouseEvent('pointerup')); };

describe('holding a window to swap it', () => {
  afterEach(() => { endMotherDrag(); document.body.innerHTML = ''; vi.restoreAllMocks(); });

  it('a plain click does not pick the window up', () => {
    const a = frameEl('mother-pomo');
    beginHold(press(10, 10), 'mother-pomo');
    move(11, 11); // under the pick-up distance
    up();
    expect(document.querySelector('.krnl-swap-ghost')).toBeNull();
    expect(a.dataset.motherDragging).toBeUndefined();
  });

  it('press and move picks it up; dropping on another window swaps them', () => {
    const swap = vi.fn();
    useBoardStore.setState({ swapMotherSlots: swap, board: null });
    const a = frameEl('mother-pomo');
    const b = frameEl('mother-todo');
    const target = b.firstElementChild as HTMLElement;
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target });
    beginHold(press(10, 10), 'mother-pomo');
    move(40, 30);
    expect(document.querySelector('.krnl-swap-ghost')).not.toBeNull(); // you are holding it
    expect(a.dataset.motherDragging).toBe('true'); // its slot is an empty outline
    expect(b.dataset.dropTarget).toBe('true'); // "Swap here"
    up();
    expect(swap).toHaveBeenCalledWith('mother-pomo', 'mother-todo');
    expect(a.dataset.motherDragging).toBeUndefined();
    expect(b.dataset.dropTarget).toBeUndefined();
  });
});

function frameEl(id: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'mother-frame';
  el.setAttribute('data-tour', id);
  el.appendChild(document.createElement('span'));
  document.body.appendChild(el);
  return el;
}

const frame = (id: string): HTMLElement => {
  const el = document.createElement('div');
  el.className = 'mother-frame';
  el.setAttribute('data-tour', id);
  el.appendChild(document.createElement('span'));
  document.body.appendChild(el);
  return el;
};

describe('window drag marks', () => {
  afterEach(() => { endMotherDrag(); document.body.innerHTML = ''; });

  it('the window under the pointer shows "Swap here"; moving to another moves the mark', () => {
    const a = frame('mother-pomo');
    const b = frame('mother-todo');
    markDropTarget(a);
    expect(a.dataset.dropTarget).toBe('true');
    expect(a.querySelector('.krnl-swap-label')?.textContent).toBe('Swap here');
    markDropTarget(b);
    expect(a.dataset.dropTarget).toBeUndefined();
    expect(a.querySelector('.krnl-swap-label')).toBeNull();
    expect(b.querySelectorAll('.krnl-swap-label')).toHaveLength(1);
  });

  it('moving onto a child keeps the mark; leaving the window clears it', () => {
    const a = frame('mother-pomo');
    markDropTarget(a);
    leaveDropTarget(a, a.firstElementChild);
    expect(a.dataset.dropTarget).toBe('true');
    leaveDropTarget(a, document.body);
    expect(a.dataset.dropTarget).toBeUndefined();
  });

  it('the picked-up window is never its own target, and ending the drag clears everything', () => {
    const a = frame('mother-pomo');
    const b = frame('mother-todo');
    a.dataset.motherDragging = 'true';
    markDropTarget(a);
    expect(a.dataset.dropTarget).toBeUndefined();
    markDropTarget(b);
    endMotherDrag();
    expect(a.dataset.motherDragging).toBeUndefined();
    expect(b.dataset.dropTarget).toBeUndefined();
    expect(document.querySelector('.krnl-swap-label')).toBeNull();
  });
});
