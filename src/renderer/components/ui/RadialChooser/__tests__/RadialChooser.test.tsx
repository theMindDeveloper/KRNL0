// @vitest-environment jsdom
/**
 * RadialChooser unit tests.
 * Covers:
 *   - Renders nothing when closed.
 *   - Renders N wedges when open with N options.
 *   - Wedge highlight changes on cursor angle (simulate dragover events).
 *   - Dead-zone drop calls onCancel.
 *   - Wedge drop calls onPick with the highlighted option.
 *   - Escape key calls onCancel.
 *   - Cleanup: listeners removed on close.
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
function openWith2(
  onPick = vi.fn(),
  onCancel = vi.fn(),
) {
  const options: RadialOption<string>[] = [
    { id: 'left', label: 'LEFT', value: 'left', icon: '←', color: 'var(--cyan)' },
    { id: 'right', label: 'RIGHT', value: 'right', icon: '→', color: 'var(--acid)' },
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

  it('wedge highlight changes on dragover — left wedge at angle 180°', () => {
    render(<RadialChooserHost />);
    openWith2();

    // origin is (400, 300). Cursor at (400 - 60, 300) = angle 180° → left wedge (index 0).
    act(() => {
      const ev = new MouseEvent('dragover', {
        bubbles: true, cancelable: true, clientX: 340, clientY: 300,
      });
      window.dispatchEvent(ev);
    });

    expect(screen.getByTestId('radial-wedge-0').getAttribute('data-hovered')).toBe('true');
    expect(screen.queryByTestId('radial-wedge-1')?.getAttribute('data-hovered')).toBeNull();
  });

  it('wedge highlight changes on dragover — right wedge at angle 0°', () => {
    render(<RadialChooserHost />);
    openWith2();

    // origin is (400, 300). Cursor at (400 + 60, 300) = angle 0° → right wedge (index 1).
    act(() => {
      const ev = new MouseEvent('dragover', {
        bubbles: true, cancelable: true, clientX: 460, clientY: 300,
      });
      window.dispatchEvent(ev);
    });

    expect(screen.getByTestId('radial-wedge-1').getAttribute('data-hovered')).toBe('true');
    expect(screen.queryByTestId('radial-wedge-0')?.getAttribute('data-hovered')).toBeNull();
  });

  it('dead-zone drop calls onCancel', () => {
    render(<RadialChooserHost />);
    const { onCancel, onPick } = openWith2();

    // Drop inside dead zone (within 24px of origin 400,300).
    act(() => {
      const ev = new MouseEvent('drop', {
        bubbles: true, cancelable: true, clientX: 402, clientY: 300,
      });
      window.dispatchEvent(ev);
    });

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.queryByTestId('radial-chooser-host')).toBeNull();
  });

  it('wedge drop calls onPick with highlighted option (right wedge)', () => {
    render(<RadialChooserHost />);
    const { onPick, onCancel } = openWith2();

    // Drop on the right wedge (cursor at x+60 from origin → angle ~0°).
    act(() => {
      const ev = new MouseEvent('drop', {
        bubbles: true, cancelable: true, clientX: 460, clientY: 300,
      });
      window.dispatchEvent(ev);
    });

    expect(onPick).toHaveBeenCalledOnce();
    expect(onPick).toHaveBeenCalledWith('right', expect.objectContaining({ id: 'right' }));
    expect(onCancel).not.toHaveBeenCalled();
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

    // Should have removed the listeners.
    expect(removeSpy).toHaveBeenCalled();
    const calledTypes = removeSpy.mock.calls.map((c) => c[0]);
    expect(calledTypes).toContain('dragover');
    expect(calledTypes).toContain('drop');
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
