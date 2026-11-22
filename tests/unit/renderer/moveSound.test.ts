/**
 * Decision 63 (F84): one sound for every move. Moving a task, an event or a
 * habit is a plan change; ticking a habit is not.
 */
import { describe, it, expect } from 'vitest';
import { momentFromChange, soundSnapshot } from '../../../src/renderer/sfx/soundMoments';

type H = { id: string; timeOfDay: string; days?: number[]; startsOn?: string; log?: string[] };
const board = (habits: H[]) => ({
  nodes: [{
    id: 'mother-habit', kind: 'habit', isMother: true, position: { x: 0, y: 0 }, config: {},
    state: { habits: habits.map((h) => ({ id: h.id, name: h.id, color: 'acid', log: h.log ?? [], archived: false, ...(h.startsOn ? { startsOn: h.startsOn, endsOn: h.startsOn, kind: 'routine' } : {}), schedule: { kind: h.days ? 'weekly' : 'daily', timeOfDay: h.timeOfDay, durationMin: 30, ...(h.days ? { days: h.days } : {}) } })) },
  }],
}) as never;
const moment = (a: H[], b: H[]) => momentFromChange(soundSnapshot(board(a)), soundSnapshot(board(b)));

describe('one sound for every move (F84)', () => {
  it('a habit moved to another time plays the move sound', () => {
    expect(moment([{ id: 'run', timeOfDay: '07:00' }], [{ id: 'run', timeOfDay: '18:00' }])).toBe('plan');
  });
  it('a repeating event moved to another day plays it', () => {
    expect(moment([{ id: 'lab', timeOfDay: '14:00', days: [2] }], [{ id: 'lab', timeOfDay: '14:00', days: [3] }])).toBe('plan');
  });
  it('a one-time event moved a week on (same weekday and time) plays it', () => {
    expect(moment([{ id: 'dentist', timeOfDay: '10:00', days: [5], startsOn: '2026-05-15' }], [{ id: 'dentist', timeOfDay: '10:00', days: [5], startsOn: '2026-05-22' }])).toBe('plan');
  });
  it('ticking a habit is not a move', () => {
    expect(moment([{ id: 'run', timeOfDay: '07:00' }], [{ id: 'run', timeOfDay: '07:00', log: ['2026-05-15'] }])).not.toBe('plan');
  });
});
