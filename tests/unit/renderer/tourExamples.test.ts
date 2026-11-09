/** Tours on an empty board bring examples, and always take them away (tourExamples.ts). */
import { describe, it, expect } from 'vitest';
import type { Board } from '../../../src/shared/types';
import { missingExamples, withoutExamples } from '../../../src/renderer/store/tourExamples';
import { TOURS } from '../../../src/renderer/components/Tour/tours';

const NOW = new Date(2026, 10, 9, 14, 30);
const board = (over: Partial<Record<'items' | 'habits' | 'history', unknown[]>> = {}, extra: unknown[] = []): Board => ({
  nodes: [
    { id: 'todo', kind: 'todo', isMother: true, state: { items: over.items ?? [] } },
    { id: 'habit', kind: 'habit', isMother: true, state: { habits: over.habits ?? [] } },
    { id: 'pomo', kind: 'pomo', isMother: true, state: { history: over.history ?? [] } },
    ...extra,
  ],
  edges: [],
} as unknown as Board);

describe('What a new board is missing', () => {
  it('an empty board misses everything a tour shows', () => {
    expect(missingExamples(board(), ['plan', 'recorded', 'habit', 'event'], NOW)).toEqual(['plan', 'recorded', 'habit', 'event']);
  });
  it('a board with a plan today, time today, a habit and an event gets no examples', () => {
    const b = board(
      { habits: [{ id: 'h', name: 'Read' }, { id: 'r', name: 'Class', kind: 'routine' }], history: [{ id: 's', startedAt: '2026-11-09T09:00:00', endedAt: '2026-11-09T10:00:00' }] },
      [{ id: 't', kind: 'todo.task', state: { scheduledFor: '2026-11-09T16:00' } }],
    );
    expect(missingExamples(b, ['plan', 'recorded', 'habit', 'event'], NOW)).toEqual([]);
  });
  it('time recorded yesterday does not count for today', () => {
    const b = board({ history: [{ id: 's', startedAt: '2026-11-08T09:00:00', endedAt: '2026-11-08T10:00:00' }] });
    expect(missingExamples(b, ['recorded'], NOW)).toEqual(['recorded']);
  });
});

describe('Examples always go', () => {
  it('the plan, its card, the recorded time, the habits and their board cards are taken out; the rest stays', () => {
    const b = board(
      {
        items: [{ id: 'ex-item', text: 'Example: Read chapter 3', taskNodeId: 'ex-task' }, { id: 'mine', text: 'Essay', taskNodeId: 'my-task' }],
        habits: [{ id: 'ex-h', name: 'Example: Walk' }, { id: 'my-h', name: 'Read' }],
        history: [{ id: 'ex-s' }, { id: 'my-s' }],
      },
      [
        { id: 'ex-task', kind: 'todo.task', state: {} },
        { id: 'my-task', kind: 'todo.task', state: {} },
        { id: 'lane-ex', kind: 'habit.lane', state: { habitId: 'ex-h' } },
        { id: 'lane-my', kind: 'habit.lane', state: { habitId: 'my-h' } },
      ],
    );
    const out = withoutExamples(b, { itemIds: ['ex-item'], taskIds: ['ex-task'], segIds: ['ex-s'], habitIds: ['ex-h'] });
    const ids = out.nodes.map((n) => n.id);
    expect(ids).not.toContain('ex-task');
    expect(ids).not.toContain('lane-ex');
    expect(ids).toContain('my-task');
    expect(ids).toContain('lane-my');
    const st = (id: string) => out.nodes.find((n) => n.id === id)!.state as Record<string, Array<{ id: string }>>;
    expect(st('todo').items!.map((i) => i.id)).toEqual(['mine']);
    expect(st('habit').habits!.map((h) => h.id)).toEqual(['my-h']);
    expect(st('pomo').history!.map((h) => h.id)).toEqual(['my-s']);
  });
});

describe('Which tours bring examples', () => {
  it('the tours that point at plans, recorded time or cards', () => {
    const withEx = TOURS.filter((t) => t.examples?.length).map((t) => t.id).sort();
    expect(withEx).toEqual(['analytics', 'board', 'calendar', 'clock', 'modes', 'on-track', 'welcome']);
  });
});
