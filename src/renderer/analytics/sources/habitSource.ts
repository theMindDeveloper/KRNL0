// Habit data source — emits one 'habit.checkin' per (habit, YYYY-MM-DD) pair
// across all non-archived habits on the habit mother node.

import type { AnalyticsDataSource, AnalyticsEvent, BoardLike } from '../types';
import type { HabitSchedule } from '../../components/nodes/HabitNode/types';
import { isDayScheduled } from '../../components/nodes/HabitNode/types';

interface HabitLike {
  id: string;
  name: string;
  log?: string[];
  archived?: boolean;
  schedule?: HabitSchedule;
}

interface HabitStateLike {
  habits?: HabitLike[];
}

export const habitSource: AnalyticsDataSource = {
  id: 'habit',
  label: 'Habits',
  collect(board: BoardLike): AnalyticsEvent[] {
    const out: AnalyticsEvent[] = [];
    for (const n of board.nodes) {
      if (n.kind !== 'habit') continue;
      const s = n.state as HabitStateLike;
      const habits = s.habits ?? [];
      for (const h of habits) {
        if (h.archived) continue;
        const log = h.log ?? [];
        for (const ymd of log) {
          out.push({
            source: 'habit',
            type: 'habit.checkin',
            date: ymd,
            metadata: { habitId: h.id, habitName: h.name },
          });
        }
      }
    }
    return out;
  },
};

// Streak helper exported here because it depends on Habit shape — kept out of
// the engine so the engine stays domain-agnostic.

function prevYmd(ymd: string): string {
  const d = new Date(ymd + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

// Schedule-aware streak: non-scheduled days are skipped (neither extend nor
// break the streak). Grace: if today is scheduled but not yet logged, start
// from the previous scheduled day.
export function calcHabitStreak(
  log: readonly string[],
  today: string,
  schedule?: HabitSchedule,
): number {
  const seen = new Set(log);

  let cursor = today;
  let safety = 366;
  while (!isDayScheduled(schedule, cursor) && safety-- > 0) cursor = prevYmd(cursor);

  if (cursor === today && !seen.has(cursor)) {
    cursor = prevYmd(cursor);
    safety = 366;
    while (!isDayScheduled(schedule, cursor) && safety-- > 0) cursor = prevYmd(cursor);
  }

  let streak = 0;
  while (seen.has(cursor)) {
    streak += 1;
    cursor = prevYmd(cursor);
    safety = 366;
    while (!isDayScheduled(schedule, cursor) && safety-- > 0) cursor = prevYmd(cursor);
  }
  return streak;
}

export function listHabits(board: BoardLike): HabitLike[] {
  for (const n of board.nodes) {
    if (n.kind !== 'habit') continue;
    const s = n.state as HabitStateLike;
    return (s.habits ?? []).filter((h) => !h.archived);
  }
  return [];
}
