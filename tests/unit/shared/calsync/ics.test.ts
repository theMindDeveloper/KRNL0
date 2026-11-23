/** Decision 64 / calendar-sync F2–F4, F18 — reading another calendar's .ics. */
import { describe, it, expect } from 'vitest';
import { readIcs, wallToUtc, utcToWall, nextEvent, looksLikeIcs } from '../../../../src/shared/calsync/ics';
import {
  allDayOn, linkMeta, linksOf, looksLikeGoogleSharePage, normalizeIcsUrl, partOnDay, providerOf, type CalendarLink,
} from '../../../../src/shared/calsync/types';

const NOW = Date.UTC(2026, 10, 22, 12, 0); // Sun 22 Nov 2026, 13:00 in Berlin

const cal = (...events: string[]) => [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Test//EN', 'X-WR-CALNAME:Work',
  ...events,
  'END:VCALENDAR',
].join('\r\n');

describe('time zones (F18)', () => {
  it('a Berlin wall time maps to UTC on both sides of the daylight-saving change', () => {
    expect(new Date(wallToUtc(2026, 7, 1, 9, 0, 'Europe/Berlin')).toISOString()).toBe('2026-07-01T07:00:00.000Z');
    expect(new Date(wallToUtc(2026, 12, 1, 9, 0, 'Europe/Berlin')).toISOString()).toBe('2026-12-01T08:00:00.000Z');
  });
  it('UTC back to a wall time in another zone', () => {
    expect(utcToWall(Date.UTC(2026, 10, 23, 15, 0), 'America/New_York')).toBe('2026-11-23T10:00');
  });
});

describe('readIcs (F2, F4)', () => {
  it('not a calendar: the page Google shows to share one', () => {
    expect(readIcs('<!doctype html><html>…</html>', 'Europe/Berlin', NOW)).toEqual({ error: 'notCalendar' });
    expect(looksLikeIcs('BEGIN:VCALENDAR\r\nEND:VCALENDAR')).toBe(true);
  });

  it('a one-time event in a named zone, read in the link\'s zone', () => {
    const r = readIcs(cal(
      'BEGIN:VEVENT', 'UID:dentist-1', 'SUMMARY:Dentist', 'LOCATION:Room 2.14',
      'DTSTART;TZID=Europe/Berlin:20261127T150000', 'DTEND;TZID=Europe/Berlin:20261127T160000', 'END:VEVENT',
    ), 'Europe/Berlin', NOW);
    if ('error' in r) throw new Error('read failed');
    expect(r.name).toBe('Work');
    expect(r.count).toBe(1);
    expect(r.events).toEqual([{ id: 'dentist-1@once', title: 'Dentist', start: '2026-11-27T15:00', end: '2026-11-27T16:00', place: 'Room 2.14' }]);
  });

  it('a UTC time moves to the link\'s zone', () => {
    const r = readIcs(cal('BEGIN:VEVENT', 'UID:u1', 'SUMMARY:Call', 'DTSTART:20261123T080000Z', 'DTEND:20261123T083000Z', 'END:VEVENT'), 'Europe/Berlin', NOW);
    if ('error' in r) throw new Error('read failed');
    expect(r.events[0]).toMatchObject({ start: '2026-11-23T09:00', end: '2026-11-23T09:30' });
  });

  it('a weekly repeat with a skipped day and a moved day', () => {
    const r = readIcs(cal(
      'BEGIN:VEVENT', 'UID:standup', 'SUMMARY:Team call',
      'DTSTART;TZID=Europe/Berlin:20261102T090000', 'DTEND;TZID=Europe/Berlin:20261102T093000',
      'RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231T230000Z',
      'EXDATE;TZID=Europe/Berlin:20261116T090000', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:standup', 'SUMMARY:Team call (late)', 'RECURRENCE-ID;TZID=Europe/Berlin:20261123T090000',
      'DTSTART;TZID=Europe/Berlin:20261123T110000', 'DTEND;TZID=Europe/Berlin:20261123T113000', 'END:VEVENT',
    ), 'Europe/Berlin', NOW);
    if ('error' in r) throw new Error('read failed');
    const days = r.events.map((e) => e.start);
    expect(days).toContain('2026-11-09T09:00');
    expect(days).not.toContain('2026-11-16T09:00');
    expect(days).toContain('2026-11-23T11:00');
    expect(r.events.find((e) => e.start === '2026-11-23T11:00')!.title).toBe('Team call (late)');
    expect(days.at(-1)).toBe('2026-12-28T09:00');
    expect(r.count).toBe(1);
  });

  it('a monthly repeat (KRNL0 cannot store it) still shows every time', () => {
    const r = readIcs(cal(
      'BEGIN:VEVENT', 'UID:rent', 'SUMMARY:Rent', 'DTSTART;TZID=Europe/Berlin:20260101T080000', 'DTEND;TZID=Europe/Berlin:20260101T081500',
      'RRULE:FREQ=MONTHLY;BYMONTHDAY=1', 'END:VEVENT',
    ), 'Europe/Berlin', NOW);
    if ('error' in r) throw new Error('read failed');
    expect(r.events.map((e) => e.start)).toContain('2026-12-01T08:00');
    expect(r.events.map((e) => e.start)).toContain('2027-11-01T08:00');
  });

  it('all-day events keep their dates; cancelled ones are left out', () => {
    const r = readIcs(cal(
      'BEGIN:VEVENT', 'UID:conf', 'SUMMARY:Product Days', 'DTSTART;VALUE=DATE:20261126', 'DTEND;VALUE=DATE:20261128', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:gone', 'SUMMARY:Cancelled thing', 'STATUS:CANCELLED', 'DTSTART:20261124T100000Z', 'DTEND:20261124T110000Z', 'END:VEVENT',
    ), 'Europe/Berlin', NOW);
    if ('error' in r) throw new Error('read failed');
    expect(r.events).toEqual([{ id: 'conf@once', title: 'Product Days', start: '2026-11-26', end: '2026-11-28', allDay: true }]);
    const conf = r.events[0]!;
    expect(allDayOn(conf, '2026-11-26')).toBe(true);
    expect(allDayOn(conf, '2026-11-27')).toBe(true);
    expect(allDayOn(conf, '2026-11-28')).toBe(false);
  });

  it('only a year back and a year ahead (F4)', () => {
    const r = readIcs(cal(
      'BEGIN:VEVENT', 'UID:old', 'SUMMARY:Long ago', 'DTSTART:20200101T100000Z', 'DTEND:20200101T110000Z', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:far', 'SUMMARY:Far away', 'DTSTART:20300101T100000Z', 'DTEND:20300101T110000Z', 'END:VEVENT',
    ), 'Europe/Berlin', NOW);
    if ('error' in r) throw new Error('read failed');
    expect(r.events).toEqual([]);
  });

  it('nextEvent finds the first one still to come', () => {
    const evs = [
      { id: 'a', title: 'A', start: '2026-11-20T09:00', end: '2026-11-20T10:00' },
      { id: 'b', title: 'B', start: '2026-11-23T09:00', end: '2026-11-23T10:00' },
    ];
    expect(nextEvent(evs, '2026-11-22T13:00')?.id).toBe('b');
  });
});

