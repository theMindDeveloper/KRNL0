// "Welcome back" (launch-experience.md F12–F15): after two or more days away,
// once, a short list of what slipped. Nothing moves by itself — every change
// is a button. Only the head of a chain gets buttons; its followers move with
// it. A broken streak is said plainly, with the best run, no guilt.

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Z } from '../ui/layers';
import { CloseButton } from '../ui/CloseButton';
import { closeWelcomeBack, refreshWelcomeBack, todayYMD, useLaunchStore } from '../../launch/launchStore';
import { movedSchedule, type SlippedTask } from '../../launch/catchup';
import { describeAway } from '../../../shared/appState';
import { focusNode } from '../../store/scheduleActions';

function dayLabel(ymd: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric' }): string {
  const d = new Date(`${ymd}T00:00:00`);
  return Number.isNaN(d.getTime()) ? ymd : d.toLocaleDateString(undefined, opts);
}

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + n);
  return todayYMD(d);
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
  const fromDay = awayMs !== null ? todayYMD(new Date(Date.now() - awayMs)) : null;
  const range = fromDay
    ? `${dayLabel(fromDay, { weekday: 'short', day: 'numeric', month: 'short' })} → ${dayLabel(today, { weekday: 'short', day: 'numeric', month: 'short' })}${awayMs !== null ? ` · ${describeAway(awayMs)}` : ''}`
    : dayLabel(today, { weekday: 'long', day: 'numeric', month: 'long' });
  const nothing = catchup.tasks.length === 0 && catchup.habits.length === 0;

  return createPortal(
    <div className="ln-scrim" style={{ zIndex: Z.modal }} onClick={closeWelcomeBack} data-testid="welcome-back">
      <div className="ln-dialog" role="dialog" aria-modal="true" aria-labelledby="ln-wb-title" onClick={(e) => e.stopPropagation()}
        style={{ width: 600, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '32px 32px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="ln-row">
            <span className="ln-label">{range}</span>
            <span style={{ flex: 1 }} />
            <CloseButton onClick={closeWelcomeBack} label="Close" />
          </div>
          <h2 id="ln-wb-title" className="ln-display" style={{ fontSize: 44 }}>Welcome back.</h2>
          <p className="ln-body">
            {nothing
              ? 'Your board is exactly as you left it, and nothing slipped.'
              : 'Your board is exactly as you left it. A few things slipped while you were gone.'}
          </p>
        </div>

        <div style={{ padding: '16px 32px 8px', overflowY: 'auto', minHeight: 0, flex: 1 }}>
          {catchup.tasks.length > 0 && (
            <section style={{ marginTop: 8 }}>
              <div className="ln-row" style={{ minHeight: 32 }}>
                <span className="ln-label">{catchup.tasks.length} task{catchup.tasks.length === 1 ? '' : 's'} passed their day</span>
                <span style={{ flex: 1 }} />
                <button type="button" className="ln-btn ln-btn--xs ln-btn--line" data-testid="welcome-move-all" onClick={() => { void moveAll(catchup.tasks); }}>
                  Move all to today
                </button>
              </div>
              {catchup.tasks.map((t) => (
                <div key={t.id}>
                  <div className="ln-wb-row">
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.text}>{t.text}</span>
                    <span className="ln-meta" style={{ whiteSpace: 'nowrap' }}>was {dayLabel(t.wasDay)}</span>
                    <button type="button" className="ln-btn ln-btn--xs ln-btn--line" onClick={() => { void plan(t, today); }}>Today</button>
                    <button type="button" className="ln-btn ln-btn--xs" onClick={() => { void plan(t, addDays(today, 1)); }}>Tomorrow</button>
                    <button type="button" className="ln-btn ln-btn--xs" title="Take it off the calendar. The task stays in your list." onClick={() => { void plan(t, null); }}>Unplan</button>
                  </div>
                  {t.followers.map((f) => (
                    <div key={f.id} className="ln-wb-follow" style={{ minHeight: 28, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span aria-hidden>↳</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.text}</span>
                      <span className="ln-meta" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>follows the task above</span>
                    </div>
                  ))}
                </div>
              ))}
            </section>
          )}

          {catchup.habits.length > 0 && (
            <section style={{ marginTop: 16 }}>
              <span className="ln-label">Habits</span>
              {catchup.habits.map((h) => (
                <div key={h.id} className="ln-wb-row">
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>{h.name}</span>
                  {h.broken
                    ? <span className="ln-meta">best {h.best} · start again today</span>
                    : <span className="ln-meta" style={{ color: 'var(--ink-2)' }}><span style={{ color: 'var(--acid)' }}>▲ {h.current}</span> · still going</span>}
                </div>
              ))}
            </section>
          )}
        </div>

        <div className="ln-row" style={{ padding: '16px 32px 24px', gap: 8, boxShadow: 'inset 0 1px 0 var(--paper-3)' }}>
          <span className="ln-meta">Nothing moves unless you press a button.</span>
          <span style={{ flex: 1 }} />
          {catchup.tasks.length > 0 && (
            <button type="button" className="ln-btn ln-btn--sm" onClick={() => { const first = catchup.tasks[0]; closeWelcomeBack(); if (first) focusNode(first.id); }}>
              Show me on the canvas
            </button>
          )}
          <button type="button" className="ln-btn ln-btn--sm ln-btn--primary" data-testid="welcome-done" onClick={closeWelcomeBack}>Plan today</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
