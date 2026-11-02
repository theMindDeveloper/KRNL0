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
