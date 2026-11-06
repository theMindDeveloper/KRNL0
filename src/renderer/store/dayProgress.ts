// Planned blocks done per day (docs/06-requirements/engagement.md F18): the
// Clock's outer ring (today) and its week marks. A day with no plan has
// nothing to fail, so it reads as empty, not as zero.

import type { Board } from '../../shared/types';

export interface DayProgress { date: string; planned: number; done: number }

type Loose = Record<string, unknown>;

export function dayProgress(board: Pick<Board, 'nodes'> | null | undefined, date: string): DayProgress {
  let planned = 0;
  let done = 0;
  for (const n of board?.nodes ?? []) {
    if (n.kind !== 'todo.task') continue;
    const s = n.state as Loose;
    if (typeof s['scheduledFor'] !== 'string' || !s['scheduledFor'].startsWith(date)) continue;
    planned += 1;
    if (s['done'] === true) done += 1;
  }
  return { date, planned, done };
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Monday..Sunday of the week holding `today`. */
export function weekProgress(board: Pick<Board, 'nodes'> | null | undefined, today: string): DayProgress[] {
  const d = new Date(`${today}T00:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const out: DayProgress[] = [];
  for (let i = 0; i < 7; i++) {
    out.push(dayProgress(board, ymd(d)));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** 0..1 share of planned blocks done (0 with no plan). */
export const progressRatio = (p: DayProgress): number => (p.planned > 0 ? p.done / p.planned : 0);
