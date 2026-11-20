// "Welcome back" (launch-experience.md F12–F15, F14c): after two or more days
// away, once, a checklist of what was planned meanwhile. You know what you did,
// so ticking comes first: a tick counts on the day it was planned. Only what is
// still open gets Move / Won't do. Nothing moves by itself, and the main button
// moves nothing. A broken streak is said plainly, with the best run, no guilt.
//
// Built from the app's own parts: the days away as calendar-like columns, the
// task card's tag chips, the habit week grid, icon buttons.

import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Z } from '../ui/layers';
import { CloseButton } from '../ui/CloseButton';
import { closeWelcomeBack, refreshWelcomeBack, todayYMD, useLaunchStore } from '../../launch/launchStore';
import { landingTimes, type Catchup, type SlippedTask } from '../../launch/catchup';
import { useBoardStore } from '../../store/boardStore';
import { focusNode } from '../../store/scheduleActions';
import { dayLabel, setPlanDone, todoRowOf, wontDoTask } from '../../store/planActions';
import { ContextMenu, type ContextMenuItem } from '../ContextMenu';
import { MenuIcon } from '../ui/menuIcons';
import type { TodoState } from '../nodes/TodoNode/types';
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

/** How long a task's block is, from the board (its plan, else 30 minutes). */
function lengthOf(id: string): number {
  const n = useBoardStore.getState().board?.nodes.find((x) => x.id === id);
  const s = (n?.state ?? {}) as { scheduledDurationMin?: unknown; plannedMin?: unknown };
  const v = typeof s.scheduledDurationMin === 'number' ? s.scheduledDurationMin : typeof s.plannedMin === 'number' ? s.plannedMin : 30;
  return v > 0 ? v : 30;
}

/** Every task that moves: the heads, and the followers that slipped too. */
function moving(tasks: readonly SlippedTask[]): Array<{ id: string; time: string; lengthMin: number }> {
  const out: Array<{ id: string; time: string; lengthMin: number }> = [];
  for (const t of tasks) {
    // Followers without their own time run right after the head: the head's
    // landing slot must hold the whole chain, or they land on another plan.
    const chained = t.followers.filter((f) => f.time === undefined).reduce((sum, f) => sum + lengthOf(f.id), 0);
    out.push({ id: t.id, time: t.time, lengthMin: lengthOf(t.id) + chained });
    for (const f of t.followers) if (f.time !== undefined) out.push({ id: f.id, time: f.time, lengthMin: lengthOf(f.id) });
  }
  return out;
}

/**
 * Re-plan tasks through their own node's command (the store path, rule 5).
 * A follower that slipped too moves with its head. Moving to today never
 * lands on a time already past (F27): those line up from now.
 */
/** The day's other open plans, as spans, so moved tasks land around them. */
function plansOn(day: string, moving: ReadonlySet<string>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const n of useBoardStore.getState().board?.nodes ?? []) {
    if (n.kind !== 'todo.task' || moving.has(n.id)) continue;
    const s = n.state as { scheduledFor?: unknown; done?: unknown };
    if (s.done === true || typeof s.scheduledFor !== 'string' || !s.scheduledFor.startsWith(`${day}T`)) continue;
    const at = new Date(s.scheduledFor).getTime();
    if (Number.isFinite(at)) out.push([at, at + lengthOf(n.id) * 60_000]);
  }
  return out;
}

async function plan(tasks: readonly SlippedTask[], day: string | null): Promise<void> {
  const { makeCommandHandler } = await import('../Canvas/commandDispatch');
  const items = moving(tasks);
  const at = day === null ? null : landingTimes(items, day, todayYMD(), Date.now(), plansOn(day, new Set(items.map((i) => i.id))));
  for (const it of items) makeCommandHandler(it.id)('task.setSchedule', { scheduledFor: at === null ? null : at.get(it.id) ?? null });
  refreshWelcomeBack();
}


/** One checklist row: a slipped task, or an open follower listed under it. */
interface Row {
  id: string;
  text: string;
  /** "Fri 13 · 10:00", or "after <head>" for a follower with no time of its own. */
  when: string;
  tag?: string;
  /** The head's id for a follower row. */
  headId: string | null;
  /** How this row moves on its own (a follower moves alone once its head is settled). */
  move: SlippedTask;
}

/** The rows, fixed when the dialog opens, so ticked rows stay in view. */
function rowsOf(tasks: readonly SlippedTask[]): Row[] {
  const out: Row[] = [];
  for (const t of tasks) {
    const d = dayParts(t.wasDay);
    out.push({ id: t.id, text: t.text, when: `${d.dow} ${d.num} · ${t.time}`, ...(t.tag ? { tag: t.tag } : {}), headId: null, move: t });
    for (const f of t.followers) {
      out.push({
        id: f.id, text: f.text, headId: t.id,
        when: f.time ? `${d.dow} ${d.num} · ${f.time}` : `after ${t.text}`,
        move: { id: f.id, text: f.text, wasDay: t.wasDay, time: f.time ?? t.time, followers: [] },
      });
    }
  }
  return out;
}

