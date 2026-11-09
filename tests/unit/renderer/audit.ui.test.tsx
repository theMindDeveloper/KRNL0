// @vitest-environment jsdom
/**
 * Audit 2026-11-09, group C — pop-ups, keys and Easy mode.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';
import { WhenPopover } from '../../../src/renderer/components/ui/WhenPopover';
import { isModalOpen } from '../../../src/renderer/utils/keyboardTargets';
import { toursIn } from '../../../src/renderer/components/Tour/tours';
import { Z } from '../../../src/renderer/components/ui/layers';

afterEach(() => { cleanup(); document.body.innerHTML = ''; });

const esc = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

describe('Escape with a picker list open', () => {
  it('closes only the list; the plan card (and what was typed) stays', () => {
    const onClose = vi.fn();
    render(React.createElement(WhenPopover, {
      x: 10, y: 10, today: '2026-11-09',
      value: { day: '2026-11-12', time: null, lengthMin: null, deadline: null, remindMin: null },
      onApply: vi.fn(), onClose,
    }));
    const list = document.createElement('div');
    list.className = 'krnl-popover';
    document.body.appendChild(list);
    esc();
    expect(onClose).not.toHaveBeenCalled();
    list.remove();
    esc();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('canvas shortcuts stand down under an open card', () => {
  it('a plan card or a picker list owns the keys (no Ctrl+Z / Delete behind it)', () => {
    expect(isModalOpen()).toBe(false);
    const card = document.createElement('div');
    card.setAttribute('data-owns-keys', 'true');
    document.body.appendChild(card);
    expect(isModalOpen()).toBe(true);
    card.remove();
    const list = document.createElement('div');
    list.className = 'krnl-popover';
    document.body.appendChild(list);
    expect(isModalOpen()).toBe(true);
  });
});

describe('layers', () => {
  it('the tour card is above the cards\' click-catchers and below the cards', () => {
    expect(Z.tour).toBeGreaterThan(Z.popoverBackdrop);
    expect(Z.tour).toBeLessThan(Z.popover);
  });
});

describe('Easy tour list', () => {
  it('names nothing Easy hides', () => {
    for (const t of toursIn('easy')) expect(t.summary, t.id).not.toMatch(/reminder|deadline|time per task|planned vs/i);
  });
});
