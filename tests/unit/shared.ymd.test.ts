/** shared/ymd — the one place local-date helpers live. */
import { describe, it, expect } from 'vitest';
import { addDaysYMD, daysBetweenYMD, isoDowYMD, todayYMD } from '../../src/shared/ymd';

describe('ymd helpers', () => {
  it('adds days across months and DST changes', () => {
    expect(addDaysYMD('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysYMD('2026-03-28', 2)).toBe('2026-03-30'); // spring-forward weekend in Europe
    expect(addDaysYMD('2026-01-01', -1)).toBe('2025-12-31');
  });
  it('ISO weekday and whole days between', () => {
    expect(isoDowYMD('2026-11-08')).toBe(7); // Sunday
    expect(isoDowYMD('2026-11-09')).toBe(1);
    expect(daysBetweenYMD('2026-11-08', '2026-11-13')).toBe(5);
    expect(todayYMD(new Date(2026, 10, 8, 23, 59))).toBe('2026-11-08');
  });
});
