// Engine — pure composition of the registered data sources into an
// AnalyticsResult. No React, no Zustand. The hook (`useAnalytics`) wraps
// this in useMemo so it survives the dock's 1-second tick without
// re-bucketing.

import { droppedTaskIds } from '../../shared/droppedPlans';
import type {
  AnalyticsEvent,
  AnalyticsResult,
  BoardLike,
  DayBucket,
  DowBucket,
  HourBucket,
  MonthBucket,
  OpenCounters,
  RangeArg,
  StreakResult,
  Totals,
} from './types';
import { collectAllEvents } from './registry';
import { listHabits } from './sources/habitSource';
import { habitStreak } from '../components/nodes/HabitNode/commands';
import { isoToYMD, splitMinutesByLocalDay, todayLocal } from './dateRange';
import {
  byDay,
  byDayOfWeek,
  byHourOfDay,
  byMonth,
  totals,
} from './bucketBy';

interface TaskLike {
  done?: boolean;
  text?: string;
}

interface PomoSessionLike {
  startedAt?: string;
  endedAt: string;
  durationMin: number;
  completed: boolean;
  kind?: string;
}

interface PomoStateLike {
  history?: PomoSessionLike[];
}

function rangeKey(r: RangeArg): string {
  return `${r.start}|${r.end}`;
}

export function buildAnalytics(board: BoardLike): AnalyticsResult {
  const events: readonly AnalyticsEvent[] = collectAllEvents(board);

  // Per-method memo so repeated calls with the same range arg don't reshape.
  const dayCache = new Map<string, DayBucket[]>();
  const totalsCache = new Map<string, Totals>();
  const dowCache = new Map<string, DowBucket[]>();
  const hourCache = new Map<string, HourBucket[]>();
  const monthCache = new Map<number, MonthBucket[]>();
  let streaksCache: StreakResult | null = null;
  let openCache: OpenCounters | null = null;

  return {
    events: () => events,

    byDay(range) {
      const k = rangeKey(range);
      const hit = dayCache.get(k);
      if (hit) return hit;
      const out = byDay(events, range);
      dayCache.set(k, out);
      return out;
    },

    totals(range) {
      const k = rangeKey(range);
      const hit = totalsCache.get(k);
      if (hit) return hit;
      const out = totals(events, range);
      totalsCache.set(k, out);
      return out;
    },

    byDayOfWeek(range) {
      const k = rangeKey(range);
      const hit = dowCache.get(k);
      if (hit) return hit;
      const out = byDayOfWeek(events, range);
      dowCache.set(k, out);
      return out;
    },

    byHourOfDay(range) {
      const k = rangeKey(range);
      const hit = hourCache.get(k);
      if (hit) return hit;
      const out = byHourOfDay(events, range);
      hourCache.set(k, out);
      return out;
    },

    byMonth(year) {
      const hit = monthCache.get(year);
      if (hit) return hit;
      const out = byMonth(events, year);
      monthCache.set(year, out);
      return out;
    },

    streaks() {
      if (streaksCache) return streaksCache;
      const today = todayLocal();
      const habits = listHabits(board);
      // The same streak as the Habit node, lane and popup (habitStreak): rest
      // days stepped over, a weekly target counted in weeks. "Longest streak"
      // is in days, so a weekly-target habit stays out of it (like milestones).
      const perHabit = habits.map((h) => {
        const s = habitStreak({ log: h.log ?? [], ...(h.schedule ? { schedule: h.schedule } : {}), ...(typeof h.perWeek === 'number' ? { perWeek: h.perWeek } : {}), ...(h.rest ? { rest: h.rest } : {}) }, today);
        return { habitId: h.id, label: h.name, streak: s.current, unit: s.unit };
      });
      const longestHabitStreak = perHabit.filter((p) => p.unit === 'day').reduce((m, p) => Math.max(m, p.streak), 0);
      streaksCache = { longestHabitStreak, perHabit };
      return streaksCache;
    },

    open() {
      if (openCache) return openCache;
      const today = todayLocal();
      let tasksOpen = 0;
      let tasksTotal = 0;
      let sessionsToday = 0;
      let focusMinToday = 0;
      const dropped = droppedTaskIds(board.nodes as never);
      for (const n of board.nodes) {
        if (n.kind === 'todo.task') {
          tasksTotal += 1;
          const s = n.state as TaskLike;
          if (!s.done && !dropped.has(n.id)) tasksOpen += 1;
        } else if (n.kind === 'pomo') {
          const s = n.state as PomoStateLike;
          const history = s.history ?? [];
          for (const rec of history) {
            if (!rec.endedAt || rec.kind === 'break') continue;
            // Sessions count on the day they ended; focus counts today's part
            // of every work span (a span over midnight splits, like the charts).
            if (rec.completed && isoToYMD(rec.endedAt) === today) sessionsToday += 1;
            const endMs = Date.parse(rec.endedAt);
            const startMs = rec.startedAt ? Date.parse(rec.startedAt) : endMs;
            const parts = Number.isFinite(startMs) && startMs < endMs
              ? splitMinutesByLocalDay(startMs, endMs, rec.durationMin ?? 0)
              : [{ date: isoToYMD(rec.endedAt), min: rec.durationMin ?? 0 }];
            for (const p of parts) if (p.date === today) focusMinToday += p.min;
          }
        }
      }
      openCache = { tasksOpen, tasksTotal, sessionsToday, focusMinToday };
      return openCache;
    },
  };
}
