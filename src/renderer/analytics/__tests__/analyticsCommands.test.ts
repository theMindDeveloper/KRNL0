import { describe, it, expect } from 'vitest';
import {
  analyticsSetMetric,
  analyticsSetRangeDays,
  analyticsSetSize,
  analyticsSetView,
  analyticsSetYear,
} from '../../components/nodes/AnalyticsNode/commands';
import { defaultAnalyticsState } from '../../components/nodes/AnalyticsNode/types';

describe('AnalyticsNode commands', () => {
  const base = defaultAnalyticsState();

  it('setView accepts valid views, rejects invalid', () => {
    expect(analyticsSetView(base, { view: 'calendar' }).view).toBe('calendar');
    // @ts-expect-error — intentional invalid view
    expect(analyticsSetView(base, { view: 'nope' })).toBe(base);
  });

  it('setView no-ops when unchanged', () => {
    expect(analyticsSetView(base, { view: base.view })).toBe(base);
  });

  it('setRangeDays clamps to [1,365]', () => {
    expect(analyticsSetRangeDays(base, { days: 0 }).rangeDays).toBe(1);
    expect(analyticsSetRangeDays(base, { days: 9999 }).rangeDays).toBe(365);
    expect(analyticsSetRangeDays(base, { days: 7 }).rangeDays).toBe(7);
  });

  it('setRangeDays rejects non-finite', () => {
    expect(analyticsSetRangeDays(base, { days: NaN })).toBe(base);
  });

  it('setMetric updates metric', () => {
    expect(analyticsSetMetric(base, { metric: 'focusMin' }).metric).toBe('focusMin');
  });

  it('setYear rounds + stores', () => {
    expect(analyticsSetYear(base, { year: 2026.7 }).year).toBe(2027);
  });

  it('setSize is a no-op (node is fixed-size 540×540, rev 3)', () => {
    const next = analyticsSetSize(base, { width: 200.4, height: 100.6 });
    expect(next).toBe(base);
  });
});
