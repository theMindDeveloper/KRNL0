// @vitest-environment jsdom
/** Engagement — docs/06-requirements/engagement.md (F4–F19). */
import { describe, it, expect, beforeEach } from 'vitest';
import type { Board, Node } from '../../../src/shared/types';
import { finishedClockKey, finishedTaskIds, hasLeft, parseFinished, useFinishedCards } from '../../../src/renderer/store/finishedCards';
import { daySummary, morningLine, mondayOf, shouldShowRecap, shouldShowWeek, type DaySummary, type WeekSummary } from '../../../src/renderer/store/dayRecap';
import { bestStreak, milestoneReached, nextMilestone, repairableDay } from '../../../src/renderer/components/nodes/HabitNode/commands';
import { dayProgress, progressRatio, weekProgress } from '../../../src/renderer/store/dayProgress';
import { runEngagementCommand } from '../../../src/renderer/store/engagementCli';
import { SysParser } from '../../../src/sys/parser';

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const NOW = at(2026, 11, 6, 12);
const task = (id: string, s: Record<string, unknown>): Node => ({ id, kind: 'todo.task', position: { x: 0, y: 0 }, state: { text: id, done: false, parentTaskId: null, ...s }, config: {}, isMother: false });
const board = (nodes: Node[], edges: Board['edges'] = []): Pick<Board, 'nodes' | 'edges'> => ({ nodes, edges });
const edge = (a: string, b: string): Board['edges'][number] => ({ id: `${a}-${b}`, from: { nodeId: a, event: 'task.next' }, to: { nodeId: b, command: 'task.activate' }, enabled: true });
const iso = (ms: number) => new Date(ms).toISOString();

describe('F4–F5 — finished cards leave the board', () => {
  it('overnight: a task done yesterday is hidden, one done today stays', () => {
    const b = board([
      task('y', { done: true, completedAt: iso(at(2026, 11, 5, 18)) }),
      task('t', { done: true, completedAt: iso(at(2026, 11, 6, 9)) }),
      task('open', {}),
    ]);
    expect([...finishedTaskIds(b, 'overnight', NOW)]).toEqual(['y']);
  });

  it('after 1 hour, and keep', () => {
    const b = board([task('a', { done: true, completedAt: iso(NOW - 61 * 60_000) }), task('b', { done: true, completedAt: iso(NOW - 10 * 60_000) })]);
    expect([...finishedTaskIds(b, 'hour', NOW)]).toEqual(['a']);
    expect(finishedTaskIds(b, 'keep', NOW).size).toBe(0);
  });

  it('a chain leaves together, only when all of it is done', () => {
    const old = iso(at(2026, 11, 4));
    const half = board([task('a', { done: true, completedAt: old }), task('b', {})], [edge('a', 'b')]);
    expect(finishedTaskIds(half, 'overnight', NOW).size).toBe(0);
    const whole = board([task('a', { done: true, completedAt: old }), task('b', { done: true, completedAt: old })], [edge('a', 'b')]);
    expect(finishedTaskIds(whole, 'overnight', NOW)).toEqual(new Set(['a', 'b']));
  });

  it('a subtask keeps its done parent on the board; the group is timed from its last completion', () => {
    const b = board([
      task('p', { done: true, completedAt: iso(at(2026, 11, 4)) }),
      task('c', { parentTaskId: 'p', done: true, completedAt: iso(at(2026, 11, 6, 8)) }),
    ]);
    expect(finishedTaskIds(b, 'overnight', NOW).size).toBe(0);
  });

  it('legacy done tasks without completedAt count as long done', () => {
    expect(hasLeft('overnight', 0, NOW)).toBe(true);
    expect(finishedTaskIds(board([task('l', { done: true })]), 'overnight', NOW).size).toBe(1);
  });

  it('settings parse and persist; clock key changes per day / 5 min', () => {
    expect(parseFinished(null)).toEqual({ policy: 'overnight', showFinished: false });
    expect(parseFinished('{"policy":"x","showFinished":1}')).toEqual({ policy: 'overnight', showFinished: false });
    expect(finishedClockKey('overnight', at(2026, 11, 6, 1))).toBe(finishedClockKey('overnight', at(2026, 11, 6, 23)));
    expect(finishedClockKey('hour', NOW)).not.toBe(finishedClockKey('hour', NOW + 5 * 60_000));
  });
});

describe('F6 / F11 — CLI', () => {
  beforeEach(() => { localStorage.clear(); useFinishedCards.setState({ policy: 'overnight', showFinished: false }); });

  it('parses finished and recap', () => {
    expect(SysParser.parse(['finished'])).toEqual({ kind: 'finished', sub: 'status' });
    expect(SysParser.parse(['finished', 'hour'])).toEqual({ kind: 'finished', sub: 'policy', policy: 'hour' });
    expect(SysParser.parse(['finished', 'show'])).toEqual({ kind: 'finished', sub: 'show' });
    expect(SysParser.parse(['recap'])).toEqual({ kind: 'recap', sub: 'today' });
    expect(SysParser.parse(['recap', 'week'])).toEqual({ kind: 'recap', sub: 'week' });
  });

  it('sets the same store as Settings', () => {
    expect(runEngagementCommand('finished.policy', { policy: 'keep' }, null).ok).toBe(true);
    expect(runEngagementCommand('finished.show', {}, null).ok).toBe(true);
    expect(useFinishedCards.getState()).toMatchObject({ policy: 'keep', showFinished: true });
    expect(runEngagementCommand('finished.policy', { policy: 'never' }, null).ok).toBe(false);
  });
});

