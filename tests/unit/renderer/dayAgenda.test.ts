/**
 * Decision 56 — Your day on the phone (phone-web.md F1): today's timed plans,
 * repeating events and habits in order, and the one going on now or next.
 */
import { describe, it, expect } from 'vitest';
import { dayAgenda, dayLine, inWords } from '../../../src/renderer/components/Mobile/dayAgenda';
import type { Board } from '../../../src/shared/types';

const DAY = '2026-11-21'; // a Saturday
function board(): Board {
  return {
    version: 1, schemaVersion: 2, savedAt: '', layoutMode: 'station', viewport: { x: 0, y: 0, zoom: 1 }, edges: [],
    nodes: [
      { id: 'mother-todo', kind: 'todo', isMother: true, position: { x: 0, y: 0 }, config: {},
        state: { items: [
          { id: 'i1', text: 'KAS Seminar', done: false, createdAt: '', completedAt: null, taskNodeId: 't1' },
          { id: 'i2', text: 'Call mum', done: false, createdAt: '', completedAt: null, taskNodeId: null, scheduledFor: `${DAY}T18:00` },
          { id: 'i3', text: 'Someday', done: false, createdAt: '', completedAt: null, taskNodeId: null },
        ] } },
      { id: 't1', kind: 'todo.task', position: { x: 0, y: 0 }, config: {}, state: { text: 'KAS Seminar', done: false, scheduledFor: `${DAY}T11:00`, scheduledDurationMin: 30, plannedMin: 30 } },
      { id: 't2', kind: 'todo.task', position: { x: 0, y: 0 }, config: {}, state: { text: 'Yesterday plan', done: false, scheduledFor: '2026-11-20T11:00', plannedMin: 30 } },
      { id: 'mother-habit', kind: 'habit', isMother: true, position: { x: 0, y: 0 }, config: {},
        state: { habits: [
          { id: 'lab', name: 'Lab session – WH C 512', kind: 'routine', createdAt: '2026-10-01T08:00:00.000Z', log: [], archived: false, color: 'teal', schedule: { kind: 'weekly', days: [6], timeOfDay: '13:00', durationMin: 120 } },
          { id: 'run', name: 'Morning run', createdAt: '2026-10-01T08:00:00.000Z', log: [DAY], archived: false, color: 'amber', schedule: { kind: 'daily', timeOfDay: '07:30', durationMin: 30 } },
          { id: 'any', name: 'Read', createdAt: '2026-10-01T08:00:00.000Z', log: [], archived: false, color: 'acid', schedule: { kind: 'daily' } },
        ] } },
    ],
  } as unknown as Board;
}

describe('dayAgenda', () => {
  it('lists today in time order: the habit, the plan, the class, the plan with no card yet', () => {
    const a = dayAgenda(board(), DAY, 10 * 60);
    expect(a.items.map((i) => i.title)).toEqual(['Morning run', 'KAS Seminar', 'Lab session', 'Call mum']);
    expect(a.items.find((i) => i.kind === 'event')).toMatchObject({ place: 'WH C 512', startMin: 13 * 60, endMin: 15 * 60 });
    expect(a.items[0]!.done).toBe(true);
  });

  it('opens out the next one, or the one going on now; never a done one', () => {
    expect(dayAgenda(board(), DAY, 10 * 60).focus).toMatchObject({ state: 'next', item: { title: 'KAS Seminar' } });
    expect(dayAgenda(board(), DAY, 13 * 60 + 30).focus).toMatchObject({ state: 'now', item: { title: 'Lab session' } });
    expect(dayAgenda(board(), DAY, 7 * 60 + 40).focus?.item.title).toBe('KAS Seminar');
    expect(dayAgenda(board(), DAY, 23 * 60).focus).toBeNull();
  });

  it('counts plans set for today, a plan on a card included (it used to say "none set for today")', () => {
    const a = dayAgenda(board(), DAY, 10 * 60);
    expect([a.plansToday, a.plansDone]).toEqual([2, 0]);
    expect(dayLine(a)).toBe('0 of 2 plans done · 1 event');
  });

  it('says how long until, in words', () => {
    expect(inWords(25)).toBe('in 25 min');
    expect(inWords(130)).toBe('in 2 h 10 min');
    expect(inWords(120)).toBe('in 2 h');
  });
});
