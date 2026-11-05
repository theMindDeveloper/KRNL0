// One guarded way to size xterm and the PTY (issue #200).
//
// A Station panel is only a few pixels wide for a moment while it mounts
// (react-resizable-panels applies the real layout one render later).
// FitAddon clamps such a container to 2 columns, and sending that to the
// PTY makes PowerShell / ConPTY redraw the prompt two characters per line —
// a staircase that stays in the terminal after the panel reaches its real
// width. So: never fit to a container too small to be real, and only tell
// the PTY about a size it doesn't already have.

/** Smallest container we believe; anything below is a panel mid-layout. */
export const MIN_FIT_COLS = 10;
export const MIN_FIT_ROWS = 3;

export interface Dimensions { cols: number; rows: number }

/** The FitAddon surface we use. `proposeDimensions` is optional for test doubles. */
export interface GuardedFitSurface {
  fit(): void;
  proposeDimensions?(): Dimensions | undefined;
}

/** The size the PTY was last given (per shell session). */
export interface PtySize extends Dimensions { sessionId: string }

function usable(d: Dimensions | undefined): d is Dimensions {
  return !!d
    && Number.isFinite(d.cols) && Number.isFinite(d.rows)
    && d.cols >= MIN_FIT_COLS && d.rows >= MIN_FIT_ROWS;
}

/**
 * Fit xterm to its container only when the container is big enough to be
 * real. Returns true when xterm now has a usable size.
 */
export function safeFit(fit: GuardedFitSurface, term: Dimensions): boolean {
  if (fit.proposeDimensions) {
    let proposed: Dimensions | undefined;
    try { proposed = fit.proposeDimensions(); } catch { return false; }
    if (!usable(proposed)) return false;
  }
  try { fit.fit(); } catch { return false; }
  return usable(term);
}

export interface SyncPtyArgs {
  fit: GuardedFitSurface;
  term: Dimensions;
  sessionId: string | null;
  /** What the PTY was last given; a resize only goes out when this differs. */
  last: PtySize | null;
  resize: (sessionId: string, cols: number, rows: number) => void;
}

/**
 * Fit xterm (guarded) and resize the PTY when its size really changed.
 * Returns the size the PTY now has (`last` when nothing was sent).
 */
export function fitAndSyncPty({ fit, term, sessionId, last, resize }: SyncPtyArgs): PtySize | null {
  if (!safeFit(fit, term)) return last;
  if (!sessionId) return last;
  if (last && last.sessionId === sessionId && last.cols === term.cols && last.rows === term.rows) return last;
  resize(sessionId, term.cols, term.rows);
  return { sessionId, cols: term.cols, rows: term.rows };
}
