/** New-user review 4.3 — the Clock lists what is due that day; today also what is overdue. */
import { describe, it, expect } from 'vitest';
import { dueOnDay } from '../../../src/shared/dueOn';
import { computeCatchup, isEmptyCatchup } from '../../../src/renderer/launch/catchup';

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

describe('Welcome back lists what is due', () => {
  it('overdue opens it; merely due today rides along but does not open it', () => {
    const over = computeCatchup({ nodes: todo([{ id: 'a', text: 'Tax form', done: false, dueOn: '2026-11-06' }]), edges: [] } as never, TODAY);
    expect(over.due?.map((d) => d.text)).toEqual(['Tax form']);
    expect(isEmptyCatchup(over)).toBe(false);
    const today = computeCatchup({ nodes: todo([{ id: 'b', text: 'Pay rent', done: false, dueOn: TODAY }]), edges: [] } as never, TODAY);
    expect(today.due?.length).toBe(1);
    expect(isEmptyCatchup(today)).toBe(true);
  });
});

describe('Welcome back and old repeating plans', () => {
  const task = (id: string, text: string, at: string) => ({ id, kind: 'todo.task', state: { text, done: false, scheduledFor: at } });
  it('a missed plan from an old board that still carries a repeat is a plain missed plan', () => {
    const r = computeCatchup({ nodes: [...todo([{ id: 'i1', text: 'Water plants', done: false, taskNodeId: 't1', repeat: { kind: 'daily' } }]), task('t1', 'Water plants', '2026-11-07T08:00')], edges: [] } as never, TODAY);
    expect(r.tasks.map((t) => t.text)).toEqual(['Water plants']);
  });
});
