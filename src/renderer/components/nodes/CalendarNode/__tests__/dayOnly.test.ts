import { describe, it, expect } from 'vitest';
import { dayOnlyPlans } from '../dayOnly';

const WEEK = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'];
const nodes = [
  { id: 'todo', kind: 'todo', isMother: true, state: { items: [
    { id: 'a', text: 'Pay rent', done: false, onDay: '2026-11-13', taskNodeId: 't-a' },
    { id: 'b', text: 'Essay', done: false, dueOn: '2026-11-13', taskNodeId: 't-b' },
    { id: 'c', text: 'Done', done: true, onDay: '2026-11-13', taskNodeId: null },
    { id: 'd', text: 'Dropped', done: false, onDay: '2026-11-13', droppedAt: '2026-11-08T10:00:00Z', taskNodeId: null },
    { id: 'e', text: 'Other week', done: false, onDay: '2026-11-20', taskNodeId: null },
    { id: 'f', text: 'Late', done: false, onDay: '2026-11-09', taskNodeId: null },
  ] } },
  { id: 't-a', kind: 'todo.task', state: { plannedMin: 45 } },
];

describe('dayOnlyPlans (Decision 40: the ANY TIME strip)', () => {
  it('a plan whose When is a day at any time is a plan chip; a deadline is a deadline mark, first', () => {
    const m = dayOnlyPlans(nodes, WEEK, new Map([['t-b', '2026-11-10']]), '2026-11-10');
    expect(m.get('2026-11-13')?.map((d) => [d.kind, d.id, d.plannedOn])).toEqual([['deadline', 'b', '2026-11-10'], ['plan', 'a', undefined]]);
    expect(m.get('2026-11-13')?.find((d) => d.id === 'a')?.plannedMin).toBe(45);
    expect(m.get('2026-11-09')?.[0]).toMatchObject({ id: 'f', overdue: true, kind: 'plan' });
    expect([...m.keys()].sort()).toEqual(['2026-11-09', '2026-11-13']);
  });
  it('a plan planned (with a time) on its own deadline day shows only its block', () => {
    const m = dayOnlyPlans(nodes, WEEK, new Map([['t-b', '2026-11-13']]), '2026-11-10');
    expect(m.get('2026-11-13')?.map((d) => d.id)).toEqual(['a']);
  });
  it('a plan with a time is never a plan chip, even with an old any-time day', () => {
    const n2 = [{ ...nodes[0]!, state: { items: [{ id: 'x', text: 'X', done: false, onDay: '2026-11-12', taskNodeId: 't-x' }] } }];
    expect(dayOnlyPlans(n2, WEEK, new Map([['t-x', '2026-11-12']]), '2026-11-10').size).toBe(0);
  });
});
