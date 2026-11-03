// Pure date-range helpers. All dates are local YYYY-MM-DD.

import type { RangeArg } from './types';

export function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function todayLocal(): string {
  return toYMD(new Date());
}

export function parseYMD(ymd: string): Date {
  // Force midnight-local so DST shifts can't roll the date back/forward.
  return new Date(ymd + 'T00:00:00');
}

export function addDays(ymd: string, days: number): string {
  const d = parseYMD(ymd);
  d.setDate(d.getDate() + days);
  return toYMD(d);
}

/** Iterate every YYYY-MM-DD inclusive between start and end (start <= end). */
export function eachDay(range: RangeArg): string[] {
  const out: string[] = [];
  let cur = range.start;
  while (cur <= range.end) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** Range covering the last N days, ending today (inclusive). */
export function lastNDays(n: number, today: string = todayLocal()): RangeArg {
  return { start: addDays(today, -(n - 1)), end: today };
}

/** Mon=0 .. Sun=6 (ISO-style). */
export function dowOf(ymd: string): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  const d = parseYMD(ymd);
  // Date.getDay(): 0=Sun .. 6=Sat. Shift to Mon=0 .. Sun=6.
  return ((d.getDay() + 6) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

/** 1..12 from a YYYY-MM-DD. */
export function monthOf(ymd: string): number {
  return parseYMD(ymd).getMonth() + 1;
}

/** 0..23 from an ISO timestamp, interpreted in local time. */
export function hourOfIso(iso: string): number {
  const d = new Date(iso);
  return d.getHours();
}

/** YYYY-MM-DD in local time from an ISO timestamp. */
export function isoToYMD(iso: string): string {
  return toYMD(new Date(iso));
}

/**
 * Split [startMs, endMs) at local midnights: one part per local day with the
 * milliseconds that fell on it. A 23:30–00:30 span is 30 min on each day —
 * the same split the Calendar's week view draws, so every surface puts a
 * span's minutes on the same days.
 */
export function splitByLocalDay(startMs: number, endMs: number): Array<{ date: string; ms: number }> {
  if (!(endMs > startMs)) return [{ date: toYMD(new Date(endMs)), ms: 0 }];
  const out: Array<{ date: string; ms: number }> = [];
  let cur = startMs;
  while (cur < endMs) {
    const d = new Date(cur);
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    const stop = Math.min(next, endMs);
    out.push({ date: toYMD(d), ms: stop - cur });
    cur = stop;
  }
  return out;
}

/** Split `minutes` across the days of [startMs, endMs) in proportion; whole
 *  minutes, and the parts always add up to `minutes`. */
export function splitMinutesByLocalDay(startMs: number, endMs: number, minutes: number): Array<{ date: string; min: number; endMs: number }> {
  const parts = splitByLocalDay(startMs, endMs);
  const total = parts.reduce((a, p) => a + p.ms, 0);
  // `endMs` of a part: the last instant inside its own day, so an hour-of-
  // day bucket puts it at 23:xx of that day, not at the next day's 00:00
  // (a span ending exactly at midnight belongs to the day before).
  if (parts.length === 1 || total <= 0) {
    const date = parts[parts.length - 1]!.date;
    return [{ date, min: minutes, endMs: total > 0 ? endMs - 1 : endMs }];
  }
  // Round the running total, not each part: parts never go negative and
  // always add up to `minutes`.
  let cursor = startMs;
  let doneMs = 0;
  let given = 0;
  return parts.map((p) => {
    doneMs += p.ms;
    cursor += p.ms;
    const upTo = Math.round((minutes * doneMs) / total);
    const min = upTo - given;
    given = upTo;
    return { date: p.date, min, endMs: cursor - 1 };
  });
}

export function yearOf(ymd: string): number {
  return parseYMD(ymd).getFullYear();
}

/** Range covering an entire year. */
export function yearRange(year: number): RangeArg {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

export function inRange(ymd: string, range: RangeArg): boolean {
  return ymd >= range.start && ymd <= range.end;
}
