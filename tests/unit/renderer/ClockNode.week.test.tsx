// @vitest-environment jsdom
/** #207 / time-log F11 — Clock Week view. */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { buildWeek, ClockWeek, wedge24 } from '../../../src/renderer/components/nodes/ClockNode/ClockWeek';
import { clockSetWeekView } from '../../../src/renderer/components/nodes/ClockNode/commands';
import type { RealitySegment } from '../../../src/renderer/store/pomoReality';
import type { ClockState } from '../../../src/renderer/components/nodes/ClockNode/types';
import { SysParser } from '../../../src/sys/parser';

const at = (ymd: string, hh: number, mm = 0): number => {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, hh, mm).getTime();
};
function seg(id: string, startMs: number, endMs: number, extra: Partial<RealitySegment> = {}): RealitySegment {
  return { id, startMs, endMs, kind: 'work', taskId: null, label: 'deep work', live: false, ...extra } as RealitySegment;
}

describe('buildWeek', () => {
  const today = '2026-11-05';
  it('returns 7 days, oldest first, today last', () => {
    const w = buildWeek(today, [], null, new Map(), [], [], false);
    expect(w.map((d) => d.ymd)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']);
    expect(w[6]!.isToday).toBe(true);
  });

  it('splits a span across midnight onto both days with the right totals', () => {
    const s = seg('a', at('2026-11-03', 22), at('2026-11-04', 1, 30));
    const w = buildWeek(today, [s], null, new Map(), [], [], false);
    const d3 = w.find((d) => d.ymd === '2026-11-03')!;
    const d4 = w.find((d) => d.ymd === '2026-11-04')!;
    expect(d3.focusMin).toBe(120);
    expect(d4.focusMin).toBe(90);
    expect(d3.spans[0]).toMatchObject({ startH: 22, endH: 24 });
    expect(d4.spans[0]).toMatchObject({ startH: 0, endH: 1.5 });
  });

  it('names the top task of the day and skips breaks in the total', () => {
    const w = buildWeek(today, [
      seg('a', at(today, 9), at(today, 10), { label: 'emails' }),
      seg('b', at(today, 10), at(today, 12), { label: 'build cluster' }),
      seg('c', at(today, 12), at(today, 13), { kind: 'break' }),
    ], null, new Map(), [], [], false);
    expect(w[6]!.focusMin).toBe(180);
    expect(w[6]!.top?.name).toBe('build cluster');
  });
});

describe('ClockWeek', () => {
  it('draws static rings (no animation) and opens a day on click', () => {
    const onPick = vi.fn();
    const week = buildWeek('2026-11-05', [seg('a', at('2026-11-05', 9), at('2026-11-05', 11))], null, new Map(), [], [], false);
    const { getByTestId, container } = render(<ClockWeek week={week} nowH={12} onPick={onPick} />);
    expect(getByTestId('clock-week-total').textContent).toContain('2h');
    expect(container.querySelectorAll('[data-testid=clock-week-now]').length).toBe(1);
    expect(container.innerHTML).not.toMatch(/animation/);
    fireEvent.click(getByTestId('clock-week-day-2026-11-03'));
    expect(onPick).toHaveBeenCalledWith('2026-11-03');
  });

  it('wedge24 covers a full day as a closed circle', () => {
    expect(wedge24(0, 24, 30)).toMatch(/Z$/);
  });
});

describe('week command + CLI', () => {
  const base = { viewWindow: 0, selectedDate: '2026-11-05' } as ClockState;
  it('toggles and leaves dial-only', () => {
    const on = clockSetWeekView({ ...base, dialOnly: true }, {});
    expect(on).toMatchObject({ weekView: true, dialOnly: false });
    expect(clockSetWeekView(on, {}).weekView).toBe(false);
    expect(clockSetWeekView(base, { on: false }).weekView).toBe(false);
  });
  it('parses krnl clock week [on|off]', () => {
    expect(SysParser.parse(['clock', 'week', 'on'])).toEqual({ kind: 'clock', sub: 'week', arg: 'on' });
    expect(SysParser.parse(['clock', 'week'])).toEqual({ kind: 'clock', sub: 'week', arg: undefined });
  });
});
