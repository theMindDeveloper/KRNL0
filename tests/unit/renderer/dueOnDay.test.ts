/** New-user review 4.3 — the Clock lists what is due that day; today also what is overdue. */
import { describe, it, expect } from 'vitest';
import { dueOnDay } from '../../../src/shared/dueOn';

const todo = (items: unknown[]) => [{ kind: 'todo', isMother: true, state: { items } }];
const TODAY = '2026-11-08';

describe('dueOnDay', () => {
  const nodes = todo([
    { id: 'a', text: 'Tax form', done: false, dueOn: '2026-11-06' },
    { id: 'b', text: 'Pay rent', done: false, dueOn: TODAY },
    { id: 'c', text: 'Done already', done: true, dueOn: TODAY },
    { id: 'd', text: 'Dropped', done: false, droppedAt: '2026-11-07T09:00:00Z', dueOn: TODAY },
    { id: 'e', text: 'Next week', done: false, dueOn: '2026-11-13' },
    { id: 'f', text: 'No due', done: false },
  ]);

  it('today: overdue first, then due today; never done or dropped', () => {
    expect(dueOnDay(nodes, TODAY, TODAY).map((d) => [d.text, d.overdue])).toEqual([['Tax form', true], ['Pay rent', false]]);
  });
  it('another day: only what is due that day (overdue belongs to today)', () => {
    expect(dueOnDay(nodes, '2026-11-13', TODAY).map((d) => d.text)).toEqual(['Next week']);
    expect(dueOnDay(nodes, '2026-11-06', TODAY).map((d) => d.text)).toEqual(['Tax form']);
  });
  it('no todo node, no items', () => {
    expect(dueOnDay([], TODAY, TODAY)).toEqual([]);
  });
});
