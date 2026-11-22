// Decision 64 — reading an iCalendar (.ics) file: the events of another
// calendar, every occurrence a year back and a year ahead (F4), in the link's
// time zone. ical.js does the parsing and the repeat rules (RRULE, EXDATE,
// changed occurrences); the time zones go through Intl when the file names an
// IANA zone (Google, Apple), else through the file's own VTIMEZONE (Outlook).

import ICAL from 'ical.js';
import { MAX_EVENTS, WINDOW_DAYS, type LinkedEvent } from './types';

type ITime = InstanceType<typeof ICAL.Time>;
type IEvent = InstanceType<typeof ICAL.Event>;
type IComponent = InstanceType<typeof ICAL.Component>;

export interface IcsRead {
  /** The calendar's own name (X-WR-CALNAME), when it has one. */
  name: string | null;
  /** Distinct events (a repeating one counts once). */
  count: number;
  /** Every occurrence in the window, sorted by start. */
  events: LinkedEvent[];
}

export type IcsResult = IcsRead | { error: 'notCalendar' };

const pad = (n: number) => String(n).padStart(2, '0');

const ianaOk = new Map<string, boolean>();
/** Is this a time-zone name Intl knows (Europe/Berlin, UTC…)? */
export function isIanaZone(tz: string): boolean {
  let ok = ianaOk.get(tz);
  if (ok === undefined) {
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); ok = true; } catch { ok = false; }
    ianaOk.set(tz, ok);
  }
  return ok;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function partsIn(ms: number, tz: string): { y: number; mo: number; d: number; h: number; mi: number; s: number } {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    fmtCache.set(tz, f);
  }
  const p: Record<string, number> = {};
  for (const part of f.formatToParts(new Date(ms))) if (part.type !== 'literal') p[part.type] = Number(part.value);
  return { y: p['year']!, mo: p['month']!, d: p['day']!, h: p['hour']! % 24, mi: p['minute']!, s: p['second']! };
}

/** A wall-clock time in `tz` → epoch ms (the usual two-pass offset fix for DST edges). */
export function wallToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const offsetAt = (ms: number) => {
    const p = partsIn(ms, tz);
    return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
  };
  const o1 = offsetAt(guess);
  let t = guess - o1;
  const o2 = offsetAt(t);
  if (o2 !== o1) t = guess - o2;
  return t;
}

