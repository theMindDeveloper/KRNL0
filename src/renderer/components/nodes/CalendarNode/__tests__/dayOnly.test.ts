import { describe, it, expect } from 'vitest';
import { dayOnlyPlans } from '../dayOnly';

const WEEK = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'];
const nodes = [
  { id: 'todo', kind: 'todo', isMother: true, state: { items: [
    { id: 'a', text: 'Pay rent', done: false, dueOn: '2026-11-13', taskNodeId: 't-a' },
    { id: 'b', text: 'On the grid', done: false, dueOn: '2026-11-13', taskNodeId: 't-b' },
    { id: 'c', text: 'Done', done: true, dueOn: '2026-11-13', taskNodeId: null },
    { id: 'd', text: 'Dropped', done: false, dueOn: '2026-11-13', droppedAt: '2026-11-08T10:00:00Z', taskNodeId: null },
    { id: 'e', text: 'Other week', done: false, dueOn: '2026-11-20', taskNodeId: null },
    { id: 'f', text: 'Late', done: false, dueOn: '2026-11-09', taskNodeId: null },
  ] } },
  { id: 't-a', kind: 'todo.task', state: { plannedMin: 45 } },
];

describe('dayOnlyPlans (a day, no time yet)', () => {
  it('open items due this week that are not on the grid', () => {
    const m = dayOnlyPlans(nodes, WEEK, new Set(['t-b']), '2026-11-10');
    expect(m.get('2026-11-13')).toEqual([{ id: 'a', text: 'Pay rent', taskId: 't-a', plannedMin: 45, overdue: false }]);
    expect(m.get('2026-11-09')?.[0]?.overdue).toBe(true);
    expect([...m.keys()].sort()).toEqual(['2026-11-09', '2026-11-13']);
  });
});
