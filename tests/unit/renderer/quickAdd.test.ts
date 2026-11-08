/** Quick add — plans typed the way people say them. */
import { describe, it, expect } from 'vitest';
import { parseQuickAdd, describeQuickAdd } from '../../../src/shared/quickAdd';

// Sunday 8 Nov 2026, 10:00.
const NOW = new Date(2026, 10, 8, 10, 0);

describe('parseQuickAdd', () => {
  it('a day and a time', () => {
    expect(parseQuickAdd('Call mom tomorrow at 5pm', NOW)).toEqual({ text: 'Call mom', day: '2026-11-09', time: '17:00' });
  });
  it('a 24-hour time and a length, today', () => {
    expect(parseQuickAdd('Gym 18:00 1h', NOW)).toEqual({ text: 'Gym', day: '2026-11-08', time: '18:00', durationMin: 60 });
  });
  it('a weekday without a time is a due day', () => {
    expect(parseQuickAdd('Pay rent friday', NOW)).toEqual({ text: 'Pay rent', day: '2026-11-13' });
  });
  it('a length alone', () => {
    expect(parseQuickAdd('Read 30 min', NOW)).toEqual({ text: 'Read', durationMin: 30 });
    expect(parseQuickAdd('Deep work 1h30', NOW)).toEqual({ text: 'Deep work', durationMin: 90 });
  });
  it('a time that already passed today rolls to tomorrow (and says so)', () => {
    expect(parseQuickAdd('Stretch at 9am', NOW)).toEqual({ text: 'Stretch', day: '2026-11-09', time: '09:00', rolledToTomorrow: true });
  });
  it('"next monday" is the one after this coming Monday', () => {
    expect(parseQuickAdd('Review next monday', NOW).day).toBe('2026-11-16');
    expect(parseQuickAdd('Review monday', NOW).day).toBe('2026-11-09');
  });
  it('plain names are left alone', () => {
    expect(parseQuickAdd('Read chapter 3', NOW)).toEqual({ text: 'Read chapter 3' });
    expect(parseQuickAdd('Buy 2 m cable', NOW)).toEqual({ text: 'Buy 2 m cable' });
    expect(parseQuickAdd('Call 5 friends', NOW)).toEqual({ text: 'Call 5 friends' });
  });
});

describe('describeQuickAdd', () => {
  it('says what Enter will do', () => {
    expect(describeQuickAdd(parseQuickAdd('Call mom tomorrow at 5pm', NOW), NOW)).toBe('tomorrow 17:00');
    expect(describeQuickAdd(parseQuickAdd('Gym 18:00 1h', NOW), NOW)).toBe('today 18:00 · 1 h');
    expect(describeQuickAdd(parseQuickAdd('Pay rent friday', NOW), NOW)).toBe('due Fri 13 Nov');
    expect(describeQuickAdd(parseQuickAdd('Read chapter 3', NOW), NOW)).toBeNull();
  });
});
