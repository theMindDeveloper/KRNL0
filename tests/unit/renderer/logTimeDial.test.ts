/** #207 — Log-time dial helpers, week grid sizing, open-time (0) estimates. */
import { describe, it, expect } from 'vitest';
import { workSpansOfDay, gapsOfDay } from '../../../src/renderer/components/ui/LogTimeDial';
import { bestWeekGrid } from '../../../src/renderer/components/nodes/ClockNode/ClockWeek';
import { taskSetPlannedMin, taskSetDuration } from '../../../src/renderer/components/nodes/TaskNode/commands';
import type { TaskState } from '../../../src/renderer/components/nodes/TaskNode/types';
import { SysParser } from '../../../src/sys/parser';

const t = (h: number, m = 0): number => new Date(2026, 10, 5, h, m).getTime();

describe('workSpansOfDay / gapsOfDay', () => {
  const segs = [
    { startMs: t(9), endMs: t(10, 30), kind: 'work' },
    { startMs: t(10, 30), endMs: t(10, 45), kind: 'break' },
    { startMs: t(11, 15), endMs: t(12), kind: 'work' },
    { startMs: t(12, 5), endMs: t(13), kind: 'work' },
  ];
  it('keeps work spans of the day in minutes', () => {
    expect(workSpansOfDay(segs, '2026-11-05')).toEqual([
      { startMin: 540, endMin: 630 }, { startMin: 675, endMin: 720 }, { startMin: 725, endMin: 780 },
    ]);
  });
  it('finds gaps of 10+ min between sessions and up to now', () => {
    const gaps = gapsOfDay(workSpansOfDay(segs, '2026-11-05'), 15 * 60);
    expect(gaps).toEqual([{ startMin: 630, endMin: 675 }, { startMin: 780, endMin: 900 }]);
  });
});

describe('bestWeekGrid', () => {
  it('one row in a wide, short panel; a grid in a tall one', () => {
    expect(bestWeekGrid(1200, 200).cols).toBe(7);
    expect(bestWeekGrid(620, 760).cols).toBeLessThanOrEqual(3);
    expect(bestWeekGrid(620, 760).ring).toBeGreaterThan(bestWeekGrid(620, 200).ring);
  });
});

describe('estimate 0 = no set time', () => {
  const base = { plannedMin: 25, durationMin: 25, eta: '~25 min' } as unknown as TaskState;
  it('setPlannedMin(0) and setDuration(0) make the task open-ended', () => {
    expect(taskSetPlannedMin(base, { minutes: 0 }).timeOpen).toBe(true);
    expect(taskSetDuration(base, { durationMin: 0 }).timeOpen).toBe(true);
  });
  it('a real number closes it again', () => {
    const open = taskSetPlannedMin(base, { minutes: 0 });
    expect(taskSetPlannedMin(open, { minutes: 40 })).toMatchObject({ plannedMin: 40 });
    expect(taskSetPlannedMin(open, { minutes: 40 }).timeOpen).toBeUndefined();
  });
  it('krnl task duration <id> 0 parses', () => {
    expect(SysParser.parse(['task', 'duration', 'abcd', '0'])).toMatchObject({ kind: 'task', sub: 'duration', minutes: 0 });
  });
});
