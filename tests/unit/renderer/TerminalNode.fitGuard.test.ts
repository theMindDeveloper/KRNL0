/**
 * Issue #200 — a Station panel is a few pixels wide while it mounts; fitting
 * then sized the PTY to 2 columns and PowerShell drew its prompt two
 * characters per line. Sizing goes through one guarded helper.
 */
import { describe, it, expect, vi } from 'vitest';
import { fitAndSyncPty, safeFit, MIN_FIT_COLS, type Dimensions } from '../../../src/renderer/components/nodes/TerminalNode/fitGuard';

/** A FitAddon double: proposes `next`, and fit() applies it to the terminal. */
function makeFit(term: Dimensions, next: Dimensions | undefined) {
  const state = { next };
  return {
    state,
    fit: vi.fn(() => { if (state.next) { term.cols = state.next.cols; term.rows = state.next.rows; } }),
    proposeDimensions: (): Dimensions | undefined => state.next,
  };
}

describe('safeFit', () => {
  it('ignores a container mid-layout (FitAddon clamps it to 2 columns)', () => {
    const term = { cols: 80, rows: 24 };
    const fit = makeFit(term, { cols: 2, rows: 7 });
    expect(safeFit(fit, term)).toBe(false);
    expect(fit.fit).not.toHaveBeenCalled();
    expect(term).toEqual({ cols: 80, rows: 24 });
  });

  it('ignores an unmeasured terminal (no proposal)', () => {
    const term = { cols: 80, rows: 24 };
    const fit = makeFit(term, undefined);
    expect(safeFit(fit, term)).toBe(false);
    expect(fit.fit).not.toHaveBeenCalled();
  });

  it('fits a real container', () => {
    const term = { cols: 80, rows: 24 };
    expect(safeFit(makeFit(term, { cols: 44, rows: 19 }), term)).toBe(true);
    expect(term).toEqual({ cols: 44, rows: 19 });
  });

  it('accepts exactly the minimum size', () => {
    const term = { cols: 80, rows: 24 };
    expect(safeFit(makeFit(term, { cols: MIN_FIT_COLS, rows: 3 }), term)).toBe(true);
  });
});

describe('fitAndSyncPty', () => {
  it('never sends a tiny size to the PTY', () => {
    const term = { cols: 28, rows: 24 };
    const resize = vi.fn();
    const last = { sessionId: 's1', cols: 28, rows: 24 };
    const out = fitAndSyncPty({ fit: makeFit(term, { cols: 2, rows: 7 }), term, sessionId: 's1', last, resize });
    expect(resize).not.toHaveBeenCalled();
    expect(out).toBe(last);
  });

  it('does not resize when the size is unchanged', () => {
    const term = { cols: 44, rows: 19 };
    const resize = vi.fn();
    const last = { sessionId: 's1', cols: 44, rows: 19 };
    fitAndSyncPty({ fit: makeFit(term, { cols: 44, rows: 19 }), term, sessionId: 's1', last, resize });
    expect(resize).not.toHaveBeenCalled();
  });

  it('resizes once on a real change, then not again', () => {
    const term = { cols: 28, rows: 24 };
    const resize = vi.fn();
    const fit = makeFit(term, { cols: 44, rows: 19 });
    let last = fitAndSyncPty({ fit, term, sessionId: 's1', last: { sessionId: 's1', cols: 28, rows: 24 }, resize });
    expect(resize).toHaveBeenCalledWith('s1', 44, 19);
    last = fitAndSyncPty({ fit, term, sessionId: 's1', last, resize });
    expect(resize).toHaveBeenCalledTimes(1);
    expect(last).toEqual({ sessionId: 's1', cols: 44, rows: 19 });
  });

  it('a new shell gets its size even when cols/rows match the old one', () => {
    const term = { cols: 44, rows: 19 };
    const resize = vi.fn();
    fitAndSyncPty({ fit: makeFit(term, { cols: 44, rows: 19 }), term, sessionId: 's2', last: { sessionId: 's1', cols: 44, rows: 19 }, resize });
    expect(resize).toHaveBeenCalledWith('s2', 44, 19);
  });

  it('fits but sends nothing without a shell', () => {
    const term = { cols: 80, rows: 24 };
    const resize = vi.fn();
    expect(fitAndSyncPty({ fit: makeFit(term, { cols: 44, rows: 19 }), term, sessionId: null, last: null, resize })).toBeNull();
    expect(term.cols).toBe(44);
    expect(resize).not.toHaveBeenCalled();
  });
});
