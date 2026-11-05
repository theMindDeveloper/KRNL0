// @vitest-environment jsdom
/** Window swap by drag — the drop target lights up with "Swap here" and every mark clears. */
import { describe, it, expect, afterEach } from 'vitest';
import { markDropTarget, leaveDropTarget, endMotherDrag } from '../../../src/renderer/components/nodes/MotherFrame/motherDrag';

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
