// Calendar year view — 12 mini-months that always fit the panel (no scroll).
//
// Each day cell is tinted by tracked focus minutes that day (pomo reality),
// and carries a dot when tasks are planned on it. Today is outlined. Click a
// day to open it in the day view; ‹ › step a year.

import { useMemo } from 'react';
import { useBoardStore } from '../../../store/boardStore';
import type { NodeProps } from '../types';
import type { CalendarConfig, CalendarState } from './types';
import { yearActivity } from './yearActivity';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

interface Props {
  state: CalendarState;
  onCommand: NodeProps<CalendarState, CalendarConfig>['onCommand'];
}

export function YearView({ state, onCommand }: Props) {
  const anchor = state.anchorDate ?? ymd(new Date());
  const year = Number(anchor.slice(0, 4)) || new Date().getFullYear();
  const board = useBoardStore((s) => s.board);
  const { tasks, focus } = useMemo(() => yearActivity(board, year, Date.now()), [board, year]);
  const maxFocus = Math.max(30, ...focus.values());
  const today = ymd(new Date());

  const openDay = (day: string) => {
    onCommand('calendar.setAnchor', { date: day });
    onCommand('calendar.setView', { view: 'day' });
  };
  const stepYear = (d: number) => onCommand('calendar.setAnchor', { date: `${year + d}-01-01` });

  return (
    <div data-testid="calendar-year" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '8px 10px 10px', gap: 8, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)' }}>
        <button type="button" aria-label="Previous year" onClick={() => stepYear(-1)} style={navBtn}>‹</button>
        <span data-testid="calendar-year-label" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', letterSpacing: '0.06em' }}>{year}</span>
        <button type="button" aria-label="Next year" onClick={() => stepYear(1)} style={navBtn}>›</button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 9, color: 'var(--ink-4)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: 'color-mix(in srgb, var(--acid) 70%, transparent)' }} /> focus
          <span aria-hidden style={{ width: 4, height: 4, borderRadius: 999, background: 'var(--cyan)', marginLeft: 6 }} /> planned
        </span>
      </div>

      {/* 12 months fill the panel: 4×3 when wide, 3×4 when tall — CSS grid
          with fr rows so nothing ever scrolls. */}
      <div
        style={{
          flex: 1, minHeight: 0, display: 'grid', gap: 10,
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gridAutoRows: '1fr',
        }}
      >
        {MONTHS.map((name, m) => {
          const first = new Date(year, m, 1);
          const lead = (first.getDay() + 6) % 7; // Monday-first
          const days = new Date(year, m + 1, 0).getDate();
          const cells: Array<string | null> = [...Array<null>(lead).fill(null)];
          for (let d = 1; d <= days; d++) cells.push(`${year}-${pad(m + 1)}-${pad(d)}`);
          return (
            <div key={name} data-testid={`calendar-year-month-${m + 1}`} style={{ minHeight: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 700, color: today.startsWith(`${year}-${pad(m + 1)}`) ? 'var(--acid-ink, var(--acid))' : 'var(--ink-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{name}</span>
              <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: '1fr', gap: 2 }}>
                {DOW.map((d, i) => (
                  <span key={`h${i}`} aria-hidden style={{ fontFamily: 'var(--font-mono)', fontSize: 7.5, color: 'var(--ink-4)', textAlign: 'center' }}>{d}</span>
                ))}
                {cells.map((day, i) => {
                  if (!day) return <span key={`e${i}`} />;
                  const f = focus.get(day) ?? 0;
                  const t = tasks.get(day) ?? 0;
                  const pct = f > 0 ? Math.round(18 + (f / maxFocus) * 70) : 0;
                  return (
                    <button
                      key={day}
                      type="button"
                      data-testid={`calendar-year-day-${day}`}
                      title={`${day}${f > 0 ? ` · ${Math.round(f)}m focus` : ''}${t > 0 ? ` · ${t} planned` : ''}`}
                      onClick={() => openDay(day)}
                      style={{
                        position: 'relative', minHeight: 0, padding: 0, cursor: 'pointer',
                        border: day === today ? '1px solid var(--acid)' : '1px solid transparent',
                        borderRadius: 2,
                        background: pct > 0 ? `color-mix(in srgb, var(--acid) ${pct}%, var(--paper-2))` : 'var(--paper-2)',
                        color: pct > 55 ? 'var(--ink-on-bright, #111)' : 'var(--ink-3)',
                        fontFamily: 'var(--font-mono)', fontSize: 7.5, lineHeight: 1,
                        display: 'grid', placeItems: 'center',
                      }}
                    >
                      {Number(day.slice(8))}
                      {t > 0 && (
                        <span aria-hidden style={{ position: 'absolute', right: 1, top: 1, width: 3, height: 3, borderRadius: 999, background: 'var(--cyan)' }} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const navBtn: React.CSSProperties = {
  background: 'transparent', border: '1px solid var(--paper-3)', borderRadius: 4, color: 'var(--ink-2)',
  cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1, padding: '2px 8px',
};
