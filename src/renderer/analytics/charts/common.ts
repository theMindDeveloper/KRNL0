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

// Theme tokens — kept as CSS var refs so light/dark theme switches Just Work.
export const COLOR_TASK = 'var(--cyan)';
export const COLOR_HABIT = 'var(--acid)';
export const COLOR_FOCUS = 'var(--rust)';
export const COLOR_GRID = 'var(--paper-3)';
export const COLOR_AXIS = 'var(--ink-4)';
export const COLOR_LABEL = 'var(--ink-3)';

export const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;
