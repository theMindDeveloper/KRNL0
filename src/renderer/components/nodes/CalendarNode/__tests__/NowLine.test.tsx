// @vitest-environment jsdom
/**
 * NowLine — Slice 3 component tests.
 *
 * Covers:
 *   - Renders when today is in the rendered week.
 *   - Does not render when today is outside the rendered week.
 *   - Position computed correctly for a fake new Date('2026-05-14T10:30:00').
 *   - setInterval callback updates rendered position on tick (vi.advanceTimersByTime).
 *   - Cleanup: unmount clears the interval.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import React from 'react';
import { NowLine } from '../NowLine';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// ── Factories ─────────────────────────────────────────────────────────────────

function makeProps(overrides: Partial<Parameters<typeof NowLine>[0]> = {}) {
  return {
    weekStartDate: '2026-05-11',  // Monday 2026-05-11 → week is May 11-17
    hourRange: { start: 6, end: 23 },
    rowHeight: 28,
    columnWidth: 40,
    gutterWidth: 36,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('NowLine — renders when today is in the rendered week', () => {
  it('renders when now is on Thursday 2026-05-14 (within May 11-17 week)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-14T10:30:00'));

    const { container } = render(<NowLine {...makeProps()} />);
    expect(container.querySelector('[data-testid="now-line"]')).toBeTruthy();
  });
});

describe('NowLine — does not render when today is outside the rendered week', () => {
  it('returns null when now is before weekStartDate', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-10T10:00:00')); // Sunday before the week

    const { container } = render(<NowLine {...makeProps()} />);
    expect(container.querySelector('[data-testid="now-line"]')).toBeNull();
  });

  it('returns null when now is after weekEndDate', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-18T10:00:00')); // Monday after the week

    const { container } = render(<NowLine {...makeProps()} />);
    expect(container.querySelector('[data-testid="now-line"]')).toBeNull();
  });

  it('returns null when now is within the week but hour is before hourRange.start', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-14T04:00:00')); // hour 4, range starts at 6

    const { container } = render(<NowLine {...makeProps()} />);
    expect(container.querySelector('[data-testid="now-line"]')).toBeNull();
  });

  it('returns null when now is within the week but hour is after hourRange.end', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-14T24:00:00')); // hour > 23

    const { container } = render(<NowLine {...makeProps()} />);
    expect(container.querySelector('[data-testid="now-line"]')).toBeNull();
  });
});

describe('NowLine — position computation', () => {
  it('computes correct top position for 2026-05-14T10:30:00 with rowHeight=28, start=6', () => {
    vi.useFakeTimers();
    // 10h30m: hoursFromStart = 10 - 6 + 30/60 = 4.5
    // topPx = 4.5 * 28 = 126
    vi.setSystemTime(new Date('2026-05-14T10:30:00'));

    const { container } = render(<NowLine {...makeProps()} />);
    const line = container.querySelector('[data-testid="now-line"]') as HTMLElement | null;
    expect(line).toBeTruthy();
    // The top style should be 126px (4.5 * 28).
    expect(line!.style.top).toBe('126px');
  });

  it('renders the horizontal bar and the dot', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-14T10:30:00'));

    const { container } = render(<NowLine {...makeProps()} />);
    expect(container.querySelector('[data-testid="now-line-bar"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="now-line-dot"]')).toBeTruthy();
  });
});

describe('NowLine — setInterval tick', () => {
  it('updates position when the 60s interval fires', () => {
    vi.useFakeTimers();
    // Start at 10:00 (hoursFromStart = 4, top = 4 * 28 = 112)
    vi.setSystemTime(new Date('2026-05-14T10:00:00'));

    const { container } = render(<NowLine {...makeProps()} />);
    const line = container.querySelector('[data-testid="now-line"]') as HTMLElement | null;
    expect(line!.style.top).toBe('112px');

    // Advance time by 60s and trigger the interval — moves to 10:01.
    // hoursFromStart = 10 - 6 + 1/60 ≈ 4.0167 → top = 4.0167 * 28 ≈ 112.47px
    act(() => {
      vi.setSystemTime(new Date('2026-05-14T10:01:00'));
      vi.advanceTimersByTime(60_000);
    });

    const lineAfter = container.querySelector('[data-testid="now-line"]') as HTMLElement | null;
    expect(lineAfter).toBeTruthy();
    // Top should be different from 112px (position moved).
    const newTop = parseFloat(lineAfter!.style.top);
    expect(newTop).toBeGreaterThan(112);
  });
});

describe('NowLine — cleanup on unmount', () => {
  it('clears interval on unmount', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-14T10:00:00'));

    const clearSpy = vi.spyOn(window, 'clearInterval');

    const { unmount } = render(<NowLine {...makeProps()} />);
    unmount();

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
