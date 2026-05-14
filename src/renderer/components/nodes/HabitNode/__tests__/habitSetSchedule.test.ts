/**
 * Pure handler tests for habitSetSchedule.
 * ADR 0002 §5 — handler rules.
 */

import { describe, it, expect } from 'vitest';
import { habitSetSchedule } from '../commands';
import type { HabitState } from '../types';

function makeState(): HabitState {
  return {
    habits: [
      {
        id: 'h1',
        name: 'Meditate',
        createdAt: '2026-05-01T00:00:00.000Z',
        log: [],
        archived: false,
        color: 'acid',
      },
      {
        id: 'h2',
        name: 'Run',
        createdAt: '2026-05-01T00:00:00.000Z',
        log: [],
        archived: false,
        color: 'rust',
      },
    ],
  };
}

describe('habitSetSchedule', () => {
  it('sets a daily schedule', () => {
    const state = makeState();
    const next = habitSetSchedule(state, {
      habitId: 'h1',
      schedule: { kind: 'daily', timeOfDay: '08:00' },
    });
    const h = next.habits.find((h) => h.id === 'h1');
    expect(h?.schedule).toEqual({ kind: 'daily', timeOfDay: '08:00' });
  });

  it('sets a weekly schedule and normalises days (dedup + sort)', () => {
    const state = makeState();
    const next = habitSetSchedule(state, {
      habitId: 'h1',
      // Unsorted, with duplicate.
      schedule: { kind: 'weekly', timeOfDay: '07:30', days: [3, 1, 3, 5] },
    });
    const h = next.habits.find((h) => h.id === 'h1');
    expect(h?.schedule).toEqual({ kind: 'weekly', timeOfDay: '07:30', days: [1, 3, 5] });
  });

  it('sets a weekdays schedule', () => {
    const state = makeState();
    const next = habitSetSchedule(state, {
      habitId: 'h1',
      schedule: { kind: 'weekdays', timeOfDay: '09:00' },
    });
    const h = next.habits.find((h) => h.id === 'h1');
    expect(h?.schedule).toEqual({ kind: 'weekdays', timeOfDay: '09:00' });
  });

  it('clears the schedule when null is passed', () => {
    let state = makeState();
    // First set a schedule.
    state = habitSetSchedule(state, {
      habitId: 'h1',
      schedule: { kind: 'daily', timeOfDay: '08:00' },
    });
    // Then clear it.
    const next = habitSetSchedule(state, { habitId: 'h1', schedule: null });
    const h = next.habits.find((h) => h.id === 'h1');
    expect(h?.schedule).toBeUndefined();
    // Ensure the key is not present (board.json cleanliness).
    expect('schedule' in (h ?? {})).toBe(false);
  });

  it('no-op on unknown habitId', () => {
    const state = makeState();
    const next = habitSetSchedule(state, {
      habitId: 'nonexistent',
      schedule: { kind: 'daily', timeOfDay: '08:00' },
    });
    expect(next).toBe(state); // strict reference equality
  });

  it('no-op on invalid timeOfDay', () => {
    const state = makeState();
    const next = habitSetSchedule(state, {
      habitId: 'h1',
      schedule: { kind: 'daily', timeOfDay: '25:00' }, // invalid
    });
    expect(next).toBe(state);
  });

  it('no-op on invalid timeOfDay for weekly', () => {
    const state = makeState();
    const next = habitSetSchedule(state, {
      habitId: 'h1',
      schedule: { kind: 'weekly', timeOfDay: 'abc', days: [1] },
    });
    expect(next).toBe(state);
  });

  it('treats weekly with empty days after dedup as null (unschedule)', () => {
    let state = makeState();
    state = habitSetSchedule(state, {
      habitId: 'h1',
      schedule: { kind: 'daily', timeOfDay: '08:00' },
    });
    // Set weekly with no valid days (empty array).
    const next = habitSetSchedule(state, {
      habitId: 'h1',
      schedule: { kind: 'weekly', timeOfDay: '08:00', days: [] },
    });
    const h = next.habits.find((h) => h.id === 'h1');
    expect(h?.schedule).toBeUndefined();
  });

  it('does not mutate other habits', () => {
    const state = makeState();
    const next = habitSetSchedule(state, {
      habitId: 'h1',
      schedule: { kind: 'daily', timeOfDay: '08:00' },
    });
    const h2 = next.habits.find((h) => h.id === 'h2');
    expect(h2?.schedule).toBeUndefined();
  });

  it('does not mutate the original state object', () => {
    const state = makeState();
    const original = JSON.parse(JSON.stringify(state));
    habitSetSchedule(state, {
      habitId: 'h1',
      schedule: { kind: 'daily', timeOfDay: '08:00' },
    });
    expect(state).toEqual(original);
  });
});
