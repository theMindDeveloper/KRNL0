// Clock dial time math (wall-clock hours from a day's start, DST-safe) and
// the break colour tokens. Pure — kept out of index.tsx so React Fast
// Refresh can hot-swap the component.

// Kept for backward-compat — timelineSelector.colorTokens.test.ts imports this.
// The new analog design no longer renders break arcs, but the tokens must still
// exist in tokens.css (Decision 24.2 contract test).
export const BREAK_TOKENS = ['ink-2', 'ink-3'] as const;

/** Wall-clock hours of epoch `ms` counted from the start of `dayYMD` (local).
 *  Unlike (ms - midnight) / 1h this stays on the dial's hour marks on DST
 *  change days, matching the plan arcs (isoHoursFromDayStart). */
export function wallHoursFromDayStart(ms: number, dayYMD: string): number {
  const d = new Date(ms);
  const [y, mo, da] = dayYMD.split('-').map(Number) as [number, number, number];
  const dayOffset = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(y, mo - 1, da).getTime()) / 86_400_000);
  return dayOffset * 24 + d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600 + d.getMilliseconds() / 3_600_000;
}

/** Epoch ms of `hours` wall-clock hours into `dayYMD` (inverse of the above). */
export function msAtWallHours(dayYMD: string, hours: number): number {
  const [y, mo, da] = dayYMD.split('-').map(Number) as [number, number, number];
  return new Date(y, mo - 1, da, 0, 0, 0, Math.round(hours * 3_600_000)).getTime();
}
