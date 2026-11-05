/** #207 — time-log views: app markers, task timeline, heatmap ranges, history wipe. */
import { describe, it, expect } from 'vitest';
import { appMarkersFrom } from '../../../src/renderer/store/appSessions';
import { taskTimeline } from '../../../src/renderer/components/ui/TaskTimeline';
import { rangeOf } from '../../../src/renderer/components/nodes/AnalyticsNode/TimeLogHeatmap';
import { foldTimeLog, type TimeLogEntry } from '../../../src/shared/timelog';

const iso = (d: number, h: number, m = 0): string => new Date(2026, 10, d, h, m).toISOString();
let n = 0;
const e = (at: string, body: Record<string, unknown>): TimeLogEntry => ({ v: 1, id: `e${++n}`, at, ...body } as unknown as TimeLogEntry);
const span = (id: string, d: number, h1: number, h2: number, taskId: string | null, text: string): TimeLogEntry =>
  e(iso(d, h2), { type: 'span.closed', spanId: id, taskId, taskText: text, tag: null, kind: 'work', startedAt: iso(d, h1), endedAt: iso(d, h2) });

describe('appMarkersFrom', () => {
  it('keeps open/close lines inside the day range, in time order', () => {
    const m = appMarkersFrom([
      e(iso(5, 18), { type: 'app.closed' }),
      e(iso(5, 9), { type: 'app.opened' }),
      e(iso(4, 9), { type: 'app.opened' }),
      span('s', 5, 10, 11, null, 'x'),
    ], '2026-11-05', '2026-11-05', new Date(2026, 10, 6, 9).getTime());
    expect(m.map((x) => x.kind)).toEqual(['open', 'close']);
    // While that day is still today, only the first start shows.
    const today = appMarkersFrom([e(iso(5, 9), { type: 'app.opened' }), e(iso(5, 12), { type: 'app.closed' }), e(iso(5, 13), { type: 'app.opened' })],
      '2026-11-05', '2026-11-05', new Date(2026, 10, 5, 15).getTime());
    expect(today.map((x) => x.kind)).toEqual(['open']);
  });
});

describe('taskTimeline', () => {
  it('lists work per day, the latest plan with its moves, and every completion', () => {
    const entries = [
      span('a', 3, 9, 11, 't1', 'build cluster'),
      span('b', 4, 9, 10, 't1', 'build cluster'),
      e(iso(2, 20), { type: 'plan.set', taskId: 't1', taskText: 'build cluster', start: '2026-11-03T09:00', durationMin: 120 }),
      e(iso(3, 8), { type: 'plan.set', taskId: 't1', taskText: 'build cluster', start: '2026-11-04T09:00', durationMin: 120 }),
      e(iso(4, 12), { type: 'task.completed', taskId: 't1', taskText: 'build cluster', tag: null, plannedMin: 120 }),
    ];
    const items = taskTimeline(foldTimeLog(entries, { fromYMD: '2026-11-01', toYMD: '2026-11-05' }), 't1');
    const text = items.map((i) => i.text).join(' | ');
    expect(text).toMatch(/2h/);
    expect(text).toMatch(/1h/);
    expect(text).toMatch(/moved 1×/);
    expect(items.filter((i) => i.tone === 'done')).toHaveLength(1);
  });
});

describe('history.cleared', () => {
  it('drops spans and completions logged before the wipe', () => {
    const f = foldTimeLog([
      span('a', 3, 9, 11, 't1', 'x'),
      e(iso(3, 12), { type: 'task.completed', taskId: 't1', taskText: 'x', tag: null, plannedMin: 0 }),
      e(iso(4, 8), { type: 'history.cleared' }),
      span('b', 4, 9, 10, 't1', 'x'),
    ], { fromYMD: '2026-11-01', toYMD: '2026-11-05' });
    expect(f.totalMin).toBe(60);
    expect(f.completions).toHaveLength(0);
  });
});

describe('heatmap ranges', () => {
  it('week is Mon–Sun, month is the calendar month', () => {
    expect(rangeOf('week', new Date(2026, 10, 5))).toMatchObject({ from: '2026-11-02', to: '2026-11-08' });
    expect(rangeOf('month', new Date(2026, 10, 5))).toMatchObject({ from: '2026-11-01', to: '2026-11-30' });
  });
});