/** Epoch ms → `YYYY-MM-DDTHH:MM` on the wall clock of `tz`. */
export function utcToWall(ms: number, tz: string): string {
  const p = partsIn(ms, tz);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`;
}

/** An ICAL date value → `YYYY-MM-DD`. */
const ymdOf = (t: ITime) => `${t.year}-${pad(t.month)}-${pad(t.day)}`;

/**
 * A date-time of the file → epoch ms. `tzid` is the TZID the property named.
 * UTC stays UTC; an IANA zone goes through Intl; a zone only the file
 * describes (a VTIMEZONE, registered before) goes through ical.js; a
 * floating time is read in `fallbackTz` (the link's own zone).
 */
export function toMs(t: ITime, tzid: string | null, fallbackTz: string): number {
  const zoneId = (t.zone as { tzid?: string } | null)?.tzid;
  if (zoneId === 'UTC' || zoneId === 'Z') return Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
  if (tzid && isIanaZone(tzid)) return wallToUtc(t.year, t.month, t.day, t.hour, t.minute, tzid);
  if (tzid && ICAL.TimezoneService.has(tzid) && zoneId === tzid) return t.toUnixTime() * 1000;
  return wallToUtc(t.year, t.month, t.day, t.hour, t.minute, fallbackTz);
}

export function tzParam(comp: IComponent, prop: 'dtstart' | 'dtend'): string | null {
  const p = comp.getFirstProperty(prop);
  const v = p?.getParameter('tzid');
  return typeof v === 'string' && v ? v : null;
}

function text(comp: IComponent, name: string): string {
  const v = comp.getFirstPropertyValue(name);
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
}

/** Is this text an iCalendar file at all (and not, say, the web page Google shows to share a calendar)? */
export function looksLikeIcs(raw: string): boolean {
  return /BEGIN:VCALENDAR/i.test(raw.slice(0, 4096)) || /BEGIN:VCALENDAR/i.test(raw);
}

/**
 * Parse an .ics file into occurrences between `nowMs - WINDOW_DAYS` and
 * `nowMs + WINDOW_DAYS`, as wall-clock times in `timeZone`.
 */
export function readIcs(raw: string, timeZone: string, nowMs: number = Date.now(), windowDays: number = WINDOW_DAYS): IcsResult {
  if (!looksLikeIcs(raw)) return { error: 'notCalendar' };
  let root: IComponent;
  try {
    root = new ICAL.Component(ICAL.parse(raw) as unknown as never);
  } catch {
    return { error: 'notCalendar' };
  }
  const cal = root.name === 'vcalendar' ? root : root.getFirstSubcomponent('vcalendar');
  if (!cal) return { error: 'notCalendar' };
  for (const tz of cal.getAllSubcomponents('vtimezone')) {
    try { ICAL.TimezoneService.register(tz); } catch { /* a broken zone: its events read as floating */ }
  }
  const from = nowMs - windowDays * 86_400_000;
  const to = nowMs + windowDays * 86_400_000;

  const masters = new Map<string, IEvent>();
  const orphans: IEvent[] = [];
  const exceptions: IEvent[] = [];
  for (const v of cal.getAllSubcomponents('vevent')) {
    let ev: IEvent;
    try { ev = new ICAL.Event(v); } catch { continue; }
    if (!ev.startDate) continue;
    if (ev.isRecurrenceException()) exceptions.push(ev);
    else if (ev.uid && !masters.has(ev.uid)) masters.set(ev.uid, ev);
    else orphans.push(ev);
  }
  for (const ex of exceptions) {
    const m = masters.get(ex.uid);
    if (m) { try { m.relateException(ex); } catch { orphans.push(ex); } } else orphans.push(ex);
  }

  const out: LinkedEvent[] = [];
  const seen = new Set<string>();
  const push = (uid: string, item: IEvent, start: ITime, end: ITime | null, key: string) => {
    if (out.length >= MAX_EVENTS) return false;
    const comp = item.component;
    if (text(comp, 'status').toUpperCase() === 'CANCELLED') return true;
    const title = text(comp, 'summary') || '(no title)';
    const place = text(comp, 'location');
    const id = `${uid}@${key}`;
    if (seen.has(id)) return true;
    if (start.isDate) {
      const s = ymdOf(start);
      let e = end && end.isDate ? ymdOf(end) : '';
      if (!e || e <= s) {
        const d = new Date(Date.UTC(start.year, start.month - 1, start.day + 1));
        e = d.toISOString().slice(0, 10);
      }
      const sMs = Date.UTC(start.year, start.month - 1, start.day);
      const eMs = Date.UTC(Number(e.slice(0, 4)), Number(e.slice(5, 7)) - 1, Number(e.slice(8, 10)));
      if (eMs < from || sMs > to) return true;
      seen.add(id);
      out.push({ id, title, start: s, end: e, allDay: true, ...(place ? { place } : {}) });
      return true;
    }
    const sMs = toMs(start, tzParam(comp, 'dtstart'), timeZone);
    const eMs = end ? toMs(end, tzParam(comp, 'dtend') ?? tzParam(comp, 'dtstart'), timeZone) : sMs;
    if (eMs < from || sMs > to) return true;
    seen.add(id);
    out.push({ id, title, start: utcToWall(sMs, timeZone), end: utcToWall(Math.max(eMs, sMs), timeZone), ...(place ? { place } : {}) });
    return true;
  };

  let count = 0;
  for (const [uid, ev] of masters) {
    count += 1;
    if (!ev.isRecurring()) {
      if (!push(uid, ev, ev.startDate, ev.endDate ?? null, 'once')) break;
      continue;
    }
    let it;
    try { it = ev.iterator(); } catch { continue; }
    let next: ITime | null;
    let guard = 0;
    while ((next = it.next()) && guard++ < 20_000) {
      let det;
      try { det = ev.getOccurrenceDetails(next); } catch { continue; }
      const startMs = det.startDate.isDate
        ? Date.UTC(det.startDate.year, det.startDate.month - 1, det.startDate.day)
        : toMs(det.startDate, tzParam(det.item.component, 'dtstart'), timeZone);
      if (startMs > to) break;
      const key = det.recurrenceId.isDate ? ymdOf(det.recurrenceId) : `${ymdOf(det.recurrenceId)}T${pad(det.recurrenceId.hour)}${pad(det.recurrenceId.minute)}`;
      if (!push(uid, det.item, det.startDate, det.endDate, key)) break;
    }
  }
  orphans.forEach((ev, i) => {
    count += 1;
    push(ev.uid || `orphan-${i}`, ev, ev.startDate, ev.endDate ?? null, ev.recurrenceId ? ymdOf(ev.recurrenceId) : `o${i}`);
  });

  out.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
  const name = text(cal, 'x-wr-calname') || null;
  return { name, count, events: out };
}

/** The first event that starts after now (the "Next" line when adding, F2). */
export function nextEvent(events: readonly LinkedEvent[], nowWall: string): LinkedEvent | null {
  for (const e of events) if ((e.allDay ? `${e.start}T00:00` : e.start) >= nowWall) return e;
  return null;
}
