/** "Line them up" (calendar-clock-visuals.md F28) — the pure planner the shelf and `krnl cal lineup` share. */
import { describe, it, expect } from 'vitest';
import { lineUp, toLocalMinuteISO } from '../../../src/renderer/components/nodes/CalendarNode/lineUp';

const at = (iso: string) => new Date(iso).getTime();

describe('lineUp', () => {
  it('puts plans back to back in start order; the first keeps its start', () => {
    const moves = lineUp([
      { taskId: 'email', startMs: at('2026-11-08T14:00'), lengthMin: 20 },
      { taskId: 'rent', startMs: at('2026-11-08T14:00'), lengthMin: 20 },
      { taskId: 'plan', startMs: at('2026-11-08T14:05'), lengthMin: 30 },
    ]);
    expect(moves).toEqual([
      { taskId: 'rent', scheduledFor: '2026-11-08T14:20' },
      { taskId: 'plan', scheduledFor: '2026-11-08T14:40' },
    ]);
  });

  it('on a tie the shorter plan goes first, then by id (stable)', () => {
    const moves = lineUp([
      { taskId: 'long', startMs: at('2026-11-08T09:00'), lengthMin: 60 },
      { taskId: 'short', startMs: at('2026-11-08T09:00'), lengthMin: 15 },
    ]);
    expect(moves).toEqual([{ taskId: 'long', scheduledFor: '2026-11-08T09:15' }]);
  });

  it('never puts a plan in the past: the run starts at now, rounded up to 5 minutes', () => {
    const moves = lineUp([
      { taskId: 'a', startMs: at('2026-11-08T09:00'), lengthMin: 30 },
      { taskId: 'b', startMs: at('2026-11-08T09:00'), lengthMin: 30 },
    ], at('2026-11-08T09:12'));
    expect(moves).toEqual([
      { taskId: 'a', scheduledFor: '2026-11-08T09:15' },
      { taskId: 'b', scheduledFor: '2026-11-08T09:45' },
    ]);
  });

  it('nothing to do for fewer than two plans, or when already lined up', () => {
    expect(lineUp([{ taskId: 'a', startMs: at('2026-11-08T09:00'), lengthMin: 30 }])).toEqual([]);
    expect(lineUp([
      { taskId: 'a', startMs: at('2026-11-08T09:00'), lengthMin: 30 },
      { taskId: 'b', startMs: at('2026-11-08T09:30'), lengthMin: 30 },
    ])).toEqual([]);
  });

  it('runs across midnight into the next day', () => {
    const moves = lineUp([
      { taskId: 'a', startMs: at('2026-11-08T23:30'), lengthMin: 45 },
      { taskId: 'b', startMs: at('2026-11-08T23:30'), lengthMin: 45 },
    ]);
    expect(moves).toEqual([{ taskId: 'b', scheduledFor: '2026-11-09T00:15' }]);
    expect(toLocalMinuteISO(at('2026-01-02T03:04'))).toBe('2026-01-02T03:04');
  });
});
