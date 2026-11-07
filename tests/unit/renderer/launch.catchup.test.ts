/** Decision 38 — Welcome back and milestones (launch-experience.md F12–F15, F20–F23). */
import { describe, it, expect } from 'vitest';
import { bestStreak, computeCatchup, describeCatchup, isEmptyCatchup, landingTimes, movedSchedule } from '../../../src/renderer/launch/catchup';
import { findNewMilestone, focusStats, milestoneLine, shareCardFor } from '../../../src/renderer/launch/milestones';

const TODAY = '2026-11-06';

function days(end: string, n: number): string[] {
  const out: string[] = [];
  const d = new Date(`${end}T00:00:00`);
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    d.setDate(d.getDate() - 1);
  }
  return out;
}

const task = (id: string, text: string, scheduledFor?: string, done = false) => ({
  id, kind: 'todo.task', state: { text, done, ...(scheduledFor ? { scheduledFor } : {}) },
});
const next = (from: string, to: string) => ({ from: { nodeId: from, event: 'task.next' }, to: { nodeId: to } });
const habits = (list: Array<{ id: string; name: string; log: string[] }>) => ({
  id: 'h', kind: 'habit', isMother: true, state: { habits: list.map((h) => ({ ...h, archived: false })) },
});

describe('computeCatchup (F13)', () => {
  const board = {
    nodes: [
      task('a', 'Outline chapter 3', '2026-11-03T09:00'),
      task('b', 'Draft section 3.1'),
      task('c', 'Book dentist', '2026-11-04T14:30'),
      task('d', 'Done already', '2026-11-02T10:00', true),
      task('e', 'Later this week', '2026-11-08T10:00'),
      task('f', 'Today', '2026-11-06T10:00'),
    ],
    edges: [next('a', 'b')],
  };
  const c = computeCatchup(board, TODAY);

  it('lists tasks past their day that are not done, oldest first', () => {
    expect(c.tasks.map((t) => t.id)).toEqual(['a', 'c']);
    expect(c.tasks[0]).toMatchObject({ wasDay: '2026-11-03', time: '09:00' });
  });
  it('puts chained tasks under the first one, without their own buttons', () => {
    expect(c.tasks[0]!.followers).toEqual([{ id: 'b', text: 'Draft section 3.1' }]);
    expect(c.tasks.some((t) => t.id === 'b')).toBe(false);
  });
  it('a moved task keeps its time of day (F14)', () => {
    expect(movedSchedule(c.tasks[1]!, TODAY)).toBe('2026-11-06T14:30');
  });
  it('a follower with its own past plan still moves with its head', () => {
    const b2 = { nodes: [task('a', 'A', '2026-11-03T09:00'), task('b', 'B', '2026-11-03T10:00')], edges: [next('a', 'b')] };
    expect(computeCatchup(b2, TODAY).tasks.map((t) => t.id)).toEqual(['a']);
  });
  it('a slipped task whose chain head is already done still shows (it is the head now)', () => {
    const b3 = { nodes: [task('a', 'A', '2026-11-02T09:00', true), task('b', 'B', '2026-11-03T10:00')], edges: [next('a', 'b')] };
    expect(computeCatchup(b3, TODAY).tasks.map((t) => t.id)).toEqual(['b']);
  });
  it('a slipped task after an unplanned, open head still shows', () => {
    const b4 = { nodes: [task('a', 'A'), task('b', 'B', '2026-11-03T10:00')], edges: [next('a', 'b')] };
    expect(computeCatchup(b4, TODAY).tasks.map((t) => t.id)).toEqual(['b']);
  });
  it('a slipped task further down a slipped chain is listed once, under its head', () => {
    const b5 = {
      nodes: [task('a', 'A', '2026-11-02T09:00'), task('x', 'X'), task('b', 'B', '2026-11-03T10:00')],
      edges: [next('a', 'x'), next('x', 'b')],
    };
    const c5 = computeCatchup(b5, TODAY);
    expect(c5.tasks.map((t) => t.id)).toEqual(['a']);
    expect(c5.tasks[0]!.followers.map((f) => f.id)).toEqual(['x', 'b']);
    // b slipped itself: it carries its time so it moves with the head.
    expect(c5.tasks[0]!.followers).toEqual([{ id: 'x', text: 'X' }, { id: 'b', text: 'B', time: '10:00' }]);
  });
  it('says plainly when nothing slipped', () => {
    const empty = computeCatchup({ nodes: [], edges: [] }, TODAY);
    expect(isEmptyCatchup(empty)).toBe(true);
    expect(describeCatchup(empty)).toContain('Nothing slipped');
    expect(describeCatchup(c)).toContain('↳ Draft section 3.1');
  });
});