type RowState = 'open' | 'done' | 'dropped' | 'moved' | 'gone';

const MOVE_WORD: Record<string, string> = { today: 'today', tomorrow: 'tomorrow', off: 'off the calendar' };

const PATHS: Record<string, ReactNode> = {
  today: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></>,
  tomorrow: <path d="M5 12h12M13 7l5 5-5 5" />,
  unplan: <><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4M10 13.5l4 4M14 13.5l-4 4" /></>,
  bring: <path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M4.5 19.5h15" />,
  follows: <path d="M6 4v8a3 3 0 0 0 3 3h10M15 11l4 4-4 4" />,
  flame: <path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.6 3-5.3 3.6-8.8 2.6 1.4 4 3.6 4.1 5.6 1-.6 1.6-1.7 1.8-3 1.9 1.6 3.5 3.8 3.5 6.3 0 3.5-2.6 6.1-6.5 6.1z" />,
  locate: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  drop: <><circle cx="12" cy="12" r="8.5" /><path d="M6 18L18 6" /></>,
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

/** F14c — the loose ends as a checklist: tick first, then place what is left. */
function Checklist({ rows, today }: { rows: readonly Row[]; today: string }) {
  const board = useBoardStore((st) => st.board);
  const [moved, setMoved] = useState<ReadonlyMap<string, string>>(new Map());
  const [menu, setMenu] = useState<{ x: number; y: number; row: Row } | null>(null);

  const stateOf = (r: Row): RowState => {
    const node = board?.nodes.find((x) => x.id === r.id && x.kind === 'todo.task');
    if (!node) return 'gone';
    const ts = node.state as { done?: boolean; todoItemId?: string | null; parentTodoId?: string };
    if (ts.done === true) return 'done';
    const todo = board?.nodes.find((x) => x.id === ts.parentTodoId && x.kind === 'todo');
    if ((todo?.state as TodoState | undefined)?.items.some((i) => i.id === ts.todoItemId && i.droppedAt !== undefined)) return 'dropped';
    return moved.has(r.id) ? 'moved' : 'open';
  };
  const states = new Map(rows.map((r) => [r.id, stateOf(r)]));
  const live = rows.filter((r) => states.get(r.id) !== 'gone');
  const open = live.filter((r) => states.get(r.id) === 'open');
  const doneCount = live.filter((r) => states.get(r.id) === 'done').length;

  /** What moves when `rows` move: a head takes its open followers along. */
  const units = (picked: readonly Row[]): SlippedTask[] => {
    const ids = new Set(picked.map((r) => r.id));
    const out: SlippedTask[] = [];
    for (const r of picked) {
      if (r.headId !== null && ids.has(r.headId)) continue; // moves with its head
      out.push(r.headId === null
        ? { ...r.move, followers: r.move.followers.filter((f) => states.get(f.id) === 'open') }
        : r.move);
    }
    return out;
  };
  const placeRows = (picked: readonly Row[], where: 'today' | 'tomorrow' | 'off') => {
    const day = where === 'today' ? today : where === 'tomorrow' ? addDays(today, 1) : null;
    const us = units(picked);
    void plan(us, day);
    const next = new Map(moved);
    for (const u of us) {
      next.set(u.id, MOVE_WORD[where]!);
      for (const f of u.followers) next.set(f.id, MOVE_WORD[where]!);
    }
    setMoved(next);
  };
  const openMenu = (e: MouseEvent, row: Row) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ x: r.left, y: r.bottom + 4, row });
  };
  const menuItems = (row: Row): ContextMenuItem[] => [
    { label: 'Today', icon: <MenuIcon name="day" />, hint: 'around today’s plans', onSelect: () => placeRows([row], 'today') },
    { label: 'Tomorrow', icon: <MenuIcon name="when" />, hint: 'same time', onSelect: () => placeRows([row], 'tomorrow') },
    { label: 'Off the calendar', icon: <MenuIcon name="unschedule" />, hint: 'stays in the list', divider: true, onSelect: () => placeRows([row], 'off') },
  ];

  return (
    <section className="wb-section" data-testid="welcome-checklist">
      <div className="wb-section__head">
        <h3>While you were away</h3>
        <span className="ln-meta" data-testid="welcome-tally"><span style={{ color: 'var(--acid-ink, var(--acid))' }}>{doneCount} done</span> · {open.length} open</span>
      </div>
      {live.map((r) => {
        const st = states.get(r.id)!;
        const tone = toneVarForTask(r.id);
        const node = board?.nodes.find((x) => x.id === r.id);
        const doneAt = (node?.state as { completedAt?: string } | undefined)?.completedAt;
        const status = st === 'done' ? `done · counts ${doneAt ? dayLabel(Date.parse(doneAt)) : 'today'}`
          : st === 'dropped' ? "won't do"
          : st === 'moved' ? `moved · ${moved.get(r.id)}`
          : null;
        return (
          <div key={r.id} className={`wb-task wb-row--${st}`} data-testid={`welcome-row-${r.id}`} style={r.headId ? { paddingLeft: 26 } : undefined}>
            {r.headId && <span style={{ color: 'var(--ink-4)', marginLeft: -20, display: 'inline-flex' }}><Icon name="follows" size={12} /></span>}
            <button
              type="button"
              className={`task-check${st === 'done' ? ' task-check--done' : ''}`}
              style={{ marginTop: 0 }}
              role="checkbox"
              aria-checked={st === 'done'}
              aria-label={`Did it: ${r.text}`}
              data-testid={`welcome-check-${r.id}`}
              disabled={st === 'dropped'}
              onClick={() => { void setPlanDone(r.id, st !== 'done'); }}
            >
              {st === 'done' && <span className="task-check__mark"><Icon name="check" size={11} /></span>}
            </button>
            <div className="wb-task__main">
              <div className="wb-task__title" title={r.text} style={st === 'open' ? undefined : { color: 'var(--ink-3)', textDecoration: st === 'moved' ? 'none' : 'line-through' }}>{r.text}</div>
              <div className="wb-task__meta">
                {r.tag && <span className="wb-tag" style={{ background: `color-mix(in srgb, ${tone} 16%, transparent)`, color: `color-mix(in srgb, ${tone} 75%, var(--ink))` }}><i style={{ background: tone }} />{r.tag.toLowerCase()}</span>}
                {status
                  ? <span style={{ color: st === 'done' ? 'var(--acid-ink, var(--acid))' : 'var(--ink-3)', whiteSpace: 'nowrap' }}>{status}</span>
                  : <span className="wb-was">missed · {r.when}</span>}
              </div>
            </div>
            <div className="wb-task__actions">
              {st === 'open' && (
                <>
                  <button type="button" className="ln-btn ln-btn--xs wb-ic" data-testid={`welcome-move-${r.id}`} aria-haspopup="menu" onClick={(e) => openMenu(e, r)}>Move<Icon name="tomorrow" size={12} /></button>
                  {todoRowOf(r.id) && <button type="button" className="ln-btn ln-btn--xs ln-btn--line" data-testid={`welcome-wontdo-${r.id}`} onClick={() => { wontDoTask(r.id); }} title="Skip it on purpose: kept in your list as won't do, not counted as missed">Won't do</button>}
                </>
              )}
              <button type="button" className="ln-btn ln-btn--xs wb-icon" onClick={() => { closeWelcomeBack(); focusNode(r.id); }} title="Show it on the canvas" aria-label="Show on the canvas"><Icon name="locate" size={14} /></button>
            </div>
          </div>
        );
      })}
      {open.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 10 }}>
          <button type="button" className="ln-btn ln-btn--xs ln-btn--line wb-ic" data-testid="welcome-move-all" onClick={() => placeRows(open, 'today')}>
            <Icon name="bring" size={13} />Move the {open.length} open to today
          </button>
        </div>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.row)} onDismiss={() => setMenu(null)} />}
    </section>
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
  return <WelcomeDialog key={welcome.catchup.today} welcome={welcome} />;
}

