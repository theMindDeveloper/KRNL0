// Calendar year view — 12 mini-months that always fit the panel (no scroll).
//
// Each day cell is tinted by tracked focus minutes that day (pomo reality),
// and carries a dot when tasks are planned on it. Today is outlined. Click a
// day to open it in the day view; ‹ › step a year.

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useBoardStore } from '../../../store/boardStore';
import { allDayOn, linksOf, nextYMD, type CalendarLink } from '../../../../shared/calsync/types';
import { calendarLayersOf } from './types';
import type { NodeProps } from '../types';
import type { CalendarConfig, CalendarState } from './types';
import { yearActivity } from './yearActivity';
import { LineGlyph } from '../../ui/LineGlyph';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const pad = (n: number) => String(n).padStart(2, '0');

/** Month label + weekday row, in px (11 px text, 3 px gaps); the label alone when the cells are too small for weekday letters. */
const MONTH_HEAD_PX = 34;
const MONTH_HEAD_SMALL_PX = 17;
/** Cells this big or bigger get the weekday letters above them. */
export const DOW_MIN_CELL = 12;
const CELL_GAP = 2;
/** The biggest day cell (a large window fills with the year, not with empty space). */
const MAX_CELL = 56;
/** Cells this big or bigger show their date. */
export const DATE_MIN_CELL = 22;
const MONTH_GAP = 14;
/** Room kept clear at each side, so the first and last month never touch (or leave) the window's edge. */
const SIDE_PAD = 12;

/**
 * The layout with the biggest square day cells that fits the box: 12 months
 * in even rows (2, 3, 4 or 6 across — never 7 + 5), six week rows each. The
 * result always fits: a cell is never rounded up past the room there is.
 */
