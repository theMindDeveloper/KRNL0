// @vitest-environment jsdom
/**
 * ContextMenu component tests
 * Source: src/renderer/components/ContextMenu/index.tsx
 *
 * Tests:
 *  - Portal mount (renders into document.body)
 *  - ESC dismisses
 *  - Click-outside dismisses
 *  - danger:true items get rust color
 *  - disabled items are disabled
 *  - items fire onSelect then onDismiss when clicked
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';

afterEach(() => cleanup());

import { ContextMenu } from '../../../src/renderer/components/ContextMenu';
import type { ContextMenuItem } from '../../../src/renderer/components/ContextMenu';

function renderMenu(
  items: ContextMenuItem[],
  onDismiss: () => void = vi.fn(),
) {
  render(
    React.createElement(ContextMenu, { x: 100, y: 200, items, onDismiss }),
  );
}

describe('ContextMenu', () => {
  it('portal — renders into document.body (not the React root)', () => {
    const onDismiss = vi.fn();
    renderMenu([{ label: 'Action', onSelect: vi.fn() }], onDismiss);
    const menuBtn = document.body.querySelector('button');
    expect(menuBtn).not.toBeNull();
    expect(menuBtn!.textContent).toBe('Action');
  });

  it('positioned — uses fixed position at given x,y', () => {
    renderMenu([{ label: 'A', onSelect: vi.fn() }]);
    const menu = document.body.querySelector('div[style]') as HTMLElement;
    expect(menu.style.position).toBe('fixed');
    expect(menu.style.left).toBe('100px');
    expect(menu.style.top).toBe('200px');
  });

  it('ESC key — calls onDismiss', () => {
    const onDismiss = vi.fn();
    renderMenu([{ label: 'A', onSelect: vi.fn() }], onDismiss);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('click-outside — calls onDismiss when clicking outside the menu', () => {
    const onDismiss = vi.fn();
    renderMenu([{ label: 'A', onSelect: vi.fn() }], onDismiss);
    // Fire mousedown on document.body (outside the menu div)
    fireEvent.mouseDown(document.body);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('click-inside — does NOT call onDismiss when clicking a menu button', () => {
    const onDismiss = vi.fn();
    renderMenu([{ label: 'Inside', onSelect: vi.fn() }], onDismiss);
    const btn = document.body.querySelector('button') as HTMLElement;
    // mousedown on the button itself — should be inside the menu div
    fireEvent.mouseDown(btn);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('item click — calls onSelect then onDismiss', () => {
    const onSelect = vi.fn();
    const onDismiss = vi.fn();
    renderMenu([{ label: 'Do it', onSelect }], onDismiss);
    const btn = document.body.querySelector('button') as HTMLElement;
    fireEvent.click(btn);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('danger: true — applies rust color to the item button', () => {
    renderMenu([{ label: 'Delete', onSelect: vi.fn(), danger: true }]);
    const btn = document.body.querySelector('button') as HTMLElement;
    expect(btn.style.color).toBe('var(--rust)');
  });

  it('danger: false — does NOT apply rust color', () => {
    renderMenu([{ label: 'Safe', onSelect: vi.fn(), danger: false }]);
    const btn = document.body.querySelector('button') as HTMLElement;
    expect(btn.style.color).not.toBe('var(--rust)');
  });

  it('disabled: true — button is disabled and onSelect is not called on click', () => {
    const onSelect = vi.fn();
    renderMenu([{ label: 'Disabled', onSelect, disabled: true }]);
    const btn = document.body.querySelector('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('disabled: true — applies muted ink-4 color', () => {
    renderMenu([{ label: 'Disabled', onSelect: vi.fn(), disabled: true }]);
    const btn = document.body.querySelector('button') as HTMLElement;
    expect(btn.style.color).toBe('var(--ink-4)');
  });

  it('renders multiple items', () => {
    const items: ContextMenuItem[] = [
      { label: 'One', onSelect: vi.fn() },
      { label: 'Two', onSelect: vi.fn() },
      { label: 'Three', onSelect: vi.fn() },
    ];
    renderMenu(items);
    const btns = document.body.querySelectorAll('button');
    expect(btns.length).toBe(3);
    const labels = Array.from(btns).map((b) => b.textContent);
    expect(labels).toContain('One');
    expect(labels).toContain('Two');
    expect(labels).toContain('Three');
  });
});
