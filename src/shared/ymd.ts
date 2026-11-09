// Local calendar dates as `YYYY-MM-DD` strings — one validator for the CLI,
// the main process and the renderer.

/** True iff `s` is a real calendar date in strict `YYYY-MM-DD` form
 *  (rejects 2026-13-45 and 2026-02-31, which `new Date` would roll over). */
export function isValidYMD(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** A Date's local calendar day as `YYYY-MM-DD`. */
export function localYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Today, local, as `YYYY-MM-DD`. */
export function todayYMD(now: Date = new Date()): string {
  return localYMD(now);
}

/** `ymd` moved by `n` days (local calendar, DST-safe). */
export function addDaysYMD(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + n);
  return localYMD(d);
}

/** ISO weekday of a `YYYY-MM-DD`: 1 = Monday … 7 = Sunday. */
export function isoDowYMD(ymd: string): number {
  const g = new Date(`${ymd}T00:00:00`).getDay();
  return g === 0 ? 7 : g;
}

/** Whole days from `a` to `b` (both `YYYY-MM-DD`). */
export function daysBetweenYMD(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86_400_000);
}