describe('habits in the catch-up (F15)', () => {
  it('a broken streak shows its best run; a running one says still going', () => {
    const board = {
      nodes: [habits([
        { id: 'run', name: 'Morning run', log: days('2026-11-01', 12) },
        { id: 'read', name: 'Read 20 pages', log: days('2026-11-05', 6) },
        { id: 'new', name: 'Never started', log: [] },
      ])],
      edges: [],
    };
    const c = computeCatchup(board, TODAY);
    expect(c.habits).toMatchObject([
      { id: 'run', name: 'Morning run', current: 0, best: 12, broken: true },
      { id: 'read', name: 'Read 20 pages', current: 6, best: 6, broken: false },
    ]);
    expect(c.habits[0]!.log).toHaveLength(12);
  });
  it('bestStreak finds the longest run', () => {
    expect(bestStreak(['2026-11-01', '2026-11-02', '2026-11-04', '2026-11-05', '2026-11-06'])).toBe(3);
    expect(bestStreak([])).toBe(0);
  });
});

describe('milestones (F20–F23)', () => {
  const streakBoard = (n: number) => [habits([{ id: 'run', name: 'Morning run', log: days(TODAY, n) }])];
  it('a streak counts on the day it reaches the number, once', () => {
    const m = findNewMilestone(streakBoard(30), TODAY, []);
    expect(m).toMatchObject({ id: 'streak:run:30', kind: 'streak', value: 30, habit: 'Morning run' });
    expect(findNewMilestone(streakBoard(30), TODAY, ['streak:run:30'])).toBeNull();
    expect(findNewMilestone(streakBoard(31), TODAY, [])).toMatchObject({ id: 'streak:run:30' });
    expect(findNewMilestone(streakBoard(34), TODAY, [])).toBeNull();
    expect(milestoneLine(m!).title).toBe('30 days of Morning run.');
  });
  it('a streak that jumps past a milestone (a repaired day) still gets its card, once', () => {
    expect(findNewMilestone(streakBoard(8), TODAY, [])).toMatchObject({ id: 'streak:run:7', value: 7 });
    expect(findNewMilestone(streakBoard(8), TODAY, ['streak:run:7'])).toBeNull();
  });
  it('an old long streak does not replay past milestones', () => {
    expect(findNewMilestone(streakBoard(40), TODAY, [])).toBeNull();
  });
  it('focus sessions count finished work spans', () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      kind: 'work', completed: true, startedAt: `2026-11-0${(i % 5) + 1}T09:00:00Z`, endedAt: `2026-11-0${(i % 5) + 1}T09:25:00Z`,
    }));
    const nodes = [{ kind: 'pomo', isMother: true, state: { history: [...history, { kind: 'break', completed: true, startedAt: 'x', endedAt: 'y' }] } }];
    expect(focusStats(nodes).sessions).toBe(10);
    const m = findNewMilestone(nodes, TODAY, [], Date.parse('2026-11-06T12:00:00Z'));
    expect(m).toMatchObject({ id: 'sessions:10', kind: 'sessions', value: 10, focusedMs: 10 * 25 * 60_000 });
  });
  it('krnl share picks a habit by name, or the longest streak', () => {
    const nodes = [habits([
      { id: 'run', name: 'Morning run', log: days(TODAY, 4) },
      { id: 'read', name: 'Read 20 pages', log: days(TODAY, 9) },
    ])];
    expect(shareCardFor(nodes, TODAY, { kind: 'streak' })).toMatchObject({ habit: 'Read 20 pages', value: 9 });
    expect(shareCardFor(nodes, TODAY, { kind: 'streak', habit: 'morning' })).toMatchObject({ habit: 'Morning run', value: 4 });
    expect(shareCardFor(nodes, TODAY, { kind: 'streak', habit: 'swim' })).toBeNull();
  });
});

describe('landing times when moving slipped tasks (F27)', () => {
  const items = [
    { id: 'early', time: '09:00', lengthMin: 30 },
    { id: 'mid', time: '11:00', lengthMin: 45 },
    { id: 'late', time: '21:00', lengthMin: 60 },
  ];
  const now = new Date('2026-11-07T19:07:00').getTime();

  it('to today: times already past line up from the next quarter hour, in order; later times stay', () => {
    const at = landingTimes(items, '2026-11-07', '2026-11-07', now);
    expect(at.get('early')).toBe('2026-11-07T19:15');
    expect(at.get('mid')).toBe('2026-11-07T19:45');
    expect(at.get('late')).toBe('2026-11-07T21:00');
  });

  it('to another day: every task keeps its time', () => {
    const at = landingTimes(items, '2026-11-08', '2026-11-07', now);
    expect([...at.values()]).toEqual(['2026-11-08T09:00', '2026-11-08T11:00', '2026-11-08T21:00']);
  });

  it('nothing ever lands in the past, even late at night (it runs on past midnight)', () => {
    const night = new Date('2026-11-07T23:50:00').getTime();
    const at = landingTimes(items, '2026-11-07', '2026-11-07', night);
    for (const v of at.values()) expect(new Date(v).getTime()).toBeGreaterThanOrEqual(night);
    expect(at.get('early')).toBe('2026-11-08T00:00');
  });
});
