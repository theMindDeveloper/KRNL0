// @vitest-environment jsdom
/** Pop-ups close on a click elsewhere, but not on a picker they opened (owner, 2026-11-09). */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDismissOutside } from '../../../src/renderer/components/ui/useDismissOutside';

const el = (cls?: string) => {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  const b = document.createElement('button');
  d.appendChild(b);
  document.body.appendChild(d);
  return b;
};
const down = (t: Element) => t.dispatchEvent(new Event('pointerdown', { bubbles: true }));

afterEach(() => { document.body.innerHTML = ''; });

describe('useDismissOutside', () => {
  it('a click on a time picker opened from the card (portaled to <body>) keeps the card open', () => {
    const onDismiss = vi.fn();
    renderHook(() => useDismissOutside(true, ['[data-testid="when-popover"]'], onDismiss));
    down(el('krnl-popover nodrag nowheel'));
    expect(onDismiss).not.toHaveBeenCalled();
  });
  it('a click anywhere else still closes it', () => {
    const onDismiss = vi.fn();
    renderHook(() => useDismissOutside(true, ['[data-testid="when-popover"]'], onDismiss));
    down(el());
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
