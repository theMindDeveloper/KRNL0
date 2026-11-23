/** Decision 64 / calendar-sync F5 — export the board's events, import a file's. */
import { describe, it, expect } from 'vitest';
import { planIcsImport, toIcs, importSummary, type ExportEvent } from '../../../../src/shared/calsync/krnlIcs';
import { readIcs } from '../../../../src/shared/calsync/ics';
import { applyImport } from '../../../../src/sys/commands/calLinks';
import { isOneTimeEvent, routineOccurrence, type HabitState } from '../../../../src/renderer/components/nodes/HabitNode/types';

const NOW = Date.UTC(2026, 10, 22, 12, 0);
const TZ = 'Europe/Berlin';

const classEvent: ExportEvent = {
  id: 'h-class', name: 'Linear algebra', place: 'WH C 442', repeat: { kind: 'weekly', days: [1, 3] }, at: '10:00', lengthMin: 90,
  startsOn: '2026-11-02', skips: ['2026-11-25'], moved: [{ date: '2026-11-30', at: '12:00' }],
};
const dentist: ExportEvent = { id: 'h-dentist', name: 'Dentist', repeat: { kind: 'weekly', days: [5] }, at: '15:00', lengthMin: 60, startsOn: '2026-11-27', endsOn: '2026-11-27', skips: [], moved: [] };

describe('toIcs', () => {
  const text = toIcs([classEvent, dentist], [{ id: 't-report', title: 'Write report', start: '2026-11-24T14:00', end: '2026-11-24T15:30' }], TZ, NOW);

  it('writes a valid calendar with a repeat, its skipped and moved days, a one-time event and a planned task', () => {
    expect(text).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,WE');
    expect(text).toContain('EXDATE;TZID=Europe/Berlin:20261125T100000');
    expect(text).toContain('RECURRENCE-ID;TZID=Europe/Berlin:20261130T100000');
    expect(text).toContain('LOCATION:WH C 442');
    expect(text.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });

  it('reads back the same times', () => {
    const r = readIcs(text, TZ, NOW);
    if ('error' in r) throw new Error('not a calendar');
    const starts = r.events.map((e) => `${e.title}@${e.start}`);
    expect(starts).toContain('Linear algebra@2026-11-23T10:00');
    expect(starts).not.toContain('Linear algebra@2026-11-25T10:00');
    expect(starts).toContain('Linear algebra@2026-11-30T12:00');
    expect(starts).toContain('Dentist@2026-11-27T15:00');
    expect(starts).toContain('Write report@2026-11-24T14:00');
  });
});

describe('planIcsImport + applyImport', () => {
  const file = [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'BEGIN:VEVENT', 'UID:exam', 'SUMMARY:Exam', 'LOCATION:Hall 1', 'DTSTART;TZID=Europe/Berlin:20261203T090000', 'DTEND;TZID=Europe/Berlin:20261203T110000', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:choir', 'SUMMARY:Choir', 'DTSTART;TZID=Europe/Berlin:20261104T190000', 'DTEND;TZID=Europe/Berlin:20261104T203000', 'RRULE:FREQ=WEEKLY;BYDAY=WE;UNTIL=20270201T000000Z', 'EXDATE;TZID=Europe/Berlin:20261125T190000', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:rent', 'SUMMARY:Rent', 'DTSTART;TZID=Europe/Berlin:20260101T080000', 'DTEND;TZID=Europe/Berlin:20260101T081500', 'RRULE:FREQ=MONTHLY;BYMONTHDAY=1', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:bday', 'SUMMARY:Birthday', 'DTSTART;VALUE=DATE:20261128', 'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  it('sorts a file into one-time, repeating, day-by-day and left-out events', () => {
    const plan = planIcsImport(file, TZ, new Set(), NOW);
    if ('error' in plan) throw new Error('not a calendar');
    expect(plan.repeating).toBe(1);
    expect(plan.once).toBe(1);
    expect(plan.expanded).toBe(12); // 1 Dec 2026 … 1 Nov 2027
    expect(plan.allDay).toBe(1);
    const choir = plan.items.find((i) => i.uid === 'choir');
    expect(choir).toMatchObject({ kind: 'repeat', schedule: { kind: 'weekly', days: [3] }, at: '19:00', lengthMin: 90, startsOn: '2026-11-04', endsOn: '2027-02-01', skips: ['2026-11-25'] });
    expect(importSummary(plan)).toContain('1 repeating');
  });

  it('adds them as events (never tasks), and a second import adds nothing', () => {
    const plan = planIcsImport(file, TZ, new Set(), NOW);
    if ('error' in plan) throw new Error('not a calendar');
    const state = applyImport({ habits: [] } as unknown as HabitState, plan);
    const exam = state.habits.find((h) => h.icsUid === 'exam')!;
    expect(exam.kind).toBe('routine');
    expect(isOneTimeEvent(exam)).toBe(true);
    expect(exam.startsOn).toBe('2026-12-03');
    expect(exam.place).toBe('Hall 1');
    expect(exam.note).toBeUndefined();
    const choir = state.habits.find((h) => h.icsUid === 'choir')!;
    expect(routineOccurrence(choir, '2026-11-18')).not.toBeNull();
    expect(routineOccurrence(choir, '2026-11-25')?.skipped).toBe(true);
    expect(routineOccurrence(choir, '2026-10-28')).toBeNull();

    const again = planIcsImport(file, TZ, new Set(state.habits.map((h) => h.icsUid!).filter(Boolean)), NOW);
    if ('error' in again) throw new Error('not a calendar');
    expect(again.items).toHaveLength(0);
    expect(again.existing).toBeGreaterThanOrEqual(14);
  });

  it('refuses a file that is not a calendar', () => {
    expect(planIcsImport('hello', TZ, new Set(), NOW)).toEqual({ error: 'notCalendar' });
  });
});
