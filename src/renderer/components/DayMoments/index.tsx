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
  shouldShowRecap, shouldShowWeek, weekHeadline, weekSummary, ymdOf,
  type DaySummary, type Seen, type WeekSummary,
} from '../../store/dayRecap';
import { activeTour } from '../Tour/TourHost';
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
    if (!board || activeTour()) return;
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
    const line = morningLine(daySummary(board, addDays(today, -1)), today, seen, boardHasHistory(board));
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
        <div
          role="status"
          data-testid="morning-line"
          style={{
            position: 'fixed', left: '50%', top: 56, transform: 'translateX(-50%)', zIndex: Z.notice,
            display: 'flex', alignItems: 'center', gap: 10, maxWidth: 'calc(100vw - 32px)',
            padding: '6px 6px 6px 14px', borderRadius: 999,
            background: 'var(--node-bg)', border: '1px solid var(--paper-3)', boxShadow: 'var(--shadow-1)',
            fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--ink)',
          }}
        >
          <span style={{ color: 'var(--acid-ink, var(--acid))' }}>◆</span>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>good morning · {morning}</span>
          <button
            type="button"
            aria-label="Dismiss"
            data-testid="morning-line-close"
            onClick={() => setMorning(null)}
            style={{ all: 'unset', cursor: 'pointer', width: 24, height: 24, display: 'grid', placeItems: 'center', color: 'var(--ink-3)', borderRadius: 999 }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      )}
      {card && createPortal(
        <div
          data-testid="day-moment-backdrop"
          onClick={() => setCard(null)}
          style={{ position: 'fixed', inset: 0, zIndex: Z.modal, background: 'rgba(0,0,0,0.45)', display: 'grid', placeItems: 'center' }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={card.kind === 'day' ? 'Day recap' : 'Last week'}
            data-testid={card.kind === 'day' ? 'day-recap' : 'week-recap'}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 400, maxWidth: '90vw', boxSizing: 'border-box', padding: 22, borderRadius: 14,
              background: 'var(--node-bg)', border: '1px solid var(--paper-3)', boxShadow: 'var(--shadow-2)',
              color: 'var(--ink)', fontFamily: 'var(--font-mono)', display: 'flex', flexDirection: 'column', gap: 16,
            }}
          >
            {card.kind === 'day' ? <DayCard day={card.day} /> : <WeekCard week={card.week} />}
            <button
              type="button"
              data-testid="day-moment-close"
              onClick={() => setCard(null)}
              autoFocus
              style={{
                alignSelf: 'flex-start', padding: '9px 16px', borderRadius: 6, cursor: 'pointer',
                border: '1px solid var(--btn-primary-ring)', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-fg)',
                fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
              }}
            >
              {card.kind === 'day' ? 'GOOD NIGHT' : 'START THE WEEK'}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

const LAB = { fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-3)' } as const;

function DayCard({ day }: { day: DaySummary }) {
  const plan = day.plannedMin;
  const scale = Math.max(plan, day.focusMin, 1);
  const date = new Date(`${day.date}T00:00:00`).toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short' }).toLowerCase();
  return (
    <>
      <div style={{ ...LAB, color: 'var(--acid-ink, var(--acid))' }}>◆ day complete · {date}</div>
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 30, lineHeight: 1.1 }}>{dayHeadline(day)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
        <div><div style={{ fontSize: 22 }}>{day.planned > 0 ? `${day.plannedDone}/${day.planned}` : day.done}</div><div style={LAB}>{day.planned > 0 ? 'planned done' : 'tasks'}</div></div>
        <div><div style={{ fontSize: 22 }}>{fmtMinutes(day.focusMin)}</div><div style={LAB}>recorded</div></div>
        <div><div style={{ fontSize: 22 }}>{day.topStreak ? `▲ ${day.topStreak.streak}` : '—'}</div><div style={LAB}>{day.topStreak ? day.topStreak.label : 'streak'}</div></div>
      </div>
      {plan > 0 && (
        <div data-testid="day-recap-bars">
          <div style={{ ...LAB, marginBottom: 6 }}>plan {fmtMinutes(plan)} · real {fmtMinutes(day.focusMin)}</div>
          <div style={{ height: 8, background: 'var(--paper-3)', borderRadius: 4 }}><div style={{ height: 8, width: `${(plan / scale) * 100}%`, background: 'var(--ink-3)', borderRadius: 4 }} /></div>
          <div style={{ height: 8, marginTop: 4, background: 'var(--paper-3)', borderRadius: 4 }}><div style={{ height: 8, width: `${(day.focusMin / scale) * 100}%`, background: 'var(--acid)', borderRadius: 4 }} /></div>
        </div>
      )}
    </>
  );
}

function WeekCard({ week }: { week: WeekSummary }) {
  const max = Math.max(1, ...week.days.map((d) => d.done * 30 + d.focusMin));
  const fmt = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString('en', { day: 'numeric', month: 'short' }).toLowerCase();
  return (
    <>
      <div style={{ ...LAB, color: 'var(--acid-ink, var(--acid))' }}>◆ last week · {fmt(week.start)} – {fmt(week.end)}</div>
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 28, lineHeight: 1.1 }}>{weekHeadline(week)}</div>
      <div data-testid="week-recap-bars" style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 90 }}>
        {week.days.map((d) => {
          const h = Math.max(4, Math.round(((d.done * 30 + d.focusMin) / max) * 76));
          const best = d.date === week.bestDay;
          const dow = new Date(`${d.date}T00:00:00`).toLocaleDateString('en', { weekday: 'narrow' }).toLowerCase();
          return (
            <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }} title={`${d.done} done · ${fmtMinutes(d.focusMin)}`}>
              <div style={{ width: '100%', height: h, background: best ? 'var(--acid)' : 'var(--ink-4)', borderRadius: 3 }} />
              <span style={LAB}>{dow}</span>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>fresh week · nothing carried as debt</div>
    </>
  );
}
