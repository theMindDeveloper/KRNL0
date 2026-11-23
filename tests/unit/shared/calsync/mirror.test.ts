/** Decision 64 P2/P4 / calendar-sync F9–F12 — two-way sync rules, and one calendar entry in and out. */
import { describe, it, expect } from 'vitest';
import { canon, hashItem, reconcile, type LocalItem, type MapEntry, type MirrorItem, type RemoteItem } from '../../../../src/shared/calsync/mirror';
import { icsToMirror, mirrorToIcs } from '../../../../src/shared/calsync/krnlIcs';

const TZ = 'Europe/Berlin';
const dentist: MirrorItem = { id: 'h1', uid: 'h1@krnl0', name: 'Dentist', repeat: { kind: 'weekly', days: [5] }, at: '15:00', lengthMin: 60, startsOn: '2026-11-27', endsOn: '2026-11-27', skips: [], moved: [] };
const klass: MirrorItem = { id: 'h2', uid: 'h2@krnl0', name: 'Linear algebra', place: 'WH C 442', repeat: { kind: 'weekly', days: [1, 3] }, at: '10:00', lengthMin: 90, startsOn: '2026-11-02', skips: ['2026-11-25'], moved: [{ date: '2026-11-30', at: '12:00' }] };

const L = (item: MirrorItem, kind: 'event' | 'task' = 'event'): LocalItem => ({ key: `${kind === 'task' ? 't' : 'e'}:${item.id}`, kind, refId: item.id, item });
const R = (item: MirrorItem | null, uid = item?.uid ?? 'x', readOnly = []): RemoteItem => ({ uid, ref: `https://cal/${uid}.ics`, etag: '"1"', item, readOnly });
const M = (item: MirrorItem, l = item, r = item): MapEntry => ({ id: item.uid, key: `e:${item.id}`, ref: `https://cal/${item.uid}.ics`, l: hashItem(l), r: hashItem(r) });

describe('canonical form', () => {
  it('the same event written two ways reads the same', () => {
    const weekdays: MirrorItem = { ...klass, repeat: { kind: 'weekdays' }, skips: [], moved: [] };
    const monFri: MirrorItem = { ...weekdays, repeat: { kind: 'weekly', days: [5, 4, 3, 2, 1] } };
    expect(canon(weekdays)).toBe(canon(monFri));
    // Starts on a Sunday, repeats on Mondays: the first day it happens is the Monday.
    expect(canon({ ...klass, startsOn: '2026-11-01' })).toBe(canon({ ...klass, startsOn: '2026-11-02' }));
    // A move to the same time is no move; a skipped day outside the repeat is no skip.
    expect(canon({ ...klass, moved: [...klass.moved, { date: '2026-11-23', at: '10:00' }], skips: [...klass.skips, '2026-11-26'] })).toBe(canon(klass));
  });
});

