// @vitest-environment jsdom
/**
 * HoldButton — fires onConfirm only after the press is held for holdMs.
 * Releasing early cancels.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { HoldButton } from '../../../src/renderer/components/ui/HoldButton';

afterEach(() => cleanup());

// Drive requestAnimationFrame manually so we control the clock.
function withControlledRaf(run: (advance: (ms: number) => void) => void) {
  let now = 0;
  let nextId = 1;
  const cbs = new Map<number, FrameRequestCallback>();
  const g = globalThis as unknown as Record<string, unknown>;
  const prevRaf = g['requestAnimationFrame'];
  const prevCancel = g['cancelAnimationFrame'];
  g['requestAnimationFrame'] = (cb: FrameRequestCallback) => { const id = nextId++; cbs.set(id, cb); return id; };
  g['cancelAnimationFrame'] = (id: number) => { cbs.delete(id); };
  const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
  const advance = (ms: number) => {
    now += ms;
    const pending = [...cbs.entries()];
    cbs.clear();
    for (const [, cb] of pending) cb(now);
  };
  try {
    run(advance);
  } finally {
    g['requestAnimationFrame'] = prevRaf;
    g['cancelAnimationFrame'] = prevCancel;
    nowSpy.mockRestore();
  }
}

describe('HoldButton', () => {
  it('does NOT fire when released before holdMs', () => {
    withControlledRaf((advance) => {
      const onConfirm = vi.fn();
      const { getByTestId } = render(
        <HoldButton label="Wipe" onConfirm={onConfirm} holdMs={1000} testId="hb" />,
      );
      const btn = getByTestId('hb');
      fireEvent.mouseDown(btn);
      advance(400); // partway
      fireEvent.mouseUp(btn);
      advance(2000); // even if more frames came, it's cancelled
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });

  it('fires once when held past holdMs', () => {
    withControlledRaf((advance) => {
      const onConfirm = vi.fn();
      const { getByTestId } = render(
        <HoldButton label="Wipe" onConfirm={onConfirm} holdMs={1000} testId="hb" />,
      );
      const btn = getByTestId('hb');
      fireEvent.mouseDown(btn);
      advance(600);
      advance(600); // total 1200 > 1000
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  it('does not fire when disabled', () => {
    withControlledRaf((advance) => {
      const onConfirm = vi.fn();
      const { getByTestId } = render(
        <HoldButton label="Wipe" onConfirm={onConfirm} holdMs={1000} disabled testId="hb" />,
      );
      const btn = getByTestId('hb');
      fireEvent.mouseDown(btn);
      advance(2000);
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });
});
