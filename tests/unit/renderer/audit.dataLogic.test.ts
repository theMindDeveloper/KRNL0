/**
 * Audit 2026-11-09, group B — numbers and plans shown wrong.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { useBoardStore, pushHistory, historyGroup } from '../../../src/renderer/store/boardStore';
import { selectSchedule } from '../../../src/renderer/store/scheduleSelector';
import { droppedTaskIds } from '../../../src/shared/droppedPlans';
import { routineRestart, habitStreak } from '../../../src/renderer/components/nodes/HabitNode/commands';
import { routineOccurrence, routineSpansOn, type Habit } from '../../../src/renderer/components/nodes/HabitNode/types';
import { spanProblem, timesFromFields } from '../../../src/renderer/components/nodes/PomoNode/spanEdit';
import { defaultPomoState } from '../../../src/renderer/components/nodes/PomoNode/types';
import { parseQuickAdd } from '../../../src/shared/quickAdd';
import { minutesByHour } from '../../../src/renderer/analytics/bucketBy';
import { planForDay, collectScheduledHabits } from '../../../src/renderer/components/nodes/ClockNode/dayModel';
import type { Board, Node } from '../../../src/shared/types';

const ms = (s: string) => new Date(s).getTime();

afterEach(() => useBoardStore.setState({ board: null, history: [], future: [] }));

describe('one action, one Ctrl+Z', () => {
  it('writes across an await inside historyGroup take one undo step', async () => {
    const board = { nodes: [], edges: [] } as unknown as Board;
    useBoardStore.setState({ board, history: [], future: [] });
    await historyGroup(async () => {
      useBoardStore.setState((s) => ({ ...pushHistory(s), board: { ...s.board!, nodes: [{ id: 'a' } as Node] } }));
      await new Promise((r) => setTimeout(r, 5));
      useBoardStore.setState((s) => ({ ...pushHistory(s), board: { ...s.board!, nodes: [...s.board!.nodes, { id: 'b' } as Node] } }));
    });
    expect(useBoardStore.getState().history).toHaveLength(1);
  });
});

describe("Won't do", () => {
  const task = (id: string, scheduledFor?: string): Node => ({
    id, kind: 'todo.task', position: { x: 0, y: 0 }, isMother: false, config: {},
    state: { text: id, done: false, parentTodoId: 'todo', parentTaskId: null, plannedMin: 60, ...(scheduledFor ? { scheduledFor } : {}) },
  } as unknown as Node);
  const board = (dropped: boolean): Board => ({
    nodes: [
      { id: 'todo', kind: 'todo', isMother: true, position: { x: 0, y: 0 }, config: {}, state: { items: [{ id: 'i1', text: 'Gym', done: false, createdAt: '', taskNodeId: 'gym', ...(dropped ? { droppedAt: '2026-11-09T10:00:00Z' } : {}) }] } },
      task('gym', '2026-11-13T18:00'),
    ],
    edges: [],
  } as unknown as Board);

  it('a dropped plan is never on the Calendar, whatever its stored time says', () => {
    expect(selectSchedule(board(false)).placements.has('gym')).toBe(true);
    expect(droppedTaskIds(board(true).nodes)).toEqual(new Set(['gym']));
    expect(selectSchedule(board(true)).placements.has('gym')).toBe(false);
  });
});

describe('repeating events', () => {
  const klass = (extra: Partial<Habit> = {}): Habit => ({
    id: 'r1', name: 'Class', createdAt: '2026-11-01T08:00:00.000Z', log: [], archived: false, color: 'amber', kind: 'routine',
    schedule: { kind: 'weekly', days: [1, 3], timeOfDay: '10:00', durationMin: 90 }, ...extra,
  });

  it('restarting an ended event keeps the weeks it was ended empty', () => {
    const ended = klass({ endsOn: '2026-11-18' });
    const back = routineRestart({ habits: [ended] }, { id: 'r1', today: '2026-12-02' }).habits[0]!;
    expect(back.endsOn).toBeUndefined();
    expect(routineOccurrence(back, '2026-11-16')).not.toBeNull(); // before the end
    expect(routineOccurrence(back, '2026-11-25')).toBeNull(); // while ended
    expect(routineOccurrence(back, '2026-11-30')).toBeNull();
    expect(routineOccurrence(back, '2026-12-02')).not.toBeNull(); // from the restart
  });

  it('a 23:30 event with no length set runs 60 min, past midnight', () => {
    const late = klass({ schedule: { kind: 'daily', timeOfDay: '23:30' } });
    const spans = routineSpansOn(late, '2026-11-10');
    expect(spans.some((s) => s.spill && s.startMin === 0 && s.endMin === 30)).toBe(true);
  });
});

describe('recorded time', () => {
  it('Log time over a paused session is refused (that time is recorded on resume)', () => {
    const paused = { ...defaultPomoState(), status: 'paused' as const, startedAt: '2026-11-10T09:00:00', pausedAt: '2026-11-10T09:40:00' };
    const problem = spanProblem(paused as never, { startMs: ms('2026-11-10T09:10:00'), endMs: ms('2026-11-10T09:30:00') }, ms('2026-11-10T10:00:00'));
    expect(problem).toMatch(/paused session/);
  });

  it('the same start and end is not a 24-hour session', () => {
    const t = timesFromFields('2026-11-05', '09:00', '09:00')!;
    expect(t.endMs).toBe(t.startMs);
    expect(spanProblem(defaultPomoState(), t, ms('2026-11-06T12:00:00'))).toMatch(/after the start/);
  });

  it('the hour chart spreads a session over the hours it covered', () => {
    const parts = minutesByHour({ source: 'pomo', type: 'pomo.work', date: '2026-11-10', isoTimestamp: new Date(ms('2026-11-10T11:00:00') - 1).toISOString(), durationMin: 120 } as never);
    expect(parts.map((p) => [p.hour, Math.round(p.min)])).toEqual([[9, 60], [10, 60]]);
  });
});

describe('habits', () => {
  it('"best" is never below the streak shown next to it', () => {
    const s = habitStreak({ log: ['2026-11-07', '2026-11-09'], schedule: { kind: 'weekdays' } as never }, '2026-11-09');
    expect(s.best).toBeGreaterThanOrEqual(s.current);
  });

  it('the Clock draws no timed habit on its rest days or before it was added', () => {
    const board = { nodes: [{ id: 'hm', kind: 'habit', isMother: true, position: { x: 0, y: 0 }, config: {}, state: { habits: [
      { id: 'h1', name: 'Read', createdAt: '2026-11-09T08:00:00', log: [], archived: false, color: 'acid', rest: ['2026-11-11'], schedule: { kind: 'daily', timeOfDay: '07:30', durationMin: 30 } },
    ] } }] } as unknown as Board;
    const habits = collectScheduledHabits(board);
    const on = (d: string) => planForDay([], new Map(), habits, d, 0).some((e) => e.id === 'habit-h1');
    expect(on('2026-11-10')).toBe(true);
    expect(on('2026-11-11')).toBe(false); // rest day
    expect(on('2026-11-08')).toBe(false); // before it existed
  });
});

describe('quick add', () => {
  it('today\'s weekday with a time already past is next week, not the past', () => {
    const fri19 = new Date(2026, 10, 13, 19, 0);
    expect(parseQuickAdd('Gym fri 18:00', fri19).day).toBe('2026-11-20');
    expect(parseQuickAdd('Gym fri 20:00', fri19).day).toBe('2026-11-13');
  });
});
