// "Welcome back" (launch-experience.md F12–F15): after two or more days away,
// once, a short list of what slipped. Nothing moves by itself — every change
// is a button. Only the head of a chain gets buttons; its followers move with
// it. A broken streak is said plainly, with the best run, no guilt.
//
// Built from the app's own parts: the days away as calendar-like columns, the
// task card's tag chips, the habit week grid, icon buttons.

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Z } from '../ui/layers';
import { CloseButton } from '../ui/CloseButton';
import { closeWelcomeBack, refreshWelcomeBack, todayYMD, useLaunchStore } from '../../launch/launchStore';
import { movedSchedule, type Catchup, type SlippedTask } from '../../launch/catchup';
import { focusNode } from '../../store/scheduleActions';
import { toneVarForTask } from '../../utils/taskColor';

const DAY = 86_400_000;

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + n);
  return todayYMD(d);
}

function dayParts(ymd: string): { dow: string; num: string } {
  const d = new Date(`${ymd}T00:00:00`);
  return { dow: d.toLocaleDateString('en-GB', { weekday: 'short' }), num: String(d.getDate()) };
}

/** Re-plan a task through its own node's command (the store path, rule 5). */
async function plan(task: SlippedTask, day: string | null): Promise<void> {
  const { makeCommandHandler } = await import('../Canvas/commandDispatch');
  makeCommandHandler(task.id)('task.setSchedule', { scheduledFor: day === null ? null : movedSchedule(task, day) });
  refreshWelcomeBack();
}

async function moveAll(tasks: readonly SlippedTask[]): Promise<void> {
  const { makeCommandHandler } = await import('../Canvas/commandDispatch');
  const today = todayYMD();
  for (const t of tasks) makeCommandHandler(t.id)('task.setSchedule', { scheduledFor: movedSchedule(t, today) });
  refreshWelcomeBack();
}

const PATHS: Record<string, ReactNode> = {
  today: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></>,
  tomorrow: <path d="M5 12h12M13 7l5 5-5 5" />,
  unplan: <><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4M10 13.5l4 4M14 13.5l-4 4" /></>,
  bring: <path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M4.5 19.5h15" />,
  later: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  follows: <path d="M6 4v8a3 3 0 0 0 3 3h10M15 11l4 4-4 4" />,
  flame: <path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.6 3-5.3 3.6-8.8 2.6 1.4 4 3.6 4.1 5.6 1-.6 1.6-1.7 1.8-3 1.9 1.6 3.5 3.8 3.5 6.3 0 3.5-2.6 6.1-6.5 6.1z" />,
  locate: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
};

function Icon({ name, size = 14 }: { name: keyof typeof PATHS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
      {PATHS[name]}
    </svg>
  );
}

