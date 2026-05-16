import { describe, it, expect } from 'vitest';
import {
  byDay,
  byDayOfWeek,
  byHourOfDay,
  byMonth,
  totals,
} from '../bucketBy';
import type { AnalyticsEvent } from '../types';

const evt = (over: Partial<AnalyticsEvent>): AnalyticsEvent => ({
  source: over.source ?? 'task',
  type: over.type ?? 'task.completed',
  date: over.date ?? '2026-05-10',
  ...over,
});

describe('bucketBy', () => {
  describe('byDay', () => {
    it('zero-fills empty days across a range', () => {
      const out = byDay([], { start: '2026-05-10', end: '2026-05-12' });
      expect(out).toHaveLength(3);
      expect(out[0]).toEqual({
        date: '2026-05-10', taskCount: 0, habitCount: 0, focusMin: 0, sessions: 0,
      });
      expect(out[2]?.date).toBe('2026-05-12');
    });

    it('counts task / habit / pomo events per day', () => {
      const events: AnalyticsEvent[] = [
        evt({ type: 'task.completed', date: '2026-05-10' }),
        evt({ type: 'task.completed', date: '2026-05-10' }),
        evt({ type: 'habit.checkin', date: '2026-05-10' }),
        evt({ type: 'pomo.session', date: '2026-05-11', durationMin: 25 }),
        evt({ type: 'pomo.session', date: '2026-05-11', durationMin: 30 }),
      ];
      const out = byDay(events, { start: '2026-05-10', end: '2026-05-11' });
      expect(out[0]).toMatchObject({ taskCount: 2, habitCount: 1, sessions: 0, focusMin: 0 });
      expect(out[1]).toMatchObject({ taskCount: 0, habitCount: 0, sessions: 2, focusMin: 55 });
    });

    it('drops events outside the range', () => {
      const events: AnalyticsEvent[] = [
        evt({ date: '2026-05-09' }),
        evt({ date: '2026-05-13' }),
      ];
      const out = byDay(events, { start: '2026-05-10', end: '2026-05-12' });
      expect(out.every((d) => d.taskCount === 0)).toBe(true);
    });
  });

  describe('totals', () => {
    it('aggregates within range', () => {
      const events: AnalyticsEvent[] = [
        evt({ type: 'task.completed', date: '2026-05-10' }),
        evt({ type: 'habit.checkin', date: '2026-05-11' }),
        evt({ type: 'pomo.session', date: '2026-05-12', durationMin: 25 }),
        evt({ type: 'pomo.session', date: '2026-05-12', durationMin: 25 }),
      ];
      const out = totals(events, { start: '2026-05-10', end: '2026-05-12' });
      expect(out).toEqual({
        tasksDone: 1, habitCheckins: 1, focusMin: 50, sessions: 2,
      });
    });
  });

  describe('byDayOfWeek', () => {
    it('puts Monday at index 0', () => {
      // 2026-05-11 is a Monday.
      const events: AnalyticsEvent[] = [
        evt({ type: 'task.completed', date: '2026-05-11' }),
      ];
      const out = byDayOfWeek(events, { start: '2026-05-10', end: '2026-05-17' });
      expect(out[0]?.dow).toBe(0);
      expect(out[0]?.tasks).toBe(1);
      expect(out[6]?.dow).toBe(6);
    });

    it('counts focus minutes per dow', () => {
      const events: AnalyticsEvent[] = [
        evt({ type: 'pomo.session', date: '2026-05-12', durationMin: 25 }), // Tue
        evt({ type: 'pomo.session', date: '2026-05-12', durationMin: 25 }),
        evt({ type: 'pomo.session', date: '2026-05-15', durationMin: 50 }), // Fri
      ];
      const out = byDayOfWeek(events, { start: '2026-05-11', end: '2026-05-17' });
      expect(out[1]?.focusMin).toBe(50);
      expect(out[4]?.focusMin).toBe(50);
    });
  });

  describe('byHourOfDay', () => {
    it('skips events without isoTimestamp', () => {
      const events: AnalyticsEvent[] = [
        evt({ type: 'task.completed', date: '2026-05-10' }),
      ];
      const out = byHourOfDay(events, { start: '2026-05-10', end: '2026-05-10' });
      expect(out.every((h) => h.tasks === 0)).toBe(true);
    });

    it('bins by local hour from iso timestamp', () => {
      const events: AnalyticsEvent[] = [
        evt({
          type: 'task.completed',
          date: '2026-05-10',
          isoTimestamp: new Date(2026, 4, 10, 9, 30).toISOString(),
        }),
        evt({
          type: 'pomo.session',
          date: '2026-05-10',
          durationMin: 25,
          isoTimestamp: new Date(2026, 4, 10, 14, 0).toISOString(),
        }),
      ];
      const out = byHourOfDay(events, { start: '2026-05-10', end: '2026-05-10' });
      expect(out[9]?.tasks).toBe(1);
      expect(out[14]?.focusMin).toBe(25);
    });
  });

  describe('byMonth', () => {
    it('emits 12 month buckets', () => {
      const events: AnalyticsEvent[] = [
        evt({ type: 'task.completed', date: '2026-01-15' }),
        evt({ type: 'task.completed', date: '2026-12-31' }),
        evt({ type: 'habit.checkin', date: '2026-06-01' }),
        evt({ type: 'pomo.session', date: '2026-06-01', durationMin: 25 }),
      ];
      const out = byMonth(events, 2026);
      expect(out).toHaveLength(12);
      expect(out[0]?.tasks).toBe(1);
      expect(out[5]).toMatchObject({ month: 6, habits: 1, focusMin: 25 });
      expect(out[11]?.tasks).toBe(1);
    });

    it('ignores other years', () => {
      const events: AnalyticsEvent[] = [
        evt({ type: 'task.completed', date: '2025-12-31' }),
      ];
      const out = byMonth(events, 2026);
      expect(out.every((m) => m.tasks === 0)).toBe(true);
    });
  });
});
