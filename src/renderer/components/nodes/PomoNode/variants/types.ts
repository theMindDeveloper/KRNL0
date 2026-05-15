// Unified prop type for all five timer face variants (PR4).
// All variants receive the same shape so they are interchangeable.
// m/s are already zero-padded (e.g. "04", "09"); format them once in PomoNode.

export interface TimerFaceProps {
  /** Zero-padded minutes string, e.g. "24" */
  m: string;
  /** Zero-padded seconds string, e.g. "07" */
  s: string;
  /** Percentage of time elapsed (0–100) */
  elapsedPct: number;
  /** Percentage of time remaining (0–100) */
  remainingPct: number;
  /** True only when FSM status is "running" */
  running: boolean;
}
