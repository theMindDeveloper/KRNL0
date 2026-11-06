// Close the day (docs/06-requirements/engagement.md F8–F11). Mounted once
// (App). Checks every minute; never shows over a running tour, and each card
// shows once (per day, per week), remembered in localStorage.
//   · Day recap card — today's planned tasks all done, or from 21:00.
//   · Morning line — first open of a day: "yesterday: 4 done · 3h 10m".
//   · Monday look-back — first open on a Monday: last week, day by day.

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBoardStore } from '../../store/boardStore';
import { addDays } from '../../analytics/dateRange';
import { fmtMinutes } from '../../analytics/summary';
import {
  boardHasHistory, dayHeadline, daySummary, DAY_MOMENTS_KEY, mondayOf, morningLine, parseSeen,
  shouldShowRecap, shouldShowWeek, weekSummary, ymdOf,
  type DaySummary, type Seen, type WeekSummary,
} from '../../store/dayRecap';
import { activeTour } from '../Tour/TourHost';
import { launchDialogOpen, welcomedThisRun } from '../../launch/launchStore';
import { uiSounds } from '../../sfx/uiSounds';
import { Z } from '../ui/layers';

export const RECAP_SHOW_EVENT = 'krnl:recap-show';
export const WEEK_SHOW_EVENT = 'krnl:week-show';
export const MORNING_SHOW_EVENT = 'krnl:morning-show';
export const DAY_MOMENT_CLOSE_EVENT = 'krnl:day-moment-close';

function readSeen(): Seen {
  try { return parseSeen(localStorage.getItem(DAY_MOMENTS_KEY)); } catch { return {}; }
}
function markSeen(patch: Seen): void {
  try { localStorage.setItem(DAY_MOMENTS_KEY, JSON.stringify({ ...readSeen(), ...patch })); } catch { /* no storage */ }
}

type Card = { kind: 'day'; day: DaySummary } | { kind: 'week'; week: WeekSummary } | null;

