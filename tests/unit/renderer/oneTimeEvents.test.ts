/**
 * Decision 62 — an event can happen once. It is the same record as a repeating
 * event (a routine) with its first and last day on the same date, so it shows
 * on that day only, and an older KRNL0 still reads it without failing.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { habitAdd, routineSetOn, type HabitEnv } from '../../../src/renderer/components/nodes/HabitNode/commands';
import { isDayScheduled, isOneTimeEvent, routineOccurrence, type Habit, type HabitState } from '../../../src/renderer/components/nodes/HabitNode/types';
import { cliRoutineAdd, cliRoutineList, type HabitCtx } from '../../../src/sys/commands/habit';

const env: HabitEnv = { uuid: () => 'ev-1', now: () => '2026-11-22T09:00:00.000Z', today: () => '2026-11-22' };
const empty: HabitState = { habits: [] } as unknown as HabitState;
const dentist = (): Habit => habitAdd(empty, { name: 'Dentist', kind: 'routine', schedule: { kind: 'weekly', days: [1], timeOfDay: '15:00', durationMin: 60 }, on: '2026-11-27' }, env).habits[0]!;

describe('one-time events (Decision 62)', () => {
  it('happen on their day: its weekday, first and last day', () => {
    const h = dentist();
    expect(h.kind).toBe('routine');
    expect(h.startsOn).toBe('2026-11-27');
    expect(h.endsOn).toBe('2026-11-27');
    expect(h.schedule).toEqual({ kind: 'weekly', days: [5], timeOfDay: '15:00', durationMin: 60 });
    expect(isOneTimeEvent(h)).toBe(true);
  });

  it('are drawn on that day only', () => {
    const h = dentist();
    expect(routineOccurrence(h, '2026-11-27')).toMatchObject({ startMin: 900, endMin: 960 });
    expect(routineOccurrence(h, '2026-11-20')).toBeNull();
    expect(routineOccurrence(h, '2026-12-04')).toBeNull();
  });

  it('can be on a day before the week it was added', () => {
    const h = habitAdd(empty, { name: 'Lab report due talk', kind: 'routine', schedule: { kind: 'weekly', days: [1], timeOfDay: '10:00' }, on: '2026-11-02' }, env).habits[0]!;
    expect(routineOccurrence(h, '2026-11-02')).not.toBeNull();
  });

  it('an older KRNL0 reads it without failing (a weekly schedule, no new kind)', () => {
    expect(() => isDayScheduled(dentist().schedule, '2026-11-27')).not.toThrow();
    expect(isDayScheduled(dentist().schedule, '2026-11-27')).toBe(true);
  });

  it('a repeating event stays repeating; no time means a habit, not an event', () => {
    const rep = habitAdd(empty, { name: 'Class', kind: 'routine', schedule: { kind: 'weekly', days: [1], timeOfDay: '10:00' } }, env).habits[0]!;
    expect(isOneTimeEvent(rep)).toBe(false);
    const noTime = habitAdd(empty, { name: 'Read', kind: 'routine', schedule: { kind: 'weekly', days: [1] }, on: '2026-11-27' }, env).habits[0]!;
    expect(noTime.kind).toBeUndefined();
    expect(noTime.startsOn).toBeUndefined();
  });

  it('moves to another day, and can start repeating', () => {
    const state = { habits: [dentist()] } as unknown as HabitState;
    const moved = routineSetOn(state, { id: 'ev-1', date: '2026-11-26' }).habits[0]!;
    expect(moved.startsOn).toBe('2026-11-26');
    expect(moved.schedule).toMatchObject({ kind: 'weekly', days: [4], timeOfDay: '15:00' });
    expect(routineOccurrence(moved, '2026-11-26')).not.toBeNull();
    const repeating = routineSetOn(state, { id: 'ev-1', date: null }).habits[0]!;
    expect(isOneTimeEvent(repeating)).toBe(false);
    expect(repeating.startsOn).toBeUndefined();
    expect(repeating.endsOn).toBeUndefined();
    expect(routineOccurrence(repeating, '2026-12-04')).not.toBeNull();
  });
});

describe('CLI: event add --on (Decision 62, rule 8)', () => {
  let dir = '';
  let ctx: HabitCtx;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'krnl0-once-'));
    const boardPath = join(dir, 'board.json');
    writeFileSync(boardPath, JSON.stringify({ version: 1, schemaVersion: 1, nodes: [{ id: 'mother-habit', kind: 'habit', isMother: true, position: { x: 0, y: 0 }, state: { habits: [] }, config: {} }], edges: [] }), 'utf-8');
    ctx = { boardPath };
  });
  afterEach(() => { if (existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

  it('adds an event that happens once', async () => {
    const r = await cliRoutineAdd(ctx, 'Exam', undefined, '09:00', 120, '2026-12-03');
    expect(r.ok).toBe(true);
    expect(r.message).toContain('event added');
    expect(r.message).toContain('on 2026-12-03');
    const h = JSON.parse(readFileSync(ctx.boardPath, 'utf-8')).nodes[0].state.habits[0];
    expect(h).toMatchObject({ name: 'Exam', kind: 'routine', startsOn: '2026-12-03', endsOn: '2026-12-03', schedule: { kind: 'weekly', days: [4], timeOfDay: '09:00', durationMin: 120 } });
    const list = await cliRoutineList(ctx);
    expect(list.message).toContain('Exam · on 2026-12-03');
  });

  it('refuses a date it cannot read', async () => {
    const r = await cliRoutineAdd(ctx, 'Exam', undefined, '09:00', 60, 'friday');
    expect(r.ok).toBe(false);
  });
});
