// Due dates (review 2.1): "tax form due Friday" — the day it must be done by,
// separate from when you plan to work on it (scheduledFor).

import { isValidYMD } from './ymd';

const pad = (n: number) => String(n).padStart(2, '0');
const ymdOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + n);
  return ymdOf(d);
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86_400_000);
}

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
