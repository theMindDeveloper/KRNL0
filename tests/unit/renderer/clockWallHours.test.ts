import { describe, it, expect } from 'vitest';
import { wallHoursFromDayStart, msAtWallHours } from '../../../src/renderer/components/nodes/ClockNode/wallHours';

describe('Clock wall-clock hours', () => {
  it('reads the local clock time, so DST days stay on the hour marks', () => {
    const at = new Date(2026, 2, 29, 14, 30).getTime(); // a spring-forward day in much of Europe
    expect(wallHoursFromDayStart(at, '2026-03-29')).toBe(14.5);
    expect(msAtWallHours('2026-03-29', 14.5)).toBe(at);
  });
  it('counts the next day as 24+ and the previous as negative', () => {
    expect(wallHoursFromDayStart(new Date(2026, 10, 3, 1, 0).getTime(), '2026-11-02')).toBe(25);
    expect(wallHoursFromDayStart(new Date(2026, 10, 1, 23, 0).getTime(), '2026-11-02')).toBe(-1);
  });
});
