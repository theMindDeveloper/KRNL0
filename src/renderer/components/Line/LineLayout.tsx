// The Line layout (docs/06-requirements/line-layout.md): the whole app as one
// day line. The same frame on every screen: tabs and the date on top, what you
// are doing, the day, and one field at the bottom that adds anything. Only the
// middle changes (today in words, the week, habits, the board).
//
// It draws the same board as the windows and writes through the same commands,
// so switching layouts never changes data.

import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { addDaysYMD, localYMD } from '../../../shared/ymd';
import { useBoardStore } from '../../store/boardStore';
import { LINE_VIEWS, useLineLayout, type LineView } from '../../store/lineLayout';
import { LineGlyph } from '../ui/LineGlyph';
import { GapCard, PlanCard } from './Cards';
import { DayLine, LineUiContext, rangeFor, type Ghost, type LineUi } from './DayLine';
import { dayData, mondayOf, nextPlan, pomoOf, todayOf, type GapMark, type PlanMark } from './dayData';
import type { FieldIntent } from './lineActions';
import { CommandField, NowBand } from './Parts';
import { HabitsView, TodayView, WeekView } from './Views';
import './line.css';

// The canvas is only loaded when the Board page is opened.
const BoardCell = lazy(() => import('../Station/EmbeddedCanvasCell').then((m) => ({ default: m.EmbeddedCanvasCell })));

const TAB_LABEL: Record<LineView, string> = { today: 'Today', week: 'Week', habits: 'Habits', board: 'Board' };

/** The clock the layout redraws on: every 20 s, and at once when the board changes. */
function useNow(board: unknown): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 20_000);
    return () => window.clearInterval(id);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => Date.now(), [tick, board]);
}

