/** `sys habit streak` must honour the habit's schedule, like the HabitNode does. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { cliAdd, cliStreak, type HabitCtx } from '../../../src/sys/commands/habit';

let tmpDir = '';
let ctx: HabitCtx;

beforeEach(() => {
  // Sunday 2026-11-08, midday local time.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 8, 12, 0, 0));
  tmpDir = mkdtempSync(join(tmpdir(), 'krnl0-habit-streak-'));
  const boardPath = join(tmpDir, 'board.json');
  writeFileSync(boardPath, JSON.stringify({
    version: 1, schemaVersion: 1, viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [{ id: 'mother-habit', kind: 'habit', isMother: true, position: { x: 0, y: 0 }, state: { habits: [] }, config: { view: 'week' } }],
    edges: [],
  }), 'utf-8');
  ctx = { boardPath };
});

afterEach(() => {
  vi.useRealTimers();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('habit streak with a weekdays schedule', () => {
  it('counts Mon–Fri done as a 5-day streak on Sunday', async () => {
    await cliAdd(ctx, 'standup');
    const board = JSON.parse(readFileSync(ctx.boardPath, 'utf-8'));
    const habit = board.nodes[0].state.habits[0];
    habit.log = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'];
    habit.schedule = { kind: 'weekdays', timeOfDay: '09:00' };
    writeFileSync(ctx.boardPath, JSON.stringify(board), 'utf-8');

    const res = await cliStreak(ctx, 'standup');
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/\b5\b/);
  });
});
