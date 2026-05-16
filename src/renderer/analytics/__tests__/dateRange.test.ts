import { describe, it, expect } from 'vitest';
import {
  addDays,
  dowOf,
  eachDay,
  hourOfIso,
  inRange,
  isoToYMD,
  lastNDays,
  monthOf,
  parseYMD,
  todayLocal,
  toYMD,
  yearOf,
  yearRange,
} from '../dateRange';

describe('dateRange', () => {
  it('toYMD pads month and day', () => {
    expect(toYMD(new Date(2026, 0, 3))).toBe('2026-01-03');
  });

  it('todayLocal returns a YYYY-MM-DD shape', () => {
    expect(todayLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('addDays handles month boundary forward', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
  });

  it('addDays handles month boundary backward', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('eachDay enumerates every day inclusive', () => {
    expect(eachDay({ start: '2026-05-10', end: '2026-05-12' })).toEqual([
      '2026-05-10',
      '2026-05-11',
      '2026-05-12',
    ]);
  });

  it('dowOf returns Mon=0 .. Sun=6', () => {
    // 2026-05-11 is a Monday.
    expect(dowOf('2026-05-11')).toBe(0);
    expect(dowOf('2026-05-17')).toBe(6);
  });

  it('monthOf returns 1-based month', () => {
    expect(monthOf('2026-01-15')).toBe(1);
    expect(monthOf('2026-12-31')).toBe(12);
  });

  it('lastNDays builds an inclusive window', () => {
    const r = lastNDays(7, '2026-05-16');
    expect(r.start).toBe('2026-05-10');
    expect(r.end).toBe('2026-05-16');
    expect(eachDay(r)).toHaveLength(7);
  });

  it('inRange is inclusive on both ends', () => {
    const r = { start: '2026-05-10', end: '2026-05-12' };
    expect(inRange('2026-05-10', r)).toBe(true);
    expect(inRange('2026-05-12', r)).toBe(true);
    expect(inRange('2026-05-09', r)).toBe(false);
    expect(inRange('2026-05-13', r)).toBe(false);
  });

  it('yearRange spans Jan 1 to Dec 31', () => {
    expect(yearRange(2026)).toEqual({ start: '2026-01-01', end: '2026-12-31' });
  });

  it('isoToYMD respects local timezone', () => {
    const iso = new Date(2026, 4, 10, 23, 45).toISOString();
    expect(isoToYMD(iso)).toBe('2026-05-10');
  });

  it('hourOfIso uses local hour', () => {
    const iso = new Date(2026, 4, 10, 9, 0).toISOString();
    expect(hourOfIso(iso)).toBe(9);
  });

  it('parseYMD/yearOf round-trip', () => {
    expect(yearOf('2026-12-31')).toBe(2026);
    expect(parseYMD('2026-12-31').getFullYear()).toBe(2026);
  });
});
