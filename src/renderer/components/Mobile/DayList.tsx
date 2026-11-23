// "Your day" on the phone (Decision 56, phone-web.md F1): today's plans,
// repeating events and timed habits in time order, a line where now is, and
// the one going on now (or the next one) opened out as a card with the action
// that matters for it. Every item is shown; nothing hides behind a count.
// A row opens the Calendar on today.

import { useEffect, useMemo, useState } from 'react';
import { useBoardStore } from '../../store/boardStore';
import { useEasyMode } from '../../store/uiMode';
import { toneVarForTask } from '../../utils/taskColor';
import { makeCommandHandler } from '../Canvas/commandDispatch';
import { isObserve } from '../nodes/PomoNode/derive';
import type { PomoConfig } from '../nodes/PomoNode/types';
import { dayAgenda, hhmm, inWords, lengthWords, type AgendaItem, type DayAgenda } from './dayAgenda';

const ymdOf = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Today's agenda, kept current by the minute. */
export function useDayAgenda(): { agenda: DayAgenda; nowMin: number } {
  const board = useBoardStore((s) => s.board);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const ymd = ymdOf(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const agenda = useMemo(() => dayAgenda(board, ymd, nowMin), [board, ymd, nowMin]);
  return { agenda, nowMin };
}

export const toneOf = (it: AgendaItem): string => (it.taskId ? toneVarForTask(it.taskId) : it.color ? `var(--${it.color})` : 'var(--ink-3)');

const KIND_WORD: Record<AgendaItem['kind'], string> = { plan: 'Plan', event: 'Repeats', habit: 'Habit' };

function Check() {
  return (
    <svg className="m-icon" width={14} height={14} viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
  );
}

function meta(it: AgendaItem): string {
  const parts = [lengthWords(it.endMin - it.startMin)];
  if (it.place) parts.push(it.place);
  else if (it.kind !== 'plan') parts.push(KIND_WORD[it.kind]);
  return parts.join(' · ');
}

export function DayList({ onOpenCalendar }: { onOpenCalendar: () => void }) {
  const { agenda, nowMin } = useDayAgenda();
  const easy = useEasyMode();
  const pomo = useBoardStore((s) => s.board?.nodes.find((n) => n.isMother && n.kind === 'pomo') ?? null);
  const calendarId = useBoardStore((s) => s.board?.nodes.find((n) => n.isMother && n.kind === 'calendar')?.id ?? null);
  const observe = isObserve((pomo?.config ?? {}) as PomoConfig, easy);
  const { items, focus } = agenda;

  const focusOn = (it: AgendaItem): void => {
    if (!calendarId || !it.taskId) return;
    makeCommandHandler(calendarId)('calendar.activateTask', { taskId: it.taskId });
  };

  // Where "now" falls: before the first item still ahead (none when one is going on).
  const nowIndex = focus?.state === 'now' ? -1 : items.findIndex((it) => it.startMin > nowMin);
  const nowAt = nowIndex === -1 && focus?.state !== 'now' ? items.length : nowIndex;

  const rows: React.ReactNode[] = [];
  items.forEach((it, i) => {
    if (i === nowAt) rows.push(<NowMark key="now" nowMin={nowMin} />);
    const isFocus = focus?.item.id === it.id;
    rows.push(isFocus ? (
      <li key={it.id} className="m-day__focus" data-testid="m-day-focus" data-state={focus!.state}>
        <button type="button" className="m-day__focus-open" onClick={onOpenCalendar} aria-label={`${it.title}, ${hhmm(it.startMin)} to ${hhmm(it.endMin)}. Open the Calendar`}>
          <span className="m-day__status">
            <span className="m-dot" style={{ background: toneOf(it) }} aria-hidden="true" />
            {focus!.state === 'now' ? `Now · ${Math.max(1, it.endMin - nowMin)} min left` : `Next · ${inWords(it.startMin - nowMin)}`}
          </span>
          <span className="m-day__focus-title">{it.title}</span>
          <span className="m-day__focus-meta"><span className="m-num">{hhmm(it.startMin)}–{hhmm(it.endMin)}</span> · {meta(it)}</span>
          {focus!.state === 'now' && (
            <span className="m-day__bar" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(2, ((nowMin - it.startMin) / Math.max(1, it.endMin - it.startMin)) * 100))}%`, background: toneOf(it) }} /></span>
          )}
        </button>
        {it.kind === 'plan' && it.taskId && !easy && (
          <button type="button" className="m-btn m-btn--primary" data-testid="m-day-focus-start" onClick={() => focusOn(it)}>
            {observe ? 'Track it now' : 'Focus on it'}
          </button>
        )}
      </li>
    ) : (
      <li key={it.id} data-done={it.done ? 'true' : undefined} data-past={it.endMin <= nowMin ? 'true' : undefined}>
        <button type="button" className="m-day__row" onClick={onOpenCalendar} data-testid={`m-day-row-${it.id}`}>
          <span className="m-day__time m-num">{hhmm(it.startMin)}</span>
          <span className="m-day__mark" aria-hidden="true">{it.done ? <Check /> : <span className="m-dot" style={{ background: toneOf(it) }} />}</span>
          <span className="m-day__text">
            <span className="m-day__title">{it.title}</span>
            <span className="m-day__meta">{it.done ? `Done · ${meta(it)}` : meta(it)}</span>
          </span>
        </button>
      </li>
    ));
  });
  if (items.length > 0 && nowAt === items.length) rows.push(<NowMark key="now" nowMin={nowMin} />);

  return (
    <section className="m-day" aria-labelledby="m-day-h" data-testid="m-day">
      <div className="m-section-head">
        <h2 id="m-day-h">Your day</h2>
        <button type="button" className="m-btn m-btn--quiet" onClick={onOpenCalendar} data-testid="m-day-calendar">Calendar</button>
      </div>
      {items.length === 0 ? (
        <p className="m-day__empty">Nothing on the clock today. Give a plan a time in the Calendar, and it shows here in order.</p>
      ) : (
        <ol className="m-day__list">{rows}</ol>
      )}
    </section>
  );
}

function NowMark({ nowMin }: { nowMin: number }) {
  return (
    <li className="m-day__now" aria-label={`Now, ${hhmm(nowMin)}`} data-testid="m-day-now">
      <span className="m-num">{hhmm(nowMin)}</span>
      <i aria-hidden="true" />
    </li>
  );
}
