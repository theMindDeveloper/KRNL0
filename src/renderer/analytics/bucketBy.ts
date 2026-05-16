// Pure bucketing primitives. No store imports, no React.
// All inputs are AnalyticsEvent arrays; outputs are typed bucket arrays.

import type {
  AnalyticsEvent,
  DayBucket,
  DowBucket,
  HourBucket,
  MonthBucket,
  RangeArg,
  Totals,
} from './types';
import {
  eachDay,
  dowOf,
  hourOfIso,
  monthOf,
  yearOf,
  inRange,
} from './dateRange';

function emptyDay(date: string): DayBucket {
  return { date, taskCount: 0, habitCount: 0, focusMin: 0, sessions: 0 };
}

/** Group events into one bucket per day across the given range. Zero-fills
 *  empty days. Events outside the range are dropped. */
export function byDay(events: readonly AnalyticsEvent[], range: RangeArg): DayBucket[] {
  const map = new Map<string, DayBucket>();
  for (const d of eachDay(range)) map.set(d, emptyDay(d));
  for (const e of events) {
    if (!inRange(e.date, range)) continue;
    const b = map.get(e.date);
    if (!b) continue;
    if (e.type === 'task.completed') b.taskCount += 1;
    else if (e.type === 'habit.checkin') b.habitCount += 1;
    else if (e.type === 'pomo.session') {
      b.sessions += 1;
      b.focusMin += e.durationMin ?? 0;
    }
  }
  return Array.from(map.values());
}

export function totals(events: readonly AnalyticsEvent[], range: RangeArg): Totals {
  let tasksDone = 0;
  let habitCheckins = 0;
  let focusMin = 0;
  let sessions = 0;
  for (const e of events) {
    if (!inRange(e.date, range)) continue;
    if (e.type === 'task.completed') tasksDone += 1;
    else if (e.type === 'habit.checkin') habitCheckins += 1;
    else if (e.type === 'pomo.session') {
      sessions += 1;
      focusMin += e.durationMin ?? 0;
    }
  }
  return { tasksDone, habitCheckins, focusMin, sessions };
}

export function byDayOfWeek(events: readonly AnalyticsEvent[], range: RangeArg): DowBucket[] {
  const out: DowBucket[] = [];
  for (let i = 0; i < 7; i++) {
    out.push({ dow: i as DowBucket['dow'], tasks: 0, habits: 0, focusMin: 0 });
  }
  for (const e of events) {
    if (!inRange(e.date, range)) continue;
    const b = out[dowOf(e.date)]!;
    if (e.type === 'task.completed') b.tasks += 1;
    else if (e.type === 'habit.checkin') b.habits += 1;
    else if (e.type === 'pomo.session') b.focusMin += e.durationMin ?? 0;
  }
  return out;
}

export function byHourOfDay(events: readonly AnalyticsEvent[], range: RangeArg): HourBucket[] {
  const out: HourBucket[] = [];
  for (let h = 0; h < 24; h++) out.push({ hour: h, tasks: 0, focusMin: 0 });
  for (const e of events) {
    if (!inRange(e.date, range)) continue;
    if (!e.isoTimestamp) continue;
    const h = hourOfIso(e.isoTimestamp);
    if (h < 0 || h > 23) continue;
    const b = out[h]!;
    if (e.type === 'task.completed') b.tasks += 1;
    else if (e.type === 'pomo.session') b.focusMin += e.durationMin ?? 0;
  }
  return out;
}

export function byMonth(events: readonly AnalyticsEvent[], year: number): MonthBucket[] {
  const out: MonthBucket[] = [];
  for (let m = 1; m <= 12; m++) out.push({ month: m, tasks: 0, habits: 0, focusMin: 0 });
  for (const e of events) {
    if (yearOf(e.date) !== year) continue;
    const b = out[monthOf(e.date) - 1]!;
    if (e.type === 'task.completed') b.tasks += 1;
    else if (e.type === 'habit.checkin') b.habits += 1;
    else if (e.type === 'pomo.session') b.focusMin += e.durationMin ?? 0;
  }
  return out;
}
