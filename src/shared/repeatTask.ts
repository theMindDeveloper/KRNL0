// Repeating plans (review 5.3): "weekly review every Sunday", "water the
// plants every day". A plan, not a habit — it has its own notes and time each
// time. Ticking one off brings the next one; nothing piles up for days gone by.

import { addDaysYMD, isoDowYMD } from './ymd';

export type TaskRepeat =
  | { kind: 'daily' }
  | { kind: 'weekdays' }
  | { kind: 'weekly'; day: number }; // ISO 1 = Mon … 7 = Sun

const isoDow = isoDowYMD;
const plusDays = addDaysYMD;

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

/**
 * Repeating plans whose day passed unticked: their next copy was never made
 * (that only happens on tick), so the series would stop. The caller makes the
 * next one from today; the old one stays as it was (missed, not hidden).
 */
export function repeatsBehind(
  items: ReadonlyArray<{ id: string; done: boolean; droppedAt?: string; repeat?: unknown; dueOn?: string; taskNodeId: string | null }>,
  scheduledDay: (taskNodeId: string) => string | undefined,
  today: string,
): string[] {
  const out: string[] = [];
  for (const it of items) {
    if (it.done || it.droppedAt !== undefined || !parseRepeat(it.repeat)) continue;
    const day = (it.taskNodeId ? scheduledDay(it.taskNodeId) : undefined) ?? it.dueOn;
    if (day && day < today) out.push(it.id);
  }
  return out;
}
