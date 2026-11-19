// @vitest-environment jsdom
/**
 * The Line layout (docs/06-requirements/line-layout.md): one day as marks on a
 * line, the one field, the layout switch and its `krnl line` command.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import { colorFor, dayData, gapMarks, habitRows, nextPlan, noTimeYet, realMarks, UNNAMED } from '../../../src/renderer/components/Line/dayData';
import { planRows, rangeFor } from '../../../src/renderer/components/Line/DayLine';
import { arcPath } from '../../../src/renderer/components/Line/DayClock';
import { readField, readHabit } from '../../../src/renderer/components/Line/lineActions';
import { LineLayout } from '../../../src/renderer/components/Line/LineLayout';
import { parseLineLayout, runLineCommand, useLineLayout } from '../../../src/renderer/store/lineLayout';
import { SysParser } from '../../../src/sys/parser';

type Loose = Record<string, unknown>;
const DAY = '2026-11-18';
const at = (hhmm: string, day = DAY): number => new Date(`${day}T${hhmm}`).getTime();
const iso = (hhmm: string, day = DAY): string => new Date(`${day}T${hhmm}`).toISOString();

const task = (id: string, extra: Loose = {}) => ({
  id, kind: 'todo.task', isMother: false, position: { x: 0, y: 0 }, config: {},
  state: { text: id, done: false, kind: 'event', plannedMin: 60, parentTodoId: 'todo', parentTaskId: null, todoItemId: `it-${id}`, ...extra },
});
const item = (id: string, extra: Loose = {}) => ({ id: `it-${id}`, text: id, done: false, createdAt: '2026-11-10T00:00:00.000Z', completedAt: null, taskNodeId: id, ...extra });
const seg = (id: string, from: string, to: string, extra: Loose = {}) => ({ id, startedAt: iso(from), endedAt: iso(to), durationMin: 0, label: '', completed: false, kind: 'work', ...extra });

function board(over: { tasks?: Loose[]; items?: Loose[]; history?: Loose[]; pomo?: Loose; habits?: Loose[] } = {}) {
  return {
    nodes: [
      { id: 'todo', kind: 'todo', isMother: true, position: { x: 0, y: 0 }, config: {}, state: { items: over.items ?? [] } },
      { id: 'pomo', kind: 'pomo', isMother: true, position: { x: 0, y: 0 }, config: { mode: 'observe' }, state: { status: 'idle', startedAt: null, label: '', activeTaskId: null, history: over.history ?? [], ...over.pomo } },
      { id: 'habit', kind: 'habit', isMother: true, position: { x: 0, y: 0 }, config: {}, state: { habits: over.habits ?? [] } },
      { id: 'cal', kind: 'calendar', isMother: true, position: { x: 0, y: 0 }, config: {}, state: {} },
      ...(over.tasks ?? []),
    ],
    edges: [],
  } as never;
}

describe('What was recorded on a day (F2)', () => {
  const b = board({
    history: [seg('a', '08:10', '10:25', { label: 'Study' }), seg('b', '11:00', '12:20', { label: 'Gaming' }), seg('c', '12:20', '12:35', { kind: 'break' })],
    pomo: { status: 'running', startedAt: iso('13:40'), label: 'Study' },
  });
  const now = at('14:20');
  it('work, breaks and the live span, named and coloured by name', () => {
    const real = realMarks(b, DAY, now);
    expect(real.map((r) => [r.label, r.kind, r.live])).toEqual([['Study', 'work', false], ['Gaming', 'work', false], ['Break', 'break', false], ['Study', 'work', true]]);
    expect(real[0]!.color).toBe(real[3]!.color);
    expect(real[0]!.color).not.toBe(real[1]!.color);
    expect(real[3]!.endMs).toBe(now);
  });
  it('a span nobody named is "Recorded"; a span over midnight is cut at the day', () => {
    const real = realMarks(board({ history: [seg('x', '23:30', '23:59'), { ...seg('y', '00:00', '00:00'), startedAt: iso('23:00', '2026-11-17'), endedAt: iso('01:00') }] }), DAY, at('23:59'));
    expect(real.map((r) => r.label)).toEqual([UNNAMED, UNNAMED]);
    expect(real[0]!.startMs).toBe(at('00:00'));
    expect(colorFor(UNNAMED)).toBe(colorFor(''));
  });
  it('only long empty stretches are marked: 35 minutes yes, 0 minutes no; nothing while recording', () => {
    const gaps = gapMarks(realMarks(b, DAY, now), DAY, now);
    expect(gaps.map((g) => [g.startMs, g.endMs])).toEqual([[at('10:25'), at('11:00')], [at('12:35'), at('13:40')]]);
    const idle = board({ history: [seg('a', '08:00', '09:00')] });
    expect(gapMarks(realMarks(idle, DAY, at('09:20')), DAY, at('09:20'))).toHaveLength(0);
    expect(gapMarks(realMarks(idle, DAY, at('11:00')), DAY, at('11:00'))).toEqual([{ startMs: at('09:00'), endMs: at('11:00') }]);
    // A past day never asks about the time after its last span.
    expect(gapMarks(realMarks(idle, DAY, at('11:00', '2026-11-19')), DAY, at('11:00', '2026-11-19'))).toHaveLength(0);
  });
});

describe('The plans on a day (F3)', () => {
  const b = board({
    items: [item('work'), item('doctor'), item('gym'), item('done', { done: true }), item('rent', { taskNodeId: null, onDay: DAY }), item('later', { taskNodeId: null }), item('gone', { droppedAt: '2026-11-18T07:00:00.000Z' })],
    tasks: [
      task('work', { scheduledFor: `${DAY}T08:00`, plannedMin: 120 }),
      task('doctor', { scheduledFor: `${DAY}T10:30`, plannedMin: 30 }),
      task('gym', { scheduledFor: `${DAY}T17:00` }),
      task('done', { scheduledFor: `${DAY}T12:00`, done: true }),
      task('gone', { scheduledFor: `${DAY}T15:00` }),
    ],
    history: [seg('a', '08:10', '10:25', { label: 'Study' })],
  });
  const d = dayData(b, DAY, at('14:20'));
  it('covered by recording, missed, done, open; a Won’t-do plan is not on the line', () => {
    expect(d.plans.map((p) => [p.text, p.state])).toEqual([['work', 'covered'], ['doctor', 'missed'], ['done', 'done'], ['gym', 'open']]);
    expect(d.plans[0]!.recordedMs).toBe(110 * 60_000);
  });
  it('the next plan, the any-time plans of the day, and the ones with no time yet', () => {
    expect(nextPlan(d, at('14:20'))?.text).toBe('gym');
    expect(d.anyTime.map((a) => a.text)).toEqual(['rent']);
    expect(noTimeYet(b).map((a) => a.text)).toEqual(['later']);
  });
  it('totals by name, and the time nobody named', () => {
    expect(d.totals).toEqual([{ label: 'Study', color: colorFor('Study'), ms: 135 * 60_000 }]);
    expect(d.unnamedMs).toBe(at('14:20') - at('10:25'));
  });
  it('time recorded ahead of now never covers a plan', () => {
    const early = dayData(b, DAY, at('07:00'));
    expect(early.plans.find((p) => p.text === 'work')!.state).toBe('open');
  });
  it('a repeating event is on the line and is never ticked', () => {
    const withClass = board({ habits: [{ id: 'cls', name: 'Class', createdAt: '2026-11-01T00:00:00.000Z', log: [], archived: false, color: 'cyan', kind: 'routine', schedule: { kind: 'weekly', days: [3], timeOfDay: '10:00', durationMin: 90 } }] });
    const ev = dayData(withClass, DAY, at('09:00')).plans;
    expect(ev.map((p) => [p.text, p.kind, p.taskId])).toEqual([['Class', 'event', null]]);
  });
});

describe('Drawing', () => {
  it('parallel plans get a row each', () => {
    const p = (id: string, a: string, b: string) => ({ id, taskId: id, text: id, startMs: at(a), endMs: at(b), state: 'open' as const, kind: 'plan' as const, recordedMs: 0 });
    const { row, rows } = planRows([p('a', '10:00', '11:00'), p('b', '10:00', '10:30'), p('c', '10:30', '11:00'), p('d', '12:00', '13:00')]);
    expect(rows).toBe(2);
    expect([row.get('a'), row.get('b'), row.get('c'), row.get('d')]).toEqual([0, 1, 1, 0]);
  });
  it('the line starts at six, or earlier when something does', () => {
    expect(rangeFor([dayData(board(), DAY, at('12:00'))])).toEqual({ h0: 6, h1: 24 });
    expect(rangeFor([dayData(board({ history: [seg('a', '04:30', '05:00')] }), DAY, at('12:00'))])).toEqual({ h0: 4, h1: 24 });
  });
  it('the clock has noon on top and midnight at the bottom', () => {
    expect(arcPath(250, 100, 12, 18)).toBe('M250.0 150.0 A100.0 100.0 0 0 1 350.0 250.0');
    expect(arcPath(250, 100, 0, 18)).toContain(' 0 1 1 ');
  });
});

describe('The one field (F5)', () => {
  const now = new Date(`${DAY}T09:00`);
  it('a name records; a time or a day plans; repeating words make a habit', () => {
    expect(readField('study', now)).toEqual({ kind: 'record', label: 'study' });
    const plan = readField('gym 18:00 1h', now);
    expect(plan.kind === 'plan' && [plan.q.text, plan.q.time, plan.q.durationMin]).toEqual(['gym', '18:00', 60]);
    expect(readField('pay rent fri', now).kind).toBe('plan');
    expect(readField('walk daily', now).kind).toBe('habit');
    expect(readField('   ', now)).toEqual({ kind: 'empty' });
  });
  it('habit words: every day, days of the week, times a week, an amount, a time', () => {
    expect(readHabit('walk daily')).toMatchObject({ name: 'Walk', schedule: { kind: 'daily' }, says: 'every day' });
    expect(readHabit('gym mon wed fri')).toMatchObject({ name: 'Gym', schedule: { kind: 'weekly', days: [1, 3, 5] }, says: 'Mon · Wed · Fri' });
    expect(readHabit('run 3x a week')).toMatchObject({ name: 'Run', perWeek: 3, says: '3 times a week' });
    expect(readHabit('water 8 glasses')).toMatchObject({ name: 'Water', amount: { target: 8, unit: 'glasses' } });
    expect(readHabit('read every day 21:30')).toMatchObject({ name: 'Read', schedule: { kind: 'daily', timeOfDay: '21:30' } });
    expect(readHabit('class every tue')).toMatchObject({ schedule: { kind: 'weekly', days: [2] } });
    // One day without "every" is a plan on that day.
    expect(readHabit('dentist fri')).toBeNull();
    expect(readHabit('study')).toBeNull();
  });
});

describe('Habits on the line (F6)', () => {
  it('names, this week’s dots and a status in words', () => {
    const b = board({ habits: [
      { id: 'r', name: 'Read', createdAt: '2026-11-01T00:00:00.000Z', log: ['2026-11-18', '2026-11-17', '2026-11-16'], archived: false, color: 'amber' },
      { id: 'w', name: 'Water', createdAt: '2026-11-01T00:00:00.000Z', log: [], archived: false, color: 'lilac', amount: { target: 8, unit: 'glasses' }, counts: { '2026-11-18': 5 } },
      { id: 'c', name: 'Class', createdAt: '2026-11-01T00:00:00.000Z', log: [], archived: false, color: 'cyan', kind: 'routine', schedule: { kind: 'weekly', days: [3], timeOfDay: '10:00' } },
    ] });
    const rows = habitRows(b, DAY);
    expect(rows.map((h) => [h.name, h.done, h.status])).toEqual([['Read', true, '3 days'], ['Water', false, '5 of 8 today']]);
    expect(rows[0]!.week).toEqual([true, true, true, false, false, false, false]);
  });
});

describe('The layout switch and `krnl line` (F1, F12)', () => {
  beforeEach(() => { useLineLayout.setState({ on: false, view: 'today', shape: 'line' }); });
  it('a broken or missing preference means off, Today, line', () => {
    expect(parseLineLayout(null)).toEqual({ on: false, view: 'today', shape: 'line' });
    expect(parseLineLayout('{"on":true,"view":"nope","shape":"clock"}')).toEqual({ on: true, view: 'today', shape: 'clock' });
    expect(parseLineLayout('not json')).toEqual({ on: false, view: 'today', shape: 'line' });
  });
  it('on, a page, a shape, off', () => {
    expect(runLineCommand('line.on', {}).message).toContain('on · today');
    expect(runLineCommand('line.view', { view: 'week' }).ok).toBe(true);
    expect(runLineCommand('line.shape', { shape: 'clock' }).message).toBe('line layout: on · week · drawn as a clock');
    expect(runLineCommand('line.view', { view: 'month' }).ok).toBe(false);
    expect(runLineCommand('line.off', {}).message).toContain('off');
    expect(useLineLayout.getState().on).toBe(false);
  });
  it('parses the command', () => {
    expect(SysParser.parse(['line'])).toEqual({ kind: 'line', sub: 'status' });
    expect(SysParser.parse(['line', 'on'])).toEqual({ kind: 'line', sub: 'on' });
    expect(SysParser.parse(['line', 'view', 'week'])).toEqual({ kind: 'line', sub: 'view', view: 'week' });
    expect(SysParser.parse(['line', 'shape', 'clock'])).toEqual({ kind: 'line', sub: 'shape', shape: 'clock' });
  });
});

describe('The Today screen', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${DAY}T14:20`));
    useLineLayout.setState({ on: true, view: 'today', shape: 'line' });
    useBoardStore.setState({ board: board({
      items: [item('work'), item('doctor'), item('later', { taskNodeId: null })],
      tasks: [task('work', { scheduledFor: `${DAY}T08:00`, plannedMin: 120 }), task('doctor', { scheduledFor: `${DAY}T10:30`, plannedMin: 30 })],
      history: [seg('a', '08:10', '10:25', { label: 'Study' })],
      habits: [{ id: 'r', name: 'Read', createdAt: '2026-11-01T00:00:00.000Z', log: [], archived: false, color: 'amber' }],
    }) });
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('shows the line, the day in words, habits, the gap and the field', () => {
    render(<LineLayout />);
    expect(screen.getByTestId('line-layout').dataset['view']).toBe('today');
    expect(screen.getByTestId('line-plan-work').dataset['state']).toBe('covered');
    expect(screen.getByTestId('line-plan-doctor').dataset['state']).toBe('missed');
    expect(screen.getByTestId('line-real-a').textContent).toContain('Study');
    expect(screen.getByTestId('line-gap')).toBeTruthy();
    expect(screen.getByTestId('line-skip-doctor')).toBeTruthy();
    expect(screen.getByTestId('line-did-work')).toBeTruthy();
    expect(screen.getByTestId('line-habit-r').textContent).toContain('Read');
    expect(screen.getByTestId('line-item-it-later')).toBeTruthy();
    expect(screen.getByTestId('line-start')).toBeTruthy();
  });
  it('typing shows what Enter will do, and a plan with a time shows where it lands', () => {
    render(<LineLayout />);
    const field = screen.getByTestId('line-field');
    fireEvent.change(field, { target: { value: 'study' } });
    expect(screen.getByTestId('line-says').textContent).toContain('start recording "study"');
    expect(screen.queryByTestId('line-ghost')).toBeNull();
    fireEvent.change(field, { target: { value: 'gym 18:00 1h' } });
    expect(screen.getByTestId('line-says').textContent).toContain('add the plan "gym"');
    expect(screen.getByTestId('line-ghost').textContent).toBe('gym');
    fireEvent.change(field, { target: { value: 'walk daily' } });
    expect(screen.getByTestId('line-says').textContent).toContain('add the habit "Walk": every day');
  });
  it('the same day as a clock, the week and the habits page', () => {
    useLineLayout.setState({ shape: 'clock' });
    const { unmount } = render(<LineLayout />);
    expect(screen.getByTestId(`line-clock-${DAY}`)).toBeTruthy();
    expect(screen.getByTestId('clock-now')).toBeTruthy();
    unmount();
    useLineLayout.setState({ view: 'week', shape: 'line' });
    render(<LineLayout />);
    expect(screen.getByTestId(`line-week-row-${DAY}`)).toBeTruthy();
    expect(screen.getByTestId('line-week-row-2026-11-16')).toBeTruthy();
    fireEvent.click(screen.getByTestId('line-tab-habits'));
    expect(screen.getByTestId('line-habits-page')).toBeTruthy();
    expect(screen.getByTestId(`line-cell-r-${DAY}`)).toBeTruthy();
  });
});
