// Repeating plans (review 5.3): "weekly review every Sunday", "water the
// plants every day". A plan, not a habit — it has its own notes and time each
// time. Ticking one off brings the next one; nothing piles up for days gone by.

export type TaskRepeat =
  | { kind: 'daily' }
  | { kind: 'weekdays' }
  | { kind: 'weekly'; day: number }; // ISO 1 = Mon … 7 = Sun

const pad = (n: number) => String(n).padStart(2, '0');
const ymdOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoDow = (ymd: string) => { const g = new Date(`${ymd}T00:00:00`).getDay(); return g === 0 ? 7 : g; };
const plusDays = (ymd: string, n: number) => { const d = new Date(`${ymd}T00:00:00`); d.setDate(d.getDate() + n); return ymdOf(d); };

function matches(r: TaskRepeat, ymd: string): boolean {
  const dow = isoDow(ymd);
  if (r.kind === 'daily') return true;
  if (r.kind === 'weekdays') return dow <= 5;
  return dow === r.day;
}

/** The first matching day after `base`, never before `today` (no backlog). */
export function nextRepeatDay(r: TaskRepeat, base: string, today: string): string {
  let d = plusDays(base, 1);
  for (let guard = 0; guard < 800; guard++) {
    if (matches(r, d) && d >= today) return d;
    d = plusDays(d, 1);
  }
  return plusDays(today, 1);
}

export function parseRepeat(raw: unknown): TaskRepeat | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { kind?: unknown; day?: unknown };
  if (r.kind === 'daily' || r.kind === 'weekdays') return { kind: r.kind };
  if (r.kind === 'weekly' && typeof r.day === 'number' && Number.isInteger(r.day) && r.day >= 1 && r.day <= 7) return { kind: 'weekly', day: r.day };
  return null;
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** "every day", "weekdays", "every Sunday". */
export function describeTaskRepeat(r: TaskRepeat): string {
  if (r.kind === 'daily') return 'every day';
  if (r.kind === 'weekdays') return 'weekdays';
  return `every ${DAY_NAMES[r.day - 1]}`;
}

export { isoDow as isoDowOfYMD };
