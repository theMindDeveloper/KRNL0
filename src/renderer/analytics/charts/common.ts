// Shared chart helpers — no React. Pure math.

export function maxOf(nums: readonly number[]): number {
  let m = 0;
  for (const n of nums) if (n > m) m = n;
  return m;
}

export function linearScale(domainMax: number, rangeMax: number): (v: number) => number {
  if (domainMax <= 0) return () => 0;
  return (v) => (v / domainMax) * rangeMax;
}

// Chart colors.
//
// AnalyticsNode's chrome is always dark (hardcoded #16181a gradient) — it
// doesn't follow the global theme. Therefore axis / label / grid tokens
// must NOT use --ink-3 / --ink-4 / --paper-3 (which flip per theme and go
// olive-tan in light mode, leaving chart labels barely visible on the dark
// chart bg). Locked to bright greys instead so the labels read in every
// theme.
//
// Series colors (task / habit / focus) stay theme-aware — they pick up
// the user's brand tone choices and contrast against the chart's dark bg
// regardless.
export const COLOR_TASK = 'var(--cyan)';
export const COLOR_HABIT = 'var(--acid)';
export const COLOR_FOCUS = 'var(--rust)';
export const COLOR_GRID = '#2a2e33';
export const COLOR_AXIS = '#aab0b7';
export const COLOR_LABEL = '#c8cdd3';

export const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;