export function DayMoments() {
  const [card, setCard] = useState<Card>(null);
  const [morning, setMorning] = useState<string | null>(null);

  const check = useCallback(() => {
    const board = useBoardStore.getState().board;
    if (!board || activeTour() || launchDialogOpen()) return;
    const now = Date.now();
    const today = ymdOf(now);
    const seen = readSeen();
    const lastWeek = weekSummary(board, addDays(mondayOf(today), -7));
    if (shouldShowWeek(today, lastWeek, seen)) {
      markSeen({ week: today, morning: today });
      setMorning(null);
      setCard({ kind: 'week', week: lastWeek });
      return;
    }
    const day = daySummary(board, today);
    if (shouldShowRecap(day, now, seen)) {
      markSeen({ recap: today });
      setCard({ kind: 'day', day });
      uiSounds.play('sessionDone');
      return;
    }
    const line = welcomedThisRun() ? null : morningLine(daySummary(board, addDays(today, -1)), today, seen, boardHasHistory(board));
    if (line) {
      markSeen({ morning: today });
      setMorning(line);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(check, 2500);
    const t = setInterval(check, 60_000);
    const showDay = () => { const b = useBoardStore.getState().board; if (b) setCard({ kind: 'day', day: daySummary(b, ymdOf(Date.now())) }); };
    const showWeek = () => { const b = useBoardStore.getState().board; if (b) setCard({ kind: 'week', week: weekSummary(b, addDays(mondayOf(ymdOf(Date.now())), -7)) }); };
    // The What's new tour shows the morning line and closes the card on cue.
    const showMorning = () => {
      const b = useBoardStore.getState().board;
      if (!b) return;
      const today = ymdOf(Date.now());
      setCard(null);
      setMorning(morningLine(daySummary(b, addDays(today, -1)), today, {}, true));
    };
    const close = () => setCard(null);
    window.addEventListener(RECAP_SHOW_EVENT, showDay);
    window.addEventListener(WEEK_SHOW_EVENT, showWeek);
    window.addEventListener(MORNING_SHOW_EVENT, showMorning);
    window.addEventListener(DAY_MOMENT_CLOSE_EVENT, close);
    return () => {
      clearTimeout(first); clearInterval(t);
      window.removeEventListener(RECAP_SHOW_EVENT, showDay);
      window.removeEventListener(WEEK_SHOW_EVENT, showWeek);
      window.removeEventListener(MORNING_SHOW_EVENT, showMorning);
      window.removeEventListener(DAY_MOMENT_CLOSE_EVENT, close);
    };
  }, [check]);

  // The morning line goes away with the first change to the board.
  const board = useBoardStore((s) => s.board);
  const [morningBoard, setMorningBoard] = useState<typeof board>(null);
  useEffect(() => { if (morning) setMorningBoard(useBoardStore.getState().board); }, [morning]);
  useEffect(() => { if (morning && morningBoard && board !== morningBoard) setMorning(null); }, [board, morning, morningBoard]);

  // Escape closes the card.
  useEffect(() => {
    if (!card) return;
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape') setCard(null); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [card]);

  return (
    <>
      {morning && !card && (
        <div role="status" data-testid="morning-line" className="dm-morning" style={{ zIndex: Z.notice }}>
          <span className="dm-morning__sun" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
          </span>
          <span className="dm-morning__text"><b>Good morning.</b> {morning}</span>
          <button type="button" aria-label="Dismiss" data-testid="morning-line-close" className="dm-morning__close" onClick={() => setMorning(null)}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      )}
      {card && createPortal(
        <div data-testid="day-moment-backdrop" className="ln-scrim" onClick={() => setCard(null)} style={{ zIndex: Z.modal }}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={card.kind === 'day' ? 'Day recap' : 'Last week'}
            data-testid={card.kind === 'day' ? 'day-recap' : 'week-recap'}
            onClick={(e) => e.stopPropagation()}
            className="ln-dialog dm-card"
          >
            {card.kind === 'day' ? <DayCard day={card.day} /> : <WeekCard week={card.week} />}
            <footer className="dm-foot">
              <span className="ln-meta">
                {card.kind === 'day' ? 'Tomorrow starts fresh. See you then.' : 'A fresh week. Nothing carries over as debt.'}
              </span>
              <button type="button" data-testid="day-moment-close" className="ln-btn ln-btn--sm ln-btn--primary" onClick={() => setCard(null)}>
                {card.kind === 'day' ? 'Good night' : 'Start the week'}
              </button>
            </footer>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

const longDate = (ymd: string, opts: Intl.DateTimeFormatOptions) => new Date(`${ymd}T00:00:00`).toLocaleDateString('en-GB', opts);

/** How the day went against its plan, in plain words and without blame. */
function planVerdict(plan: number, real: number): string {
  const d = real - plan;
  if (Math.abs(d) <= Math.max(5, plan * 0.1)) return 'right on plan';
  return d > 0 ? `${fmtMinutes(d)} more than planned` : `${fmtMinutes(-d)} less than planned`;
}

function Ring({ done, total }: { done: number; total: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const f = total > 0 ? Math.min(1, done / total) : 1;
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden className="dm-ring">
      <circle cx="42" cy="42" r={r} fill="none" stroke="var(--paper-3)" strokeWidth="7" />
      <circle cx="42" cy="42" r={r} fill="none" stroke="var(--acid)" strokeWidth="7" strokeLinecap="round"
        strokeDasharray={`${(c * f).toFixed(1)} ${c.toFixed(1)}`} transform="rotate(-90 42 42)" />
    </svg>
  );
}

function DayCard({ day }: { day: DaySummary }) {
  const plan = day.plannedMin;
  const scale = Math.max(plan, day.focusMin, 1) * 1.08;
  const hasPlan = day.planned > 0;
  return (
    <>
      <header className="dm-head">
        <span className="ln-label dm-kicker"><i aria-hidden />Day complete · {longDate(day.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
        <h2 className="ln-display dm-title">{dayHeadline(day)}</h2>
      </header>

      <div className="dm-grid">
        <div className="dm-tile dm-tile--ring">
          <div className="dm-ring-wrap">
            <Ring done={hasPlan ? day.plannedDone : day.done} total={hasPlan ? day.planned : Math.max(1, day.done)} />
            <span className="dm-ring__num">{hasPlan ? `${day.plannedDone}/${day.planned}` : day.done}</span>
          </div>
          <span className="ln-label">{hasPlan ? 'planned, done' : 'tasks done'}</span>
        </div>
        <div className="dm-stack">
          <div className="dm-tile">
            <span className="ln-label">Recorded</span>
            <span className="dm-num">{fmtMinutes(day.focusMin)}</span>
          </div>
          <div className="dm-tile">
            <span className="ln-label">{day.topStreak ? day.topStreak.label : 'Streak'}</span>
            <span className="dm-num">{day.topStreak ? <><span className="dm-up">▲</span> {day.topStreak.streak} days</> : '—'}</span>
          </div>
        </div>
      </div>

      {plan > 0 && (
        <div data-testid="day-recap-bars" className="dm-meter">
          <div className="dm-meter__track">
            <span className="dm-meter__fill" style={{ width: `${(day.focusMin / scale) * 100}%` }} />
            <span className="dm-meter__plan" style={{ left: `${(plan / scale) * 100}%` }} title={`Planned ${fmtMinutes(plan)}`} />
          </div>
          <div className="dm-meter__legend">
            <span><i className="dm-key dm-key--real" />recorded {fmtMinutes(day.focusMin)}</span>
            <span><i className="dm-key dm-key--plan" />planned {fmtMinutes(plan)}</span>
            <span className="dm-meter__verdict">{planVerdict(plan, day.focusMin)}</span>
          </div>
        </div>
      )}
    </>
  );
}

function WeekCard({ week }: { week: WeekSummary }) {
  const max = Math.max(1, ...week.days.map((d) => d.focusMin));
  const activeDays = week.days.filter((d) => d.done > 0 || d.focusMin > 0).length;
  const best = week.bestDay ? longDate(week.bestDay, { weekday: 'long' }) : null;
  return (
    <>
      <header className="dm-head">
        <span className="ln-label dm-kicker"><i aria-hidden />Last week · {longDate(week.start, { day: 'numeric', month: 'short' })} – {longDate(week.end, { day: 'numeric', month: 'short' })}</span>
        <h2 className="ln-display dm-title">{week.done} done, {fmtMinutes(week.focusMin)} focused.</h2>
        {best && <p className="ln-body" style={{ margin: 0 }}>Your best day was <b style={{ color: 'var(--ink)' }}>{best}</b>.</p>}
      </header>

      <div data-testid="week-recap-bars" className="dm-week">
        {week.days.map((d) => {
          const h = d.focusMin > 0 ? Math.max(6, Math.round((d.focusMin / max) * 92)) : 3;
          const isBest = d.date === week.bestDay;
          return (
            <div key={d.date} className="dm-week__col" title={`${d.done} done · ${fmtMinutes(d.focusMin)}`}>
              <span className="dm-week__val">{d.focusMin > 0 ? fmtMinutes(d.focusMin) : ''}</span>
              <span className={`dm-week__bar${isBest ? ' is-best' : ''}${d.focusMin === 0 ? ' is-empty' : ''}`} style={{ height: h }} />
              <span className={`dm-week__day${isBest ? ' is-best' : ''}`}>{longDate(d.date, { weekday: 'short' }).slice(0, 2)}</span>
            </div>
          );
        })}
      </div>

      <div className="dm-row3">
        <div className="dm-tile"><span className="ln-label">Done</span><span className="dm-num">{week.done}</span></div>
        <div className="dm-tile"><span className="ln-label">Focused</span><span className="dm-num">{fmtMinutes(week.focusMin)}</span></div>
        <div className="dm-tile"><span className="ln-label">Active days</span><span className="dm-num">{activeDays} of 7</span></div>
      </div>
    </>
  );
}
