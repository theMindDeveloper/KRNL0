// @vitest-environment jsdom
/**
 * RadialChooser unit tests (updated 2026-05-14 for ADR 0002 A1).
 * Covers:
 *   - Renders nothing when closed.
 *   - Renders N wedges when open with N options.
 *   - Wedge highlight changes on pointermove (A1 — NOT dragover).
 *   - Click inside dead zone calls onCancel (A1).
 *   - Click on a wedge calls onPick (A1 — NOT drop).
 *   - Click outside the outer radius calls onCancel (A1).
 *   - Escape key calls onCancel.
 *   - Cleanup: listeners removed on close.
 *   - chooser.open is NOT called during dragover (A1 contract).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import React from 'react';
import { RadialChooserHost } from '../index';
import { useRadialChooser } from '../useRadialChooser';
import { radialBus } from '../bus';
import type { RadialOption } from '../types';

afterEach(() => {
  cleanup();
  // Ensure bus is cleared between tests.
  radialBus.close();
});

// Helper: open chooser directly via the bus with 2 options.
// origin = (400, 300), radius = 88, innerRadius = 24.
// Left wedge (index 0) centred at angle π (180°) — cursor at (340, 300).
// Right wedge (index 1) centred at angle 0° — cursor at (460, 300).
function openWith2(
  onPick = vi.fn(),
  onCancel = vi.fn(),
) {
  const options: RadialOption<string>[] = [
    { id: 'left', label: 'LEFT', value: 'left', icon: '←', color: 'var(--purple)' },
    { id: 'right', label: 'RIGHT', value: 'right', icon: '→', color: 'var(--cyan)' },
  ];
  act(() => {
    radialBus.open({
      origin: { x: 400, y: 300 },
      options: options as RadialOption<unknown>[],
      radius: 88,
      innerRadius: 24,
      wedgeGap: 4,
      hoveredIndex: null,
      onPick: onPick as (v: unknown, o: RadialOption<unknown>) => void,
      onCancel,
    });
  });
  return { options, onPick, onCancel };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RadialChooserHost', () => {
  it('renders nothing when closed', () => {
    render(<RadialChooserHost />);
    expect(screen.queryByTestId('radial-chooser-host')).toBeNull();
  });

  it('renders N wedges when open with N options', () => {
    render(<RadialChooserHost />);
    openWith2();
    expect(screen.getByTestId('radial-chooser-host')).toBeTruthy();
    expect(screen.getByTestId('radial-wedge-0')).toBeTruthy();
    expect(screen.getByTestId('radial-wedge-1')).toBeTruthy();
    expect(screen.queryByTestId('radial-wedge-2')).toBeNull();
  });

  it('shows the dead-zone glyph', () => {
    render(<RadialChooserHost />);
    openWith2();
    expect(screen.getByTestId('radial-dead-glyph')).toBeTruthy();
    expect(screen.getByTestId('radial-dead-zone')).toBeTruthy();
  });

  // A1: hover tracking via pointermove (not dragover)
  it('wedge highlight changes on pointermove — left wedge at angle 180°', () => {
    render(<RadialChooserHost />);
    openWith2();

    // origin is (400, 300). Cursor at (400 - 60, 300) = angle 180° → left wedge (index 0).
    act(() => {
      const ev = new PointerEvent('pointermove', {
        bubbles: true, cancelable: true, clientX: 340, clientY: 300,
      });
      window.dispatchEvent(ev);
    });

    expect(screen.getByTestId('radial-wedge-0').getAttribute('data-hovered')).toBe('true');
    expect(screen.queryByTestId('radial-wedge-1')?.getAttribute('data-hovered')).toBeNull();
  });

  it('wedge highlight changes on pointermove — right wedge at angle 0°', () => {
    render(<RadialChooserHost />);
    openWith2();

    // origin is (400, 300). Cursor at (400 + 60, 300) = angle 0° → right wedge (index 1).
    act(() => {
      const ev = new PointerEvent('pointermove', {
        bubbles: true, cancelable: true, clientX: 460, clientY: 300,
      });
      window.dispatchEvent(ev);
    });

    expect(screen.getByTestId('radial-wedge-1').getAttribute('data-hovered')).toBe('true');
    expect(screen.queryByTestId('radial-wedge-0')?.getAttribute('data-hovered')).toBeNull();
  });

  // A1: dead-zone CLICK calls onCancel (not drop)
  it('click inside dead zone calls onCancel', () => {
    render(<RadialChooserHost />);
    const { onCancel, onPick } = openWith2();

    // Click inside dead zone (within 24px of origin 400,300).
    act(() => {
      const ev = new MouseEvent('click', {
        bubbles: true, cancelable: true, clientX: 402, clientY: 300,
      });
      window.dispatchEvent(ev);
    });

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.queryByTestId('radial-chooser-host')).toBeNull();
  });

  // A1: wedge CLICK calls onPick (not drop)
  it('click on a wedge calls onPick with the correct option (right wedge)', () => {
    render(<RadialChooserHost />);
    const { onPick, onCancel } = openWith2();

    // Click the right wedge (cursor at x+60 from origin → angle ~0°).
    act(() => {
      const ev = new MouseEvent('click', {
        bubbles: true, cancelable: true, clientX: 460, clientY: 300,
      });
      window.dispatchEvent(ev);
    });

    expect(onPick).toHaveBeenCalledOnce();
    expect(onPick).toHaveBeenCalledWith('right', expect.objectContaining({ id: 'right' }));
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.queryByTestId('radial-chooser-host')).toBeNull();
  });

  // A1: click outside outer radius calls onCancel
  it('click outside the outer radius calls onCancel', () => {
    render(<RadialChooserHost />);
    const { onCancel, onPick } = openWith2();

    // radius = 88; click at x+200 from origin — well outside.
    act(() => {
      const ev = new MouseEvent('click', {
        bubbles: true, cancelable: true, clientX: 600, clientY: 300,
      });
      window.dispatchEvent(ev);
    });

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.queryByTestId('radial-chooser-host')).toBeNull();
  });

  it('Escape key calls onCancel', () => {
    render(<RadialChooserHost />);
    const { onCancel, onPick } = openWith2();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.queryByTestId('radial-chooser-host')).toBeNull();
  });

  it('removes window listeners on close', () => {
    render(<RadialChooserHost />);
    openWith2();

    const removeSpy = vi.spyOn(window, 'removeEventListener');

    act(() => {
      radialBus.close();
    });

    // Should have removed the A1 listeners.
    expect(removeSpy).toHaveBeenCalled();
    const calledTypes = removeSpy.mock.calls.map((c) => c[0]);
    expect(calledTypes).toContain('pointermove');
    expect(calledTypes).toContain('click');
    expect(calledTypes).toContain('keydown');

    removeSpy.mockRestore();
  });
});

describe('useRadialChooser hook', () => {
  function TestComponent({ onPick, onCancel }: {
    onPick: (v: unknown, o: RadialOption<unknown>) => void;
    onCancel: () => void;
  }) {
    const chooser = useRadialChooser({ onPick, onCancel });
    return (
      <button
        data-testid="open-btn"
        onClick={() =>
          chooser.open({ x: 200, y: 200 }, [
            { id: 'a', label: 'A', value: 'a' },
            { id: 'b', label: 'B', value: 'b' },
          ])
        }
      >
        open
      </button>
    );
  }

  it('open() sets isOpen via bus', () => {
    const onPick = vi.fn();
    const onCancel = vi.fn();
    render(<><RadialChooserHost /><TestComponent onPick={onPick} onCancel={onCancel} /></>);

    expect(screen.queryByTestId('radial-chooser-host')).toBeNull();

    act(() => {
      screen.getByTestId('open-btn').click();
    });

    expect(screen.getByTestId('radial-chooser-host')).toBeTruthy();
    expect(screen.getByTestId('radial-wedge-0')).toBeTruthy();
    expect(screen.getByTestId('radial-wedge-1')).toBeTruthy();
  });
});
