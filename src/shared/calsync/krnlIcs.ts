// Decision 64 / calendar-sync F5 — a board's own events as an .ics file, and
// an .ics file as KRNL0 events. Pure: the caller hands in plain data (no board
// shape here) and gets plain data back.

import ICAL from 'ical.js';
import { isIanaZone, looksLikeIcs, toMs, tzParam, utcToWall, wallToUtc } from './ics';

type IEvent = InstanceType<typeof ICAL.Event>;
type ITime = InstanceType<typeof ICAL.Time>;

// ── Export ─────────────────────────────────────────────────────────────────

export interface ExportEvent {
  id: string;
  /** Its UID in a calendar file (default `<id>@krnl0`): an event that came from a calendar keeps that calendar's. */
  uid?: string;
  name: string;
  place?: string;
  /** 'daily' · 'weekdays' · weekly on ISO days (1 = Mon … 7 = Sun). */
  repeat: { kind: 'daily' } | { kind: 'weekdays' } | { kind: 'weekly'; days: number[] };
  at: string;
  lengthMin: number;
  /** First and last day; both the same day = it happens once. */
  startsOn: string;
  endsOn?: string;
  skips: string[];
  moved: Array<{ date: string; at: string }>;
}

export interface ExportTask {
  id: string;
  uid?: string;
  title: string;
  start: string;
  end: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const DAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

/** RFC 5545 text escaping. */
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Lines longer than 75 octets are folded (a space starts each continuation). */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let curLen = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (curLen + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; curLen = 0; }
    cur += ch;
    curLen += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const local = (date: string, at: string) => `${date.replace(/-/g, '')}T${at.replace(':', '')}00`;
const utcStamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function isoDow(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function happensOn(ev: ExportEvent, date: string): boolean {
  const dow = isoDow(date);
  if (ev.repeat.kind === 'daily') return true;
  if (ev.repeat.kind === 'weekdays') return dow <= 5;
  return ev.repeat.days.includes(dow);
}

function endOf(date: string, at: string, lengthMin: number): { date: string; at: string } {
  const start = Number(at.slice(0, 2)) * 60 + Number(at.slice(3, 5));
  const end = start + lengthMin;
  return { date: addDays(date, Math.floor(end / 1440)), at: `${pad(Math.floor((end % 1440) / 60))}:${pad(end % 60)}` };
}

/** This board's events and planned tasks as one .ics file (F5). */
export function toIcs(events: readonly ExportEvent[], tasks: readonly ExportTask[], timeZone: string, nowMs: number = Date.now()): string {
  const tz = isIanaZone(timeZone) ? timeZone : 'UTC';
  const stamp = utcStamp(nowMs);
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//KRNL0//Calendar//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:KRNL0'];
  const vevent = (uid: string, summary: string, date: string, at: string, lengthMin: number, extra: string[] = [], place?: string) => {
    const end = endOf(date, at, lengthMin);
    lines.push('BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp}`, `DTSTART;TZID=${tz}:${local(date, at)}`, `DTEND;TZID=${tz}:${local(end.date, end.at)}`, `SUMMARY:${esc(summary)}`);
    if (place) lines.push(`LOCATION:${esc(place)}`);
    lines.push(...extra, 'END:VEVENT');
  };

  for (const ev of events) {
    const uid = ev.uid ?? `${ev.id}@krnl0`;
    if (ev.endsOn && ev.endsOn === ev.startsOn) {
      const moved = ev.moved.find((m) => m.date === ev.startsOn);
      if (!ev.skips.includes(ev.startsOn)) vevent(uid, ev.name, ev.startsOn, moved?.at ?? ev.at, ev.lengthMin, [], ev.place);
      continue;
    }
    // The first day it really happens, from its first day on.
    let first = ev.startsOn;
    for (let i = 0; i < 7 && !happensOn(ev, first); i++) first = addDays(first, 1);
    const byDay = ev.repeat.kind === 'weekdays' ? 'MO,TU,WE,TH,FR' : ev.repeat.kind === 'weekly' ? [...ev.repeat.days].sort().map((d) => DAY_CODES[d - 1]).join(',') : '';
    const until = ev.endsOn ? `;UNTIL=${utcStamp(wallToUtc(Number(ev.endsOn.slice(0, 4)), Number(ev.endsOn.slice(5, 7)), Number(ev.endsOn.slice(8, 10)), 23, 59, tz))}` : '';
    const rule = `RRULE:FREQ=${ev.repeat.kind === 'daily' ? 'DAILY' : 'WEEKLY'}${byDay ? `;BYDAY=${byDay}` : ''}${until}`;
    // A moved day is not an EXDATE: its RECURRENCE-ID override below takes its place.
    const exdates = ev.skips.filter((d) => d >= first).map((d) => `EXDATE;TZID=${tz}:${local(d, ev.at)}`);
    vevent(uid, ev.name, first, ev.at, ev.lengthMin, [rule, ...exdates], ev.place);
    for (const m of ev.moved) {
      if (m.date < first || ev.skips.includes(m.date)) continue;
      vevent(uid, ev.name, m.date, m.at, ev.lengthMin, [`RECURRENCE-ID;TZID=${tz}:${local(m.date, ev.at)}`], ev.place);
    }
  }
  for (const t of tasks) {
    const date = t.start.slice(0, 10);
    const at = t.start.slice(11, 16);
    const startMs = Date.parse(`${t.start}:00`);
    const endMs = Date.parse(`${t.end}:00`);
    const lengthMin = Number.isFinite(startMs) && Number.isFinite(endMs) ? Math.max(5, Math.round((endMs - startMs) / 60_000)) : 30;
    vevent(t.uid ?? `${t.id}@krnl0`, t.title, date, at, lengthMin);
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

// ── Import ─────────────────────────────────────────────────────────────────

export type ImportItem =
  | { kind: 'once'; uid: string; name: string; place?: string; on: string; at: string; lengthMin: number }
  | { kind: 'repeat'; uid: string; name: string; place?: string; schedule: { kind: 'daily' } | { kind: 'weekly'; days: number[] }; at: string; lengthMin: number; startsOn: string; endsOn?: string; skips: string[] };

export interface ImportPlan {
  items: ImportItem[];
  /** One-time events (also each day of a repeat KRNL0 cannot follow). */
  once: number;
  /** Events that repeat every week or every day. */
  repeating: number;
  /** Repeats KRNL0 cannot follow (monthly, every second week…), added day by day for a year. */
  expanded: number;
  /** Already on this Calendar (same UID): skipped. */
  existing: number;
  /** All-day events: KRNL0 events have a time, so these are left out. */
  allDay: number;
}

const clampLen = (min: number) => Math.min(720, Math.max(5, Math.round(min)));

/**
 * What an .ics file would add (F5): nothing is changed here. `existingUids`
 * are the UIDs already imported on this board, so a second import adds nothing.
 */
export function planIcsImport(raw: string, timeZone: string, existingUids: ReadonlySet<string>, nowMs: number = Date.now()): ImportPlan | { error: 'notCalendar' } {
  if (!looksLikeIcs(raw)) return { error: 'notCalendar' };
  let cal: InstanceType<typeof ICAL.Component> | null;
  try {
    const root = new ICAL.Component(ICAL.parse(raw) as unknown as never);
    cal = root.name === 'vcalendar' ? root : root.getFirstSubcomponent('vcalendar');
  } catch {
    return { error: 'notCalendar' };
  }
  if (!cal) return { error: 'notCalendar' };
  for (const tz of cal.getAllSubcomponents('vtimezone')) {
    try { ICAL.TimezoneService.register(tz); } catch { /* read as floating */ }
  }
  const plan: ImportPlan = { items: [], once: 0, repeating: 0, expanded: 0, existing: 0, allDay: 0 };
  const masters = new Map<string, IEvent>();
  const exceptions: IEvent[] = [];
  for (const v of cal.getAllSubcomponents('vevent')) {
    let ev: IEvent;
    try { ev = new ICAL.Event(v); } catch { continue; }
    if (!ev.startDate) continue;
    if (ev.isRecurrenceException()) exceptions.push(ev);
    else if (!masters.has(ev.uid || `nouid-${masters.size}`)) masters.set(ev.uid || `nouid-${masters.size}`, ev);
  }
  for (const ex of exceptions) { const m = masters.get(ex.uid); if (m) { try { m.relateException(ex); } catch { /* left out */ } } }

  const wallOf = (t: ITime, ev: IEvent, prop: 'dtstart' | 'dtend') => utcToWall(toMs(t, tzParam(ev.component, prop) ?? tzParam(ev.component, 'dtstart'), timeZone), timeZone);
  const text = (ev: IEvent, name: string) => { const v = ev.component.getFirstPropertyValue(name); return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''; };
  const cancelled = (ev: IEvent) => text(ev, 'status').toUpperCase() === 'CANCELLED';
  const lengthOf = (start: string, end: string) => clampLen((Date.parse(`${end}:00`) - Date.parse(`${start}:00`)) / 60_000 || 60);
  const horizon = utcToWall(nowMs + 366 * 86_400_000, timeZone);
  const expandedUids = new Set<string>();

  for (const [uid, ev] of masters) {
    if (cancelled(ev)) continue;
    if (existingUids.has(uid)) { plan.existing += 1; continue; }
    if (ev.startDate.isDate) { plan.allDay += 1; continue; }
    const name = text(ev, 'summary') || '(no title)';
    const place = text(ev, 'location') || undefined;
    const start = wallOf(ev.startDate, ev, 'dtstart');
    const end = ev.endDate ? wallOf(ev.endDate, ev, 'dtend') : start;
    const lengthMin = lengthOf(start, end);
    if (!ev.isRecurring()) {
      plan.items.push({ kind: 'once', uid, name, ...(place ? { place } : {}), on: start.slice(0, 10), at: start.slice(11, 16), lengthMin });
      plan.once += 1;
      continue;
    }
    const rule = ev.component.getFirstPropertyValue('rrule') as InstanceType<typeof ICAL.Recur> | null;
    const parts = (rule?.parts ?? {}) as Record<string, unknown[] | undefined>;
    const partKeys = Object.keys(parts).filter((k) => (parts[k]?.length ?? 0) > 0);
    const byDay = (parts['BYDAY'] ?? []) as string[];
    const simpleDays = byDay.every((d) => /^(MO|TU|WE|TH|FR|SA|SU)$/.test(d));
    const simple = !!rule && (rule.interval ?? 1) === 1 && !rule.count && !ev.component.getFirstProperty('rdate')
      && ((rule.freq === 'DAILY' && partKeys.length === 0) || (rule.freq === 'WEEKLY' && partKeys.every((k) => k === 'BYDAY') && simpleDays));
    if (simple && rule) {
      const days = rule.freq === 'DAILY' ? null : (byDay.length ? byDay.map((d) => DAY_CODES.indexOf(d) + 1) : [isoDow(start.slice(0, 10))]);
      const skips: string[] = [];
      for (const p of ev.component.getAllProperties('exdate')) {
        for (const v of p.getValues()) {
          const t = v as ITime;
          skips.push(t.isDate ? `${t.year}-${pad(t.month)}-${pad(t.day)}` : utcToWall(toMs(t, (p.getParameter('tzid') as string | null) ?? tzParam(ev.component, 'dtstart'), timeZone), timeZone).slice(0, 10));
        }
      }
      // A changed occurrence: that day is skipped and comes back as a one-time event.
      for (const ex of Object.values(ev.exceptions as unknown as Record<string, IEvent>)) {
        const rid = ex.recurrenceId;
        if (rid) skips.push(rid.isDate ? `${rid.year}-${pad(rid.month)}-${pad(rid.day)}` : wallOf(rid, ex, 'dtstart').slice(0, 10));
        if (cancelled(ex) || ex.startDate.isDate) continue;
        const s = wallOf(ex.startDate, ex, 'dtstart');
        const e = ex.endDate ? wallOf(ex.endDate, ex, 'dtend') : s;
        plan.items.push({ kind: 'once', uid: `${uid}@${s.slice(0, 10)}`, name: text(ex, 'summary') || name, ...(place ? { place } : {}), on: s.slice(0, 10), at: s.slice(11, 16), lengthMin: lengthOf(s, e) });
        plan.once += 1;
      }
      const until = rule.until ? (rule.until.isDate ? `${rule.until.year}-${pad(rule.until.month)}-${pad(rule.until.day)}` : utcToWall(toMs(rule.until, null, 'UTC'), timeZone).slice(0, 10)) : undefined;
      plan.items.push({
        kind: 'repeat', uid, name, ...(place ? { place } : {}),
        schedule: days ? { kind: 'weekly', days: [...new Set(days)].sort() } : { kind: 'daily' },
        at: start.slice(11, 16), lengthMin, startsOn: start.slice(0, 10), ...(until ? { endsOn: until } : {}), skips: [...new Set(skips)].sort(),
      });
      plan.repeating += 1;
      continue;
    }
    // A repeat KRNL0 cannot follow: each time in the next year, as one-time events.
    const nowWall = utcToWall(nowMs, timeZone);
    let it;
    try { it = ev.iterator(); } catch { continue; }
    let next: ITime | null;
    let guard = 0;
    while ((next = it.next()) && guard++ < 5000) {
      const det = ev.getOccurrenceDetails(next);
      if (det.startDate.isDate || cancelled(det.item)) continue;
      const s = wallOf(det.startDate, det.item, 'dtstart');
      if (s > horizon) break;
      if (s < nowWall) continue;
      const e = det.endDate ? wallOf(det.endDate, det.item, 'dtend') : s;
      plan.items.push({ kind: 'once', uid: `${uid}@${s.slice(0, 10)}`, name: text(det.item, 'summary') || name, ...(place ? { place } : {}), on: s.slice(0, 10), at: s.slice(11, 16), lengthMin: lengthOf(s, e) });
      expandedUids.add(`${uid}@${s.slice(0, 10)}`);
    }
  }
  // A day of an earlier import (a changed or day-by-day occurrence) is not added twice.
  const fresh = plan.items.filter((i) => !existingUids.has(i.uid));
  plan.existing += plan.items.length - fresh.length;
  plan.items = fresh;
  plan.repeating = fresh.filter((i) => i.kind === 'repeat').length;
  plan.expanded = fresh.filter((i) => expandedUids.has(i.uid)).length;
  plan.once = fresh.length - plan.repeating - plan.expanded;
  return plan;
}

/** "9 events · 3 repeat every week · 2 added day by day · 1 already here" (CLI and the import card). */
export function importSummary(p: ImportPlan): string {
  const parts = [`${p.once} one-time`, `${p.repeating} repeating`];
  if (p.expanded) parts.push(`${p.expanded} added day by day (repeats KRNL0 can't follow)`);
  if (p.existing) parts.push(`${p.existing} already on your Calendar`);
  if (p.allDay) parts.push(`${p.allDay} all-day left out`);
  return parts.join(' · ');
}

// ── One calendar entry ↔ a KRNL0 item (two-way sync, Decision 64 P2) ─────

/** What one calendar entry (a VCALENDAR with one event and its changed days) is for KRNL0. */
export interface MirrorRead {
  uid: string;
  /** Null when KRNL0 cannot hold it: an all-day event, a monthly repeat, every second week… */
  item: (ExportEvent & { uid: string }) | null;
}

/**
 * Read one entry of the KRNL0 calendar as a KRNL0 item: a one-time event, or
 * an event that repeats every day or on some weekdays, with its skipped and
 * moved days. Anything else is `item: null` (shown read-only, F11).
 */
export function icsToMirror(raw: string, timeZone: string): MirrorRead | null {
  if (!looksLikeIcs(raw)) return null;
  let cal: InstanceType<typeof ICAL.Component> | null;
  try {
    const root = new ICAL.Component(ICAL.parse(raw) as unknown as never);
    cal = root.name === 'vcalendar' ? root : root.getFirstSubcomponent('vcalendar');
  } catch {
    return null;
  }
  if (!cal) return null;
  for (const tz of cal.getAllSubcomponents('vtimezone')) {
    try { ICAL.TimezoneService.register(tz); } catch { /* read as floating */ }
  }
  let master: IEvent | null = null;
  const exceptions: IEvent[] = [];
  for (const v of cal.getAllSubcomponents('vevent')) {
    let ev: IEvent;
    try { ev = new ICAL.Event(v); } catch { continue; }
    if (!ev.startDate) continue;
    if (ev.isRecurrenceException()) exceptions.push(ev); else if (!master) master = ev;
  }
  if (!master) return null;
  const uid = master.uid || '';
  if (!uid) return null;
  const text = (ev: IEvent, name: string) => { const v = ev.component.getFirstPropertyValue(name); return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''; };
  if (master.startDate.isDate) return { uid, item: null };
  const wallOf = (t: ITime, ev: IEvent, prop: 'dtstart' | 'dtend') => utcToWall(toMs(t, tzParam(ev.component, prop) ?? tzParam(ev.component, 'dtstart'), timeZone), timeZone);
  const start = wallOf(master.startDate, master, 'dtstart');
  const end = master.endDate ? wallOf(master.endDate, master, 'dtend') : start;
  const lengthMin = clampLen((Date.parse(`${end}:00`) - Date.parse(`${start}:00`)) / 60_000 || 60);
  const name = text(master, 'summary') || '(no title)';
  const place = text(master, 'location');
  const base = { id: uid, uid, name, ...(place ? { place } : {}), at: start.slice(11, 16), lengthMin, skips: [] as string[], moved: [] as Array<{ date: string; at: string }> };
  const date = start.slice(0, 10);
  if (!master.isRecurring()) {
    return { uid, item: { ...base, repeat: { kind: 'weekly', days: [isoDow(date)] }, startsOn: date, endsOn: date } };
  }
  const rule = master.component.getFirstPropertyValue('rrule') as InstanceType<typeof ICAL.Recur> | null;
  const parts = (rule?.parts ?? {}) as Record<string, unknown[] | undefined>;
  const partKeys = Object.keys(parts).filter((k) => (parts[k]?.length ?? 0) > 0);
  const byDay = (parts['BYDAY'] ?? []) as string[];
  const simple = !!rule && (rule.interval ?? 1) === 1 && !rule.count && !master.component.getFirstProperty('rdate')
    && ((rule.freq === 'DAILY' && partKeys.length === 0) || (rule.freq === 'WEEKLY' && partKeys.every((k) => k === 'BYDAY') && byDay.every((d) => /^(MO|TU|WE|TH|FR|SA|SU)$/.test(d))));
  if (!simple || !rule) return { uid, item: null };
  const skips: string[] = [];
  for (const p of master.component.getAllProperties('exdate')) {
    for (const v of p.getValues()) {
      const t = v as ITime;
      skips.push(t.isDate ? `${t.year}-${pad(t.month)}-${pad(t.day)}` : utcToWall(toMs(t, (p.getParameter('tzid') as string | null) ?? tzParam(master.component, 'dtstart'), timeZone), timeZone).slice(0, 10));
    }
  }
  const moved: Array<{ date: string; at: string }> = [];
  for (const ex of exceptions) {
    const rid = ex.recurrenceId;
    if (!rid) continue;
    const ridDate = rid.isDate ? `${rid.year}-${pad(rid.month)}-${pad(rid.day)}` : wallOf(rid, ex, 'dtstart').slice(0, 10);
    const st = text(ex, 'status').toUpperCase();
    if (st === 'CANCELLED' || ex.startDate.isDate) { skips.push(ridDate); continue; }
    const s2 = wallOf(ex.startDate, ex, 'dtstart');
    // Moved within its day: a new time that day. Moved to another day: KRNL0
    // keeps the day free (it has no "moved to another day").
    if (s2.slice(0, 10) === ridDate) moved.push({ date: ridDate, at: s2.slice(11, 16) }); else skips.push(ridDate);
  }
  const until = rule.until ? (rule.until.isDate ? `${rule.until.year}-${pad(rule.until.month)}-${pad(rule.until.day)}` : utcToWall(toMs(rule.until, null, 'UTC'), timeZone).slice(0, 10)) : undefined;
  const repeat: ExportEvent['repeat'] = rule.freq === 'DAILY' ? { kind: 'daily' } : { kind: 'weekly', days: byDay.length ? [...new Set(byDay.map((d) => DAY_CODES.indexOf(d) + 1))].sort() : [isoDow(date)] };
  return { uid, item: { ...base, repeat, startsOn: date, ...(until ? { endsOn: until } : {}), skips: [...new Set(skips)].sort(), moved } };
}

/** One item as its own calendar entry (one VCALENDAR, as CalDAV stores it). */
export function mirrorToIcs(item: ExportEvent & { uid: string }, timeZone: string, nowMs: number = Date.now()): string {
  return toIcs([item], [], timeZone, nowMs);
}