describe('days and links', () => {
  it('an event over midnight shows on both days', () => {
    const ev = { id: 'n', title: 'Night shift', start: '2026-11-23T22:00', end: '2026-11-24T06:00' };
    expect(partOnDay(ev, '2026-11-23')).toMatchObject({ startMin: 1320, endMin: 1440 });
    expect(partOnDay(ev, '2026-11-24')).toMatchObject({ startMin: 0, endMin: 360 });
    expect(partOnDay(ev, '2026-11-25')).toBeNull();
    // Ending at midnight: not on the next day.
    expect(partOnDay({ id: 'm', title: 'M', start: '2026-11-23T23:00', end: '2026-11-24T00:00' }, '2026-11-24')).toBeNull();
  });

  it('addresses: webcal becomes https; where it comes from', () => {
    expect(normalizeIcsUrl(' webcal://p42-caldav.icloud.com/published/2/abc ')).toBe('https://p42-caldav.icloud.com/published/2/abc');
    expect(normalizeIcsUrl('not a link')).toBeNull();
    expect(normalizeIcsUrl('file:///etc/passwd')).toBeNull();
    expect(providerOf('https://calendar.google.com/calendar/ical/x/private-y/basic.ics')).toBe('google');
    expect(providerOf('https://p42-caldav.icloud.com/published/2/abc')).toBe('icloud');
    expect(providerOf('https://example.org/cal.ics')).toBe('link');
    expect(looksLikeGoogleSharePage('https://calendar.google.com/calendar/embed?src=x')).toBe(true);
    expect(looksLikeGoogleSharePage('https://calendar.google.com/calendar/ical/x/private-y/basic.ics')).toBe(false);
  });

  it('linksOf reads a board defensively and the meta line says where it stands', () => {
    const links = linksOf({ calendarLinks: [{ id: 'cal-1', name: 'Work', color: 'nope', provider: 'google', timeZone: 'UTC', device: 'd', events: [{ id: 'x' }] }, 'junk'] });
    expect(links).toHaveLength(1);
    expect(links[0]!.color).toBe('lilac');
    expect(links[0]!.on).toBe(true);
    expect(links[0]!.events).toEqual([]);
    const l: CalendarLink = { ...links[0]!, okAt: new Date(NOW - 2 * 60_000).toISOString() };
    expect(linkMeta(l, NOW, true)).toBe('Google · checked 2 min ago');
    expect(linkMeta({ ...l, on: false }, NOW, true)).toBe('Google · hidden');
    expect(linkMeta({ ...l, state: 'unreachable' }, NOW, true)).toBe('Google · this link no longer answers');
    expect(linkMeta({ ...l, deviceName: 'Laptop' }, NOW, false)).toBe('Google · checked on Laptop');
  });
});