const day = (p: Partial<DaySummary>): DaySummary => ({ date: '2026-11-06', done: 0, planned: 0, plannedDone: 0, plannedMin: 0, focusMin: 0, topStreak: null, ...p });

describe('F8–F10 — close the day', () => {
  it('recap: when the plan is all done, or from 21:00, once a day', () => {
    expect(shouldShowRecap(day({ done: 2, planned: 2, plannedDone: 2 }), NOW, {})).toBe(true);
    expect(shouldShowRecap(day({ done: 1, planned: 2, plannedDone: 1 }), NOW, {})).toBe(false);
    expect(shouldShowRecap(day({ done: 1, planned: 2, plannedDone: 1 }), at(2026, 11, 6, 21, 5), {})).toBe(true);
    expect(shouldShowRecap(day({ done: 2, planned: 2, plannedDone: 2 }), NOW, { recap: '2026-11-06' })).toBe(false);
    expect(shouldShowRecap(day({}), at(2026, 11, 6, 22), {})).toBe(false);
  });

  it('morning line: yesterday, a fresh start, nothing on a new board', () => {
    expect(morningLine(day({ date: '2026-11-05', done: 4, focusMin: 190 }), '2026-11-06', {}, true)).toBe('yesterday: 4 done · 3h 10m');
    expect(morningLine(day({ date: '2026-11-05' }), '2026-11-06', {}, true)).toBe("new day, let's go");
    expect(morningLine(day({ done: 4 }), '2026-11-06', {}, false)).toBeNull();
    expect(morningLine(day({ done: 4 }), '2026-11-06', { morning: '2026-11-06' }, true)).toBeNull();
  });

  it('Monday look-back: only on Monday, once, when last week had anything', () => {
    const week = (done: number): WeekSummary => ({ start: '2026-10-26', end: '2026-11-01', done, focusMin: 0, days: [], bestDay: null });
    expect(mondayOf('2026-11-06')).toBe('2026-11-02');
    expect(shouldShowWeek('2026-11-02', week(3), {})).toBe(true);
    expect(shouldShowWeek('2026-11-03', week(3), {})).toBe(false);
    expect(shouldShowWeek('2026-11-02', week(0), {})).toBe(false);
    expect(shouldShowWeek('2026-11-02', week(3), { week: '2026-11-02' })).toBe(false);
  });

  it('daySummary counts the planned tasks of the day', () => {
    const b = { nodes: [task('a', { scheduledFor: '2026-11-06T09:00', plannedMin: 30, done: true }), task('b', { scheduledFor: '2026-11-06T14:00', plannedMin: 60 }), task('c', { scheduledFor: '2026-11-07T09:00' })] };
    expect(daySummary(b, '2026-11-06')).toMatchObject({ planned: 2, plannedDone: 1, plannedMin: 90 });
  });
});

describe('F16–F17 — streaks that forgive', () => {
  const days = (start: string, n: number) => Array.from({ length: n }, (_, i) => { const d = new Date(`${start}T00:00:00`); d.setDate(d.getDate() + i); return d.toISOString().slice(0, 10) === '' ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });

  it('best streak is the longest run ever', () => {
    expect(bestStreak([...days('2026-10-01', 12), ...days('2026-11-01', 3)])).toBe(12);
    expect(bestStreak([])).toBe(0);
  });

  it('milestones', () => {
    expect(nextMilestone(6)).toBe(7);
    expect(nextMilestone(7)).toBe(30);
    expect(milestoneReached(7)).toBe(7);
    expect(milestoneReached(8)).toBeNull();
  });

  it('a missed yesterday after a done day can be repaired; two missed days cannot', () => {
    expect(repairableDay(['2026-11-04'], '2026-11-06')).toBe('2026-11-05');
    expect(repairableDay(['2026-11-03'], '2026-11-06')).toBeNull();
    expect(repairableDay(['2026-11-05'], '2026-11-06')).toBeNull();
  });
});

describe('F18 — Clock ring and week marks', () => {
  it('counts the planned blocks done per day', () => {
    const b = { nodes: [task('a', { scheduledFor: '2026-11-06T09:00', done: true }), task('b', { scheduledFor: '2026-11-06T10:00' }), task('m', { scheduledFor: '2026-11-02T09:00', done: true })] };
    const p = dayProgress(b, '2026-11-06');
    expect(p).toEqual({ date: '2026-11-06', planned: 2, done: 1 });
    expect(progressRatio(p)).toBe(0.5);
    const week = weekProgress(b, '2026-11-06');
    expect(week.map((d) => d.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
    expect(week[0]).toEqual({ date: '2026-11-02', planned: 1, done: 1 });
  });
});
