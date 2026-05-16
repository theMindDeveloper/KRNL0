// Habit data source — emits one 'habit.checkin' per (habit, YYYY-MM-DD) pair
// across all non-archived habits on the habit mother node.

import type { AnalyticsDataSource, AnalyticsEvent, BoardLike } from '../types';

interface HabitLike {
  id: string;
  name: string;
  log?: string[];
  archived?: boolean;
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

export function calcHabitStreak(log: readonly string[], today: string): number {
  // log is sorted desc per HabitNode convention, but tolerate any order.
  const seen = new Set(log);
  let streak = 0;
  let cursor = today;
  while (seen.has(cursor)) {
    streak += 1;
    // Step back one day.
    const d = new Date(cursor + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    cursor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
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
