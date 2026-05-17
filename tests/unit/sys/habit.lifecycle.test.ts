// Decision 29 — habit lifecycle CLI commands: rename, icon, note, schedule, unschedule, archive, show
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  cliAdd,
  cliRename,
  cliIcon,
  cliNote,
  cliSchedule,
  cliUnschedule,
  cliArchive,
  cliShow,
  type HabitCtx,
} from '../../../src/sys/commands/habit';

let tmpDir = '';
let boardPath = '';
let ctx: HabitCtx;

function readBoard() {
  return JSON.parse(readFileSync(boardPath, 'utf-8'));
}

function findMother() {
  return readBoard().nodes.find((n: { kind: string; isMother?: boolean }) => n.kind === 'habit' && n.isMother === true);
}

function seedBoard(): void {
  const board = {
    version: 1,
    schemaVersion: 1,
    nodes: [
      {
        id: 'mother-habit',
        kind: 'habit',
        isMother: true,
        position: { x: 0, y: 0 },
        state: { habits: [] },
        config: { weekStartsOn: 'monday', view: 'week' },
      },
    ],
    edges: [],
  };
  writeFileSync(boardPath, JSON.stringify(board), 'utf-8');
}

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'krnl0-habit-lc-'));
  boardPath = join(tmpDir, 'board.json');
  seedBoard();
  ctx = { boardPath };
  // Add a habit to work with
  await cliAdd(ctx, 'Exercise');
});

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

function getHabit() {
  const mother = findMother();
  return mother.state.habits[0];
}

describe('habit rename', () => {
  it('renames a habit by id', async () => {
    const habit = getHabit();
    const res = await cliRename(ctx, habit.id, 'Yoga');
    expect(res.ok).toBe(true);
    expect(getHabit().name).toBe('Yoga');
  });

  it('renames a habit by name', async () => {
    const res = await cliRename(ctx, 'Exercise', 'Run');
    expect(res.ok).toBe(true);
    expect(getHabit().name).toBe('Run');
  });

  it('refuses empty name', async () => {
    const res = await cliRename(ctx, 'Exercise', '');
    expect(res.ok).toBe(false);
  });
});

describe('habit icon', () => {
  it('sets an icon', async () => {
    const habit = getHabit();
    const res = await cliIcon(ctx, habit.id, '🏃', false);
    expect(res.ok).toBe(true);
    expect(getHabit().icon).toBe('🏃');
  });

  it('clears an icon with --clear', async () => {
    const habit = getHabit();
    await cliIcon(ctx, habit.id, '🏃', false);
    const res = await cliIcon(ctx, habit.id, undefined, true);
    expect(res.ok).toBe(true);
    expect(getHabit().icon).toBeUndefined();
  });
});

describe('habit note', () => {
  it('sets a note', async () => {
    const habit = getHabit();
    const res = await cliNote(ctx, habit.id, 'Do it daily', false);
    expect(res.ok).toBe(true);
    expect(getHabit().note).toBe('Do it daily');
  });

  it('clears a note with --clear', async () => {
    const habit = getHabit();
    await cliNote(ctx, habit.id, 'Do it daily', false);
    const res = await cliNote(ctx, habit.id, undefined, true);
    expect(res.ok).toBe(true);
    expect(getHabit().note).toBeUndefined();
  });

  it('clears when setting empty text', async () => {
    const habit = getHabit();
    await cliNote(ctx, habit.id, 'some note', false);
    const res = await cliNote(ctx, habit.id, '   ', false);
    expect(res.ok).toBe(true);
    expect(getHabit().note).toBeUndefined();
  });
});

describe('habit schedule', () => {
  it('sets a daily schedule', async () => {
    const habit = getHabit();
    const res = await cliSchedule(ctx, habit.id, 'daily', undefined, '09:00', undefined, undefined);
    expect(res.ok).toBe(true);
    const h = getHabit();
    expect(h.schedule).toBeDefined();
    expect(h.schedule.kind).toBe('daily');
    expect(h.schedule.timeOfDay).toBe('09:00');
  });

  it('sets a weekdays schedule', async () => {
    const habit = getHabit();
    const res = await cliSchedule(ctx, habit.id, 'weekdays', undefined, '08:30', 30, undefined);
    expect(res.ok).toBe(true);
    const h = getHabit();
    expect(h.schedule.kind).toBe('weekdays');
    expect(h.schedule.durationMin).toBe(30);
  });

  it('sets a weekly schedule', async () => {
    const habit = getHabit();
    const res = await cliSchedule(ctx, habit.id, 'weekly', [1, 3, 5], '07:00', undefined, undefined);
    expect(res.ok).toBe(true);
    const h = getHabit();
    expect(h.schedule.kind).toBe('weekly');
    expect(h.schedule.days).toEqual([1, 3, 5]);
  });

  it('rejects invalid --at time', async () => {
    const habit = getHabit();
    const res = await cliSchedule(ctx, habit.id, 'daily', undefined, '25:00', undefined, undefined);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/invalid --at/);
  });

  it('rejects when invalidDays is set (bad CSV from parser)', async () => {
    const habit = getHabit();
    const res = await cliSchedule(ctx, habit.id, 'weekly', undefined, '09:00', undefined, 'mon');
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/invalid --days/);
  });

  it('rejects when invalidDays is set for trailing comma', async () => {
    const habit = getHabit();
    const res = await cliSchedule(ctx, habit.id, 'weekly', undefined, '09:00', undefined, '');
    // empty invalidDays token
    expect(res.ok).toBe(false);
  });
});

describe('habit unschedule', () => {
  it('removes a schedule', async () => {
    const habit = getHabit();
    await cliSchedule(ctx, habit.id, 'daily', undefined, '09:00', undefined, undefined);
    expect(getHabit().schedule).toBeDefined();
    const res = await cliUnschedule(ctx, habit.id);
    expect(res.ok).toBe(true);
    expect(getHabit().schedule).toBeUndefined();
  });
});

describe('habit archive', () => {
  it('archives a habit', async () => {
    const habit = getHabit();
    const res = await cliArchive(ctx, habit.id);
    expect(res.ok).toBe(true);
    expect(getHabit().archived).toBe(true);
  });

  it('is idempotent', async () => {
    const habit = getHabit();
    await cliArchive(ctx, habit.id);
    const res = await cliArchive(ctx, habit.id);
    expect(res.ok).toBe(true);
    expect(getHabit().archived).toBe(true);
  });
});

describe('habit show', () => {
  it('shows habit detail in text form', async () => {
    const habit = getHabit();
    const res = await cliShow(ctx, habit.id, false);
    expect(res.ok).toBe(true);
    expect(res.message).toContain('Exercise');
    expect(res.message).toContain('streak');
  });

  it('shows habit detail as JSON', async () => {
    const habit = getHabit();
    const res = await cliShow(ctx, habit.id, true);
    expect(res.ok).toBe(true);
    const data = JSON.parse(res.message ?? '{}');
    expect(data.id).toBe(habit.id);
    expect(data.name).toBe('Exercise');
    expect(typeof data.streak).toBe('number');
    expect(typeof data.logCount).toBe('number');
  });

  it('includes schedule in JSON when set', async () => {
    const habit = getHabit();
    await cliSchedule(ctx, habit.id, 'daily', undefined, '09:00', undefined, undefined);
    const res = await cliShow(ctx, habit.id, true);
    const data = JSON.parse(res.message ?? '{}');
    expect(data.schedule).toBeDefined();
    expect(data.schedule.kind).toBe('daily');
  });
});