/** The days away, one column each, like the calendar's week: slipped tasks as dots. */
function DaysAway({ catchup, fromDay }: { catchup: Catchup; fromDay: string }) {
  const days: string[] = [];
  for (let d = fromDay; d <= catchup.today && days.length < 8; d = addDays(d, 1)) days.push(d);
  return (
    <div className="wb-days" role="list" aria-label="The days you were away">
      {days.map((d) => {
        const slipped = catchup.tasks.filter((t) => t.wasDay === d);
        const isToday = d === catchup.today;
        const { dow, num } = dayParts(d);
        return (
          <div key={d} role="listitem" className={`wb-day${isToday ? ' is-today' : ''}`} title={isToday ? 'Today' : `${slipped.length} slipped`}>
            <span className="wb-day__dow">{isToday ? 'Today' : dow}</span>
            <span className="wb-day__num">{num}</span>
            <span className="wb-day__marks" aria-hidden>
              {slipped.slice(0, 4).map((t) => <i key={t.id} style={{ background: toneVarForTask(t.id) }} />)}
              {isToday && catchup.tasks.length > 0 && <i className="wb-day__in"><Icon name="bring" size={10} /></i>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function WelcomeBack() {
  const welcome = useLaunchStore((s) => s.welcome);

  useEffect(() => {
    if (!welcome) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeWelcomeBack(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [welcome]);

  if (!welcome) return null;
  const { catchup, awayMs } = welcome;
  const today = catchup.today;
  const days = awayMs !== null ? Math.max(1, Math.floor(awayMs / DAY)) : null;
  const fromDay = awayMs !== null ? todayYMD(new Date(Date.now() - awayMs)) : addDays(today, -3);
  const n = catchup.tasks.length;
  const range = `${dayParts(fromDay).dow} ${dayParts(fromDay).num} – ${dayParts(today).dow} ${dayParts(today).num}`;

  return createPortal(
    <div className="ln-scrim" style={{ zIndex: Z.modal }} onClick={closeWelcomeBack} data-testid="welcome-back">
      <div className="ln-dialog wb" role="dialog" aria-modal="true" aria-labelledby="ln-wb-title" onClick={(e) => e.stopPropagation()}>
        <header className="wb-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id="ln-wb-title" className="ln-display" style={{ fontSize: 40 }}>Welcome back.</h2>
            <p className="wb-sub">
              {days !== null ? <>You were away <b>{days} day{days === 1 ? '' : 's'}</b> · {range}. </> : null}
              {n === 0 ? 'No tasks slipped — your board is as you left it.' : `${n === 1 ? 'One task' : `${n} tasks`} slipped. Nothing moves until you press a button.`}
            </p>
          </div>
          <CloseButton onClick={closeWelcomeBack} label="Close" />
        </header>

        <div className="wb-body">
          <DaysAway catchup={catchup} fromDay={fromDay} />

          {n > 0 && (
            <section className="wb-section">
              <div className="wb-section__head">
                <h3>Loose ends</h3>
                <button type="button" className="ln-btn ln-btn--xs ln-btn--line wb-ic" data-testid="welcome-move-all" onClick={() => { void moveAll(catchup.tasks); }}>
                  <Icon name="bring" size={13} />Move all to today
                </button>
              </div>
              {catchup.tasks.map((t) => {
                const tone = toneVarForTask(t.id);
                const was = dayParts(t.wasDay);
                return (
                  <div key={t.id} className="wb-task">
                    <div className="wb-task__main">
                      <div className="wb-task__title" title={t.text}>{t.text}</div>
                      <div className="wb-task__meta">
                        {t.tag && <span className="wb-tag" style={{ background: `color-mix(in srgb, ${tone} 16%, transparent)`, color: `color-mix(in srgb, ${tone} 75%, var(--ink))` }}><i style={{ background: tone }} />{t.tag.toLowerCase()}</span>}
                        <span className="wb-was">was {was.dow} {was.num} · {t.time}</span>
                      </div>
                      {t.followers.map((f) => (
                        <div key={f.id} className="wb-follow"><Icon name="follows" size={12} /><span>{f.text}</span><em>comes along</em></div>
                      ))}
                    </div>
                    <div className="wb-task__actions">
                      <button type="button" className="ln-btn ln-btn--xs ln-btn--primary wb-ic" onClick={() => { void plan(t, today); }} title={`Plan it today at ${t.time}`}><Icon name="today" size={13} />Today</button>
                      <button type="button" className="ln-btn ln-btn--xs wb-icon" onClick={() => { void plan(t, addDays(today, 1)); }} title={`Tomorrow at ${t.time}`} aria-label="Tomorrow"><Icon name="tomorrow" size={14} /></button>
                      <button type="button" className="ln-btn ln-btn--xs wb-icon" onClick={() => { void plan(t, null); }} title="Take it off the calendar (it stays in your list)" aria-label="Unplan"><Icon name="unplan" size={14} /></button>
                      <button type="button" className="ln-btn ln-btn--xs wb-icon" onClick={() => { closeWelcomeBack(); focusNode(t.id); }} title="Show it on the canvas" aria-label="Show on the canvas"><Icon name="locate" size={14} /></button>
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          {catchup.habits.length > 0 && (
            <section className="wb-section">
              <div className="wb-section__head"><h3>Habits</h3></div>
              <div className="wb-habits">
                {catchup.habits.map((h) => {
                  const colour = `var(--${h.color})`;
                  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
                  return (
                    <div key={h.id} className="wb-habit">
                      <div className="wb-habit__name" title={h.name}>{h.name}</div>
                      <div className="wb-habit__grid" aria-hidden>
                        {week.map((d) => <i key={d} className={d === today ? 'is-today' : undefined} style={h.log.includes(d) ? { background: colour, boxShadow: 'none' } : undefined} />)}
                      </div>
                      <div className="wb-habit__say">
                        {h.broken
                          ? <>Start again today <span>· best {h.best}</span></>
                          : <span className="wb-going"><Icon name="flame" size={12} />{h.current} days, still going</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        <footer className="wb-foot">
          <button type="button" className="ln-btn ln-btn--sm wb-ic" onClick={closeWelcomeBack}><Icon name="later" size={14} />Later</button>
          <span style={{ flex: 1 }} />
          {n > 0
            ? <button type="button" className="ln-btn ln-btn--sm ln-btn--primary wb-ic" data-testid="welcome-done" onClick={() => { void moveAll(catchup.tasks).then(closeWelcomeBack); }}><Icon name="bring" size={14} />Bring all {n} to today</button>
            : <button type="button" className="ln-btn ln-btn--sm ln-btn--primary wb-ic" data-testid="welcome-done" onClick={closeWelcomeBack}><Icon name="check" size={14} />Plan today</button>}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