function shiftMonth(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00`);
  return localYMD(new Date(d.getFullYear(), d.getMonth() + n, 1));
}

function rangeLabel(view: LineView, day: string): string {
  const d = new Date(`${day}T00:00:00`);
  if (view === 'habits') return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  if (view === 'week') {
    const mon = new Date(`${mondayOf(day)}T00:00:00`);
    const sun = new Date(`${addDaysYMD(mondayOf(day), 6)}T00:00:00`);
    const m = (x: Date): string => x.toLocaleDateString('en-GB', { month: 'short' });
    return mon.getMonth() === sun.getMonth() ? `${m(mon)} ${mon.getDate()} – ${sun.getDate()}` : `${m(mon)} ${mon.getDate()} – ${m(sun)} ${sun.getDate()}`;
  }
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function LineLayout() {
  const board = useBoardStore((s) => s.board);
  const view = useLineLayout((s) => s.view);
  const shape = useLineLayout((s) => s.shape);
  const setView = useLineLayout((s) => s.setView);
  const setShape = useLineLayout((s) => s.setShape);
  const setOn = useLineLayout((s) => s.setOn);
  const nowMs = useNow(board);
  const today = todayOf(nowMs);
  // The day on screen; null follows today (also past midnight).
  const [picked, setPicked] = useState<string | null>(null);
  const day = picked ?? today;
  const todayData = useMemo(() => dayData(board, today, nowMs), [board, today, nowMs]);
  const data = useMemo(() => (day === today ? todayData : dayData(board, day, nowMs)), [board, day, today, todayData, nowMs]);
  const range = useMemo(() => rangeFor([data]), [data]);
  const todayRange = useMemo(() => rangeFor([todayData]), [todayData]);
  const next = useMemo(() => nextPlan(todayData, nowMs), [todayData, nowMs]);
  const status = pomoOf(board)?.status ?? 'idle';

  const [intent, setIntent] = useState<FieldIntent>({ kind: 'empty' });
  const onIntent = useCallback((i: FieldIntent) => setIntent(i), []);
  const ghost: Ghost | null = useMemo(() => {
    if (intent.kind !== 'plan' || !intent.q.time || (intent.q.day ?? today) !== day) return null;
    const startMs = new Date(`${day}T${intent.q.time}`).getTime();
    return { startMs, endMs: startMs + (intent.q.durationMin ?? 60) * 60_000, text: intent.q.text };
  }, [intent, day, today]);

  const [planCard, setPlanCard] = useState<{ mark: PlanMark; at: { x: number; y: number } } | null>(null);
  const [gapCard, setGapCard] = useState<{ gap: GapMark; at: { x: number; y: number } } | null>(null);
  const ui = useMemo<LineUi>(() => ({
    openPlan: (mark, at) => { setGapCard(null); setPlanCard({ mark, at }); },
    openGap: (gap, at) => { setPlanCard(null); setGapCard({ gap, at }); },
  }), []);
  const closePlan = useCallback(() => setPlanCard(null), []);
  const closeGap = useCallback(() => setGapCard(null), []);

  const step = (n: number): void => setPicked(view === 'habits' ? shiftMonth(day, n) : addDaysYMD(day, view === 'week' ? 7 * n : n));
  const openDay = (d: string): void => { setPicked(d === today ? null : d); setView('today'); };
  const showsDay = view === 'today' || view === 'week';

  return (
    <LineUiContext.Provider value={ui}>
      <div className="kl" data-testid="line-layout" data-view={view} data-shape={shape}>
        <div className="kl-bar" role="navigation" aria-label="Line layout">
          <div role="tablist" aria-label="Pages" style={{ display: 'inline-flex', gap: 2 }}>
            {LINE_VIEWS.map((v) => (
              <button key={v} type="button" role="tab" className="kl-tab" aria-selected={view === v} data-testid={`line-tab-${v}`} onClick={() => setView(v)}>{TAB_LABEL[v]}</button>
            ))}
          </div>
          <span className="kl-sp" />
          {view !== 'board' && (
            <span className="kl-rng" data-testid="line-range">
              <button type="button" className="kl-ic" aria-label="Earlier" data-testid="line-prev" onClick={() => step(-1)}><LineGlyph name="chevronLeft" size={12} /></button>
              <span style={{ minWidth: 96, textAlign: 'center' }}>{rangeLabel(view, day)}</span>
              <button type="button" className="kl-ic" aria-label="Later" data-testid="line-next-range" onClick={() => step(1)}><LineGlyph name="chevron" size={12} /></button>
              {picked !== null && <button type="button" className="kl-btn kl-btn--sm" data-testid="line-today-btn" onClick={() => setPicked(null)}>Today</button>}
            </span>
          )}
          <span className="kl-sp" />
          {showsDay && (
            <span className="kl-seg" role="group" aria-label="Draw the day as">
              <button type="button" aria-pressed={shape === 'line'} data-testid="line-shape-line" onClick={() => setShape('line')}>Line</button>
              <button type="button" aria-pressed={shape === 'clock'} data-testid="line-shape-clock" onClick={() => setShape('clock')}>Clock</button>
            </span>
          )}
          <button type="button" className="kl-btn kl-btn--sm" data-testid="line-off" title="Back to the windows (Station / Free)" onClick={() => setOn(false)}>Windows</button>
        </div>

        <NowBand board={board} today={todayData} next={next} compact={view !== 'today'} />

        {(view === 'habits' || view === 'board') && (
          <div style={{ flexShrink: 0, padding: '10px 24px 12px', borderBottom: '1px solid var(--paper-3)' }}>
            <DayLine data={todayData} nowMs={nowMs} range={todayRange} size="dock" />
          </div>
        )}

        {view === 'board' ? (
          <div className="kl-body kl-body--flush" data-testid="line-board"><div style={{ flex: 1, minHeight: 0, position: 'relative' }}><Suspense fallback={null}><BoardCell /></Suspense></div></div>
        ) : (
          <div className="kl-body">
            {view === 'today' && <TodayView board={board} data={data} nowMs={nowMs} isToday={day === today} shape={shape} range={range} ghost={ghost} />}
            {view === 'week' && <WeekView board={board} day={day} nowMs={nowMs} shape={shape} onDay={openDay} />}
            {view === 'habits' && <HabitsView board={board} day={day} nowMs={nowMs} />}
          </div>
        )}

        <CommandField recording={status === 'running' || status === 'break'} onIntent={onIntent} />

        {planCard && <PlanCard mark={planCard.mark} at={planCard.at} nowMs={nowMs} onClose={closePlan} />}
        {gapCard && <GapCard gap={gapCard.gap} at={gapCard.at} onClose={closeGap} />}
      </div>
    </LineUiContext.Provider>
  );
}