describe('reconcile (F9–F12)', () => {
  it('new on the board goes out; new in the calendar comes in as an event', () => {
    const phone: MirrorItem = { ...klass, id: 'p1', uid: 'phone-event-1' };
    const p = reconcile([L(dentist)], [R(phone)], []);
    expect(p.remote).toEqual([{ op: 'put', uid: 'h1@krnl0', item: dentist }]);
    expect(p.local).toEqual([{ op: 'addEvent', uid: 'phone-event-1', item: phone }]);
    expect(p.map.map((m) => m.id).sort()).toEqual(['h1@krnl0', 'phone-event-1']);
  });

  it('a KRNL0-made entry matched with nothing (left over from an earlier link) is removed, never brought back as an event', () => {
    const oldTask: MirrorItem = { ...dentist, id: 't-old', uid: 't-old@krnl0', name: 'Old task' };
    const p = reconcile([], [R(oldTask)], []);
    expect(p.local).toEqual([]);
    expect(p.remote).toEqual([{ op: 'remove', uid: 't-old@krnl0', ref: 'https://cal/t-old@krnl0.ics', etag: '"1"' }]);
  });

  it('spaces and too-short lengths read the same on both sides (no bounce)', () => {
    expect(canon({ ...dentist, name: 'Dentist  appointment ' })).toBe(canon({ ...dentist, name: 'Dentist appointment' }));
    expect(canon({ ...dentist, lengthMin: 3 })).toBe(canon({ ...dentist, lengthMin: 5 }));
  });

  it('the same on both sides: matched, nothing to do', () => {
    const p = reconcile([L(klass)], [R(klass)], []);
    expect(p.remote).toEqual([]);
    expect(p.local).toEqual([]);
    expect(p.map).toHaveLength(1);
  });

  it('changed here → sent; changed there → taken; changed on both → the calendar wins', () => {
    const moved = { ...dentist, at: '16:00' };
    expect(reconcile([L(moved)], [R(dentist)], [M(dentist)]).remote).toEqual([{ op: 'put', uid: 'h1@krnl0', item: moved, ref: 'https://cal/h1@krnl0.ics', etag: '"1"' }]);
    expect(reconcile([L(dentist)], [R(moved)], [M(dentist)]).local).toEqual([{ op: 'updateEvent', habitId: 'h1', item: moved }]);
    const both = reconcile([L({ ...dentist, at: '09:00' })], [R(moved)], [M(dentist)]);
    expect(both.local).toEqual([{ op: 'updateEvent', habitId: 'h1', item: moved }]);
    expect(both.remote).toEqual([]);
  });

  it('deleted in the calendar: an event goes, a task loses its time, a changed one comes back (an edit beats a delete)', () => {
    expect(reconcile([L(dentist)], [], [M(dentist)]).local).toEqual([{ op: 'deleteEvent', habitId: 'h1' }]);
    const task = { ...dentist, id: 't1', uid: 't1@krnl0', name: 'Write report' };
    expect(reconcile([L(task, 'task')], [], [{ ...M(task), key: 't:t1' }]).local).toEqual([{ op: 'unscheduleTask', taskId: 't1' }]);
    const changed = { ...dentist, name: 'Dentist (Dr. Lee)' };
    expect(reconcile([L(changed)], [], [M(dentist)]).remote).toEqual([{ op: 'put', uid: 'h1@krnl0', item: changed }]);
  });

  it('deleted on the board: removed there, unless it was changed there', () => {
    expect(reconcile([], [R(dentist)], [M(dentist)]).remote).toEqual([{ op: 'remove', uid: 'h1@krnl0', ref: 'https://cal/h1@krnl0.ics', etag: '"1"' }]);
    const changed = { ...dentist, at: '17:00' };
    expect(reconcile([], [R(changed)], [M(dentist)]).local).toEqual([{ op: 'addEvent', uid: 'h1@krnl0', item: changed }]);
    // Read-only entries come out in time order (the Calendar reads them in order).
    const ro = (start: string) => ({ id: start, title: 'x', start, end: start });
    const p = reconcile([], [{ uid: 'a', ref: 'a', item: null, readOnly: [ro('2026-12-01T09:00')] }, { uid: 'b', ref: 'b', item: null, readOnly: [ro('2026-11-01T09:00')] }], []);
    expect(p.readOnly.map((e) => e.start)).toEqual(['2026-11-01T09:00', '2026-12-01T09:00']);
  });

  it('a repeat KRNL0 cannot hold stays read-only (F11)', () => {
    const shown = [{ id: 'rent@1', title: 'Rent', start: '2026-12-01T08:00', end: '2026-12-01T08:15' }];
    const p = reconcile([], [{ uid: 'rent', ref: 'r', item: null, readOnly: shown }], []);
    expect(p.readOnly).toEqual(shown);
    expect(p.local).toEqual([]);
    expect(p.remote).toEqual([]);
  });
});

describe('one calendar entry in and out', () => {
  it('a repeating event with a skipped and a moved day survives the trip', () => {
    const back = icsToMirror(mirrorToIcs(klass, TZ), TZ);
    expect(back?.uid).toBe('h2@krnl0');
    expect(canon(back!.item!)).toBe(canon(klass));
  });
  it('a one-time event too', () => {
    const back = icsToMirror(mirrorToIcs(dentist, TZ), TZ);
    expect(canon(back!.item!)).toBe(canon(dentist));
  });
  it('a monthly repeat or an all-day event is not a KRNL0 item', () => {
    const monthly = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:rent', 'SUMMARY:Rent', 'DTSTART:20261201T070000Z', 'DTEND:20261201T071500Z', 'RRULE:FREQ=MONTHLY', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    expect(icsToMirror(monthly, TZ)).toEqual({ uid: 'rent', item: null });
    const allDay = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:bd', 'SUMMARY:Birthday', 'DTSTART;VALUE=DATE:20261128', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    expect(icsToMirror(allDay, TZ)).toEqual({ uid: 'bd', item: null });
  });
});
