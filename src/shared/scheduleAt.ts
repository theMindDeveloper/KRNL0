// The one parser for a schedule time typed by a person or the AI — shared by
// `krnl task schedule --at` and the Commander popup, so both accept the same
// values.

/**
 * Normalize a `--at` value to the local "YYYY-MM-DDTHH:MM" shape the calendar
 * writes and the schedule selector compares lexicographically. Values with a
 * `Z` or offset are converted to local time; free text ("tomorrow") and
 * impossible dates return null.
 */
export function normalizeScheduleAt(at: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(at.trim());
  if (!m) return null;
  const d = new Date(m[7] ? at.trim() : `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}`);
  if (Number.isNaN(d.getTime())) return null;
  if (!m[7]) {
    // Local input: reject rollovers such as 2026-02-30 or 25:00.
    if (d.getFullYear() !== Number(m[1]) || d.getMonth() + 1 !== Number(m[2]) || d.getDate() !== Number(m[3])
      || d.getHours() !== Number(m[4]) || d.getMinutes() !== Number(m[5])) return null;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Like normalizeScheduleAt, but a bare "HH:MM" means that time today. */
export function normalizeStartInput(input: string, now: Date = new Date()): string | null {
  const hm = /^(\d{1,2}):(\d{2})$/.exec(input.trim());
  if (hm) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return normalizeScheduleAt(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(Number(hm[1]))}:${hm[2]}`);
  }
  return normalizeScheduleAt(input);
}