export function yearLayout(w: number, h: number): { cols: number; cell: number } {
  let best = { cols: 4, cell: 0 };
  const room = Math.max(0, w - SIDE_PAD * 2);
  for (const cols of [2, 3, 4, 6]) {
    const rows = 12 / cols;
    const byW = ((room - MONTH_GAP * (cols - 1)) / cols - CELL_GAP * 6) / 7;
    const byHWith = (head: number) => ((h - MONTH_GAP * (rows - 1)) / rows - head - CELL_GAP * 5) / 6;
    // Decision 60 — the months grow to fill the window (the old 28 px cap
    // left a big Calendar mostly empty); dates show in the days once they fit.
    let cell = Math.floor(Math.min(byW, byHWith(MONTH_HEAD_PX), MAX_CELL));
    // Too small for weekday letters: they are not drawn, so the months get that room.
    if (cell < DOW_MIN_CELL) cell = Math.min(DOW_MIN_CELL - 1, Math.floor(Math.min(byW, byHWith(MONTH_HEAD_SMALL_PX), MAX_CELL)));
    if (cell > best.cell) best = { cols, cell };
  }
  return { cols: best.cols, cell: Math.max(3, best.cell) };
}
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
  // Decision 64 — days with events from other calendars (Google, iCloud, links).
  const calendarLinksRaw = (board as { calendarLinks?: unknown } | null)?.calendarLinks;
  const linkedOn = calendarLayersOf(state).linked;
  const linked = useMemo(() => {
    const map = new Map<string, { n: number; link: CalendarLink }>();
    if (!linkedOn) return map;
    const y0 = `${year}-01-01`;
    const y1 = `${year}-12-31`;
    for (const link of linksOf({ calendarLinks: calendarLinksRaw }).filter((l) => l.on)) {
      for (const ev of link.events) {
        if (ev.start.slice(0, 10) > y1) break;
        if (ev.allDay) {
          for (let d = ev.start; d < ev.end && d <= y1; d = nextYMD(d)) if (d >= y0 && allDayOn(ev, d)) { const cur = map.get(d); map.set(d, { n: (cur?.n ?? 0) + 1, link: cur?.link ?? link }); }
          continue;
        }
        const d = ev.start.slice(0, 10);
        if (d < y0) continue;
        const cur = map.get(d);
        map.set(d, { n: (cur?.n ?? 0) + 1, link: cur?.link ?? link });
      }
    }
    return map;
  }, [calendarLinksRaw, linkedOn, year]);
  const linkedNames = useMemo(() => [...new Set([...linked.values()].map((v) => v.link.name))], [linked]);
  const today = ymd(new Date());
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState({ cols: 6, cell: 16 });
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        const next = yearLayout(el.clientWidth, el.clientHeight);
        setFit((f) => (f.cols === next.cols && f.cell === next.cell ? f : next));
      }
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const openDay = (day: string) => {
    onCommand('calendar.setAnchor', { date: day });
    onCommand('calendar.setView', { view: 'day' });
  };
  const stepYear = (d: number) => onCommand('calendar.setAnchor', { date: `${year + d}-01-01` });

  return (
    <div data-testid="calendar-year" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0 0 8px', gap: 8, overflow: 'hidden' }}>
      {/* window-frame.md — the standard time row. */}
      <div className="kw-range">
        {/* The same row as the week and month: earlier at the left, the label in the middle, later at the right. */}
        <button type="button" className="kw-btn" aria-label="Previous year" onClick={() => stepYear(-1)}><LineGlyph name="chevronLeft" /></button>
        <div style={{ flex: 1 }} />
        <span data-testid="calendar-year-label" className="kw-range__label" style={{ color: 'var(--ink)', fontWeight: 600 }}>{year}</span>
        <button type="button" className="kw-btn" data-testid="calendar-year-today" disabled={year === new Date().getFullYear()} onClick={() => onCommand('calendar.setAnchor', { date: today })}>Today</button>
        <div style={{ flex: 1 }} />
        <button type="button" className="kw-btn" aria-label="Next year" onClick={() => stepYear(1)}><LineGlyph name="chevron" /></button>
      </div>

      {/* 12 months in even rows (2, 3, 4 or 6 across by width — container
          query in reactflow-theme.css), square day cells, centred. */}
      <div ref={wrapRef} data-testid="calendar-year-fit" data-cols={fit.cols} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'safe center', alignItems: 'center', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${fit.cols}, ${fit.cell * 7 + CELL_GAP * 6}px)`, columnGap: MONTH_GAP, rowGap: MONTH_GAP, justifyContent: 'center' }}>
        {MONTHS.map((name, m) => {
          const first = new Date(year, m, 1);
          const lead = (first.getDay() + 6) % 7; // Monday-first
          const days = new Date(year, m + 1, 0).getDate();
          const cells: Array<string | null> = [...Array<null>(lead).fill(null)];
          for (let d = 1; d <= days; d++) cells.push(`${year}-${pad(m + 1)}-${pad(d)}`);
          return (
            <div key={name} data-testid={`calendar-year-month-${m + 1}`} style={{ minHeight: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: fit.cell >= 34 ? 13 : 11, fontWeight: 700, color: today.startsWith(`${year}-${pad(m + 1)}`) ? 'var(--acid-ink, var(--acid))' : 'var(--ink-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{name}</span>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(7, ${fit.cell}px)`, gridAutoRows: 'auto', alignContent: 'start', gap: CELL_GAP }}>
                {fit.cell >= DOW_MIN_CELL && DOW.map((d, i) => (
                  <span key={`h${i}`} aria-hidden style={{ fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1, color: 'var(--ink-3)', textAlign: 'center' }}>{d}</span>
                ))}
                {cells.map((day, i) => {
                  if (!day) return <span key={`e${i}`} />;
                  const f = focus.get(day) ?? 0;
                  const t = tasks.get(day) ?? 0;
                  const pct = f > 0 ? Math.round(18 + (f / maxFocus) * 70) : 0;
                  const lk = linked.get(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      data-testid={`calendar-year-day-${day}`}
                      title={`${day}${f > 0 ? ` · ${Math.round(f)}m focus` : ''}${t > 0 ? ` · ${t} planned` : ''}${lk ? ` · ${lk.n} from ${lk.link.name}` : ''}`}
                      onClick={() => openDay(day)}
                      style={{
                        position: 'relative', minHeight: 0, padding: 0, cursor: 'pointer', aspectRatio: '1 / 1',
                        border: day === today ? '1px solid var(--acid)' : lk ? `1px solid color-mix(in srgb, var(--${lk.link.color}) 80%, transparent)` : '1px solid transparent',
                        borderRadius: fit.cell >= 34 ? 6 : 2,
                        // An empty day is one clear shade above the window, so the month's shape reads.
                        background: pct > 0 ? `color-mix(in srgb, var(--acid) ${pct}%, var(--paper-3))` : 'var(--paper-3)',
                        // A heat map: no numbers in the cells (too small to read at
                        // any year size); the date and minutes are in the tooltip.
                      }}
                      aria-label={`${day}${f > 0 ? `, ${Math.round(f)} minutes focus` : ''}${t > 0 ? `, ${t} planned` : ''}${lk ? `, ${lk.n} from ${lk.link.name}` : ''}`}
                    >
                      {fit.cell >= DATE_MIN_CELL && (
                        <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)', textAlign: 'center', fontFamily: 'var(--font-read, var(--font-sans))', fontSize: Math.round(Math.min(14, fit.cell * 0.36)), fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: pct > 45 ? 'var(--ink-on-bright, #111)' : day < today ? 'var(--ink-3)' : 'var(--ink-2)', pointerEvents: 'none' }}>{Number(day.slice(8))}</span>
                      )}
                      {lk && (
                        <span aria-hidden data-testid={`calendar-year-linked-${day}`} style={{ position: 'absolute', left: 2, bottom: 2, width: fit.cell >= 34 ? 5 : 3, height: fit.cell >= 34 ? 5 : 3, borderRadius: 999, background: `var(--${lk.link.color})` }} />
                      )}
                      {t > 0 && (
                        <span aria-hidden style={{ position: 'absolute', right: 2, top: 2, width: fit.cell >= 34 ? 5 : 3, height: fit.cell >= 34 ? 5 : 3, borderRadius: 999, background: 'var(--cyan)' }} />
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
      {/* What the colours mean: one quiet line under the months. */}
      <div data-testid="calendar-year-legend" style={{ flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, fontFamily: 'var(--font-read)', fontSize: 12, color: 'var(--ink-3)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span aria-hidden style={{ width: 9, height: 9, borderRadius: 2, background: 'color-mix(in srgb, var(--acid) 70%, var(--paper-3))' }} />time recorded</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span aria-hidden style={{ width: 5, height: 5, borderRadius: 999, background: 'var(--cyan)' }} />something planned</span>
        {linkedNames.length > 0 && (
          <span data-testid="calendar-year-legend-linked" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span aria-hidden style={{ width: 9, height: 9, boxSizing: 'border-box', borderRadius: 2, border: `1px solid var(--${[...linked.values()][0]!.link.color})` }} />from {linkedNames.length === 1 ? linkedNames[0] : 'your other calendars'}</span>
        )}
      </div>
    </div>
  );
}
