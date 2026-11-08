// Due dates (review 2.1): "tax form due Friday" — the day it must be done by,
// separate from when you plan to work on it (scheduledFor).

import { addDaysYMD, daysBetweenYMD, isValidYMD } from './ymd';

/** Kept for callers: same as `addDaysYMD`. */
export const addDays = addDaysYMD;
const daysBetween = daysBetweenYMD;

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * "2026-11-13", "today", "tomorrow", "fri" / "friday" (the next one, today
 * counts), "off" / "none" → the due day, null to clear, or undefined when it
 * isn't a day.
 */
export function parseDue(input: string, today: string): string | null | undefined {
  const t = input.trim().toLowerCase();
  if (t === 'off' || t === 'none' || t === 'clear') return null;
  if (t === 'today') return today;
  if (t === 'tomorrow') return addDays(today, 1);
  if (isValidYMD(t)) return t;
  const word: string = input.trim().toLowerCase();
  const idx = WEEKDAYS.findIndex((w) => w === word || (word.length >= 3 && w.startsWith(word)));
  if (idx >= 0) {
    const dow = new Date(`${today}T00:00:00`).getDay();
    return addDays(today, (idx - dow + 7) % 7);
  }
  return undefined;
}

export type DueTone = 'over' | 'today' | 'soon' | 'later';

/** "overdue · Mon 2", "due today", "due tomorrow", "due Fri", "due 13 Nov". */
export function dueLabel(dueOn: string, today: string): { text: string; tone: DueTone } {
  const n = daysBetween(today, dueOn);
  const d = new Date(`${dueOn}T00:00:00`);
  const wd = d.toLocaleDateString('en-GB', { weekday: 'short' });
  if (n < 0) return { text: `overdue · ${wd} ${d.getDate()}`, tone: 'over' };
  if (n === 0) return { text: 'due today', tone: 'today' };
  if (n === 1) return { text: 'due tomorrow', tone: 'soon' };
  if (n < 7) return { text: `due ${wd}`, tone: 'soon' };
  return { text: `due ${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })}`, tone: 'later' };
}
