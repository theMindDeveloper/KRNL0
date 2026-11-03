// Plain-language analytics summary — the text shown on top of the Overview tab
// and printed by `sys analytics summary`. Pure: takes engine output, returns
// short sentences plus a few headline figures. No React, no clock reads.

import type { AnalyticsResult, RangeArg } from './types';

export interface SummaryStat {
  key: 'tasks' | 'focus' | 'sessions' | 'habits';
  label: string;
  value: string;
  /** % change vs the previous range of the same length; null when there's no baseline. */
  deltaPct: number | null;
}

export interface AnalyticsSummary {
  headline: string;
  sentences: string[];
  stats: SummaryStat[];
}

const DOW = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function fmtMinutes(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}

function pct(now: number, prev: number): number | null {
  if (prev <= 0) return null;
  return Math.round(((now - prev) / prev) * 100);
}

function trendWord(delta: number | null): string {
  if (delta === null) return '';
  if (delta >= 10) return ` — up ${delta}% on the period before`;
  if (delta <= -10) return ` — down ${Math.abs(delta)}% on the period before`;
  return ' — about the same as the period before';
}

function hourLabel(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

export function summarizeAnalytics(
  engine: AnalyticsResult,
  range: RangeArg,
  prevRange: RangeArg,
  rangeDays: number,
): AnalyticsSummary {
  const tot = engine.totals(range);
  const prev = engine.totals(prevRange);
  const open = engine.open();
  const streaks = engine.streaks();
  const days = engine.byDay(range);
  const dow = engine.byDayOfWeek(range);
  const hours = engine.byHourOfDay(range);

  // Same rule as the KPI tiles: any task, habit or tracked focus makes a day active.
  const activeDays = days.filter((d) => d.taskCount > 0 || d.habitCount > 0 || d.focusMin > 0).length;
  const bestDow = [...dow].sort((a, b) => b.focusMin + b.tasks * 25 - (a.focusMin + a.tasks * 25))[0];
  const bestHour = [...hours].sort((a, b) => b.focusMin + b.tasks * 25 - (a.focusMin + a.tasks * 25))[0];
  const hasBestDow = !!bestDow && bestDow.focusMin + bestDow.tasks > 0;
  const hasBestHour = !!bestHour && bestHour.focusMin + bestHour.tasks > 0;

  const tasksDelta = pct(tot.tasksDone, prev.tasksDone);
  const focusDelta = pct(tot.focusMin, prev.focusMin);
  const nothing = tot.tasksDone + tot.focusMin + tot.habitCheckins === 0;

  const period = rangeDays === 7 ? 'this week' : `the last ${rangeDays} days`;
  const headline = nothing
    ? `Nothing tracked in ${period} yet.`
    : `In ${period} you finished ${tot.tasksDone} task${tot.tasksDone === 1 ? '' : 's'} and focused ${fmtMinutes(tot.focusMin)}.`;

  const sentences: string[] = [];
  if (nothing) {
    sentences.push('Finish a task, run a pomo or check off a habit and this fills in.');
  } else {
    if (tot.focusMin > 0) {
      const over = tot.sessions > 0 ? ` over ${tot.sessions} pomodoro${tot.sessions === 1 ? '' : 's'}` : '';
      const breaks = tot.breakMin ? `, plus ${fmtMinutes(tot.breakMin)} of breaks` : '';
      sentences.push(`Focus: ${fmtMinutes(tot.focusMin)}${over}${breaks}${trendWord(focusDelta)}.`);
    }
    if (tot.tasksDone > 0) sentences.push(`Tasks: ${tot.tasksDone} done${trendWord(tasksDelta)}.`);
    sentences.push(`You were active on ${activeDays} of ${rangeDays} days.`);
    if (hasBestDow && hasBestHour) {
      sentences.push(`You get the most done on ${DOW[bestDow!.dow]}s, around ${hourLabel(bestHour!.hour)}.`);
    } else if (hasBestDow) {
      sentences.push(`${DOW[bestDow!.dow]} is your strongest day.`);
    }
    if (streaks.longestHabitStreak > 1) {
      const top = [...streaks.perHabit].sort((a, b) => b.streak - a.streak)[0];
      sentences.push(`Longest habit streak: ${streaks.longestHabitStreak} days${top ? ` (${top.label})` : ''}.`);
    }
  }
  if (open.tasksOpen > 0) sentences.push(`${open.tasksOpen} task${open.tasksOpen === 1 ? ' is' : 's are'} still open.`);
  if (open.focusMinToday > 0) sentences.push(`Today so far: ${fmtMinutes(open.focusMinToday)} of focus.`);

  return {
    headline,
    sentences,
    stats: [
      { key: 'tasks', label: 'Tasks done', value: String(tot.tasksDone), deltaPct: tasksDelta },
      { key: 'focus', label: 'Focus', value: fmtMinutes(tot.focusMin), deltaPct: focusDelta },
      { key: 'sessions', label: 'Sessions', value: String(tot.sessions), deltaPct: pct(tot.sessions, prev.sessions) },
      { key: 'habits', label: 'Habit check-ins', value: String(tot.habitCheckins), deltaPct: pct(tot.habitCheckins, prev.habitCheckins) },
    ],
  };
}
