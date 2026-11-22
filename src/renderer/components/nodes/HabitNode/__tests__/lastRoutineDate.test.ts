/**
 * The last time an event happened (owner, 2026-11-22: "Show" on an ended event
 * lit up today; the card and Show go to its last date instead).
 */
import { describe, it, expect } from 'vitest';
import { lastRoutineDate, type Habit } from '../types';

const ev = (extra: Partial<Habit>): Habit => ({ id: 'e', name: 'E', color: 'acid', kind: 'routine', createdAt: '2026-11-01T00:00:00.000Z', log: [], archived: false, schedule: { kind: 'weekly', days: [1, 3], timeOfDay: '09:00', durationMin: 60 }, ...extra } as Habit);

describe('lastRoutineDate', () => {
  it('an ended weekly event: its last scheduled day on or before the end', () => {
    expect(lastRoutineDate(ev({ startsOn: '2026-11-02', endsOn: '2026-11-27' }), '2026-11-30')).toBe('2026-11-25');
  });
  it('a one-time event in the past: its date', () => {
    expect(lastRoutineDate(ev({ startsOn: '2026-11-23', endsOn: '2026-11-23', schedule: { kind: 'weekly', days: [1], timeOfDay: '15:00', durationMin: 60 } }), '2026-11-30')).toBe('2026-11-23');
  });
  it('a skipped last time does not count', () => {
    expect(lastRoutineDate(ev({ startsOn: '2026-11-02', endsOn: '2026-11-27', exceptions: [{ date: '2026-11-25', skip: true }] }), '2026-11-30')).toBe('2026-11-23');
  });
  it('an event that never happened: none', () => {
    expect(lastRoutineDate(ev({ startsOn: '2026-12-07', endsOn: '2026-12-07' }), '2026-11-30')).toBeNull();
  });
});