function WelcomeDialog({ welcome }: { welcome: NonNullable<ReturnType<typeof useLaunchStore.getState>['welcome']> }) {
  const { catchup, awayMs } = welcome;
  // Fixed when the dialog opens: a ticked or moved row stays, marked.
  const [rows] = useState(() => rowsOf(catchup.tasks));
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
              {n === 0 ? 'No tasks slipped — your board is as you left it.' : 'Tick what you did: it counts on the day it was planned. Nothing moves unless you choose.'}
            </p>
          </div>
          <CloseButton onClick={closeWelcomeBack} label="Close" />
        </header>

        <div className="wb-body">
          <DaysAway catchup={catchup} fromDay={fromDay} />

          {rows.length > 0 && <Checklist rows={rows} today={today} />}

          {(catchup.due ?? []).length > 0 && (
            <section className="wb-section" data-testid="welcome-due">
              <div className="wb-section__head"><h3>Due</h3></div>
              {(catchup.due ?? []).map((d) => {
                const was = dayParts(d.dueOn);
                return (
                  <div key={d.id} className="wb-task">
                    <div className="wb-task__main">
                      <div className="wb-task__title" title={d.text}>{d.text}</div>
                      <div className="wb-task__meta">
                        <span className="wb-was" style={d.overdue ? { color: 'var(--rust)' } : undefined}>{d.overdue ? `overdue · was due ${was.dow} ${was.num}` : 'due today'}</span>
                      </div>
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
                          ? <>Start again {h.unit === 'week' ? 'this week' : 'today'} <span>· best {h.best}{h.unit === 'week' ? 'w' : ''}</span></>
                          : <span className="wb-going"><Icon name="flame" size={12} />{h.current} {h.unit === 'week' ? (h.current === 1 ? 'week' : 'weeks') : h.current === 1 ? 'day' : 'days'}, still going</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        <footer className="wb-foot">
          <span style={{ flex: 1 }} />
          {/* The main button never moves anything (F14b/F14c). */}
          <button type="button" className="ln-btn ln-btn--sm ln-btn--primary wb-ic" data-testid="welcome-done" onClick={closeWelcomeBack}><Icon name="check" size={14} />{rows.length > 0 ? 'Close' : 'Plan today'}</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
