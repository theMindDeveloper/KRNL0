// HabitLaneNode — the board card of a habit or a repeating event (Decision 42,
// canvas draft A "Same card"). It stores only { habitId } and reads the habit
// from the Habits mother at render time (Decision 14.1).
//
// Draft A of round two (canvas "Habit and event cards, round two"). Same size
// as a task card but no wire dots: nothing runs "after" a habit or an event.
//
//   habit (tinted in its colour)          repeating event
//   Read ……………… 5 in a row [⋯]            ┌─────┐ Class ……………………… [⋯]
//   (● habit)  every day                  │ WED │ 17:00 – 18:20
//   [M][T][ ][T][F][S][✓ today]           │ 11  │ ↻ every Wed · in 3 days
//                                         └─────┘
//   today's square is the button:          [Skip this one] [Show]
//   tick, or "+1 · 1/2" for an amount
//
// A habit is ticked on today's square. An event is never ticked: the page
// shows the next date it happens; Skip skips that one, Show finds it on the
// Calendar; while it happens, how much is left.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { NodeProps } from '../types';
import type { HabitLaneConfig, HabitLaneState } from './types';
import type { Habit, HabitColor, HabitSchedule } from '../HabitNode/types';
import { habitStreak } from '../HabitNode/commands';
import { HABIT_COLORS, countOn, isDayScheduled, isRoutine, routineOccurrence, toYMD, weeklyTarget } from '../HabitNode/types';
import { routineStatus } from '../HabitNode/RoutineShelf';
import { useBoardStore } from '../../../store/boardStore';
import { useLocalDay } from '../../../hooks/useLocalDay';
import { HabitContextMenu } from '../HabitNode/HabitContextMenu';
import { saveBoard } from '../../../store/eventLog';
import { undoable } from '../../../store/undoNotice';
import { MenuIcon } from '../../ui/menuIcons';
import { CardMetaRow, cardFrameStyle, type CardTone } from '../TaskNode/CardParts';
import { showEventOnCalendar } from '../../../store/showCli';

const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const pad = (n: number) => String(n).padStart(2, '0');
const hm = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;

function habitColor(c: unknown): HabitColor {
  return typeof c === 'string' && (HABIT_COLORS as readonly string[]).includes(c) ? (c as HabitColor) : 'acid';
}

/** Mon–Sun of the week holding `today` (the card shows this week). */
function weekOf(today: string): string[] {
  const d0 = new Date(`${today}T00:00:00`);
  const dow = (d0.getDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(d0); d.setDate(d0.getDate() - dow + i); return toYMD(d); });
}

/** "every day", "weekdays", "Mon Wed", "M W F", "3× a week". */
function daysWords(h: Habit): string {
  const target = weeklyTarget(h);
  if (target) return `${target}× a week`;
  const s = h.schedule;
  if (!s || s.kind === 'daily') return 'every day';
  if (s.kind === 'weekdays') return 'weekdays';
  const days = [...s.days].sort();
  if (days.join() === '6,7') return 'weekends';
  return days.length <= 2 ? days.map((d) => SHORT[d - 1]).join(' ') : days.map((d) => LETTERS[d - 1]).join(' ');
}

/** "· 10:00–12:00" for an event, "· 07:30" or "· any time" for a habit. */
function timeWords(h: Habit, event: boolean): string {
  const t = (h.schedule as HabitSchedule | undefined)?.timeOfDay;
  if (!t) return 'any time';
  // The start only: "every day · 17:00" fits; the end shows while it happens.
  void event;
  return t;
}

/** The next day the habit is on, after today ("Mon", "tomorrow"). */
function nextHabitDay(h: Habit, today: string): string | null {
  for (let i = 1; i <= 7; i++) {
    const d = new Date(`${today}T00:00:00`); d.setDate(d.getDate() + i);
    const ymd = toYMD(d);
    if (isDayScheduled(h.schedule, ymd)) return i === 1 ? 'tomorrow' : d.toLocaleDateString('en-GB', { weekday: 'short' });
  }
  return null;
}

function inWords(min: number): string {
  if (min < 60) return `in ${Math.max(1, min)} min`;
  if (min < 24 * 60) return `in ${Math.round(min / 60)} h`;
  return `in ${Math.round(min / (24 * 60))} days`;
}

export function HabitLaneNode({ node, onCommand }: NodeProps<HabitLaneState, HabitLaneConfig>) {
  const board = useBoardStore((s) => s.board);
  const [menuOpen, setMenuOpen] = useState<{ x: number; y: number } | null>(null);

  const habit: Habit | null = useMemo(() => {
    if (!board) return null;
    for (const n of board.nodes) {
      if (n.kind !== 'habit' || !n.isMother) continue;
      const s = n.state as { habits?: Habit[] } | null;
      // An archived habit is no longer tracked: its card goes like a deleted one's.
      const h = s?.habits?.find((x) => x.id === node.state.habitId && !x.archived);
      if (h) return h;
    }
    return null;
  }, [board, node.state.habitId]);

  // Re-renders at local midnight; events also need the minute (now / in 2 h).
  const today = useLocalDay();
  const week = useMemo(() => weekOf(today), [today]);
  const [nowMin, setNowMin] = useState(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); });
  const event = !!habit && isRoutine(habit);
  useEffect(() => {
    if (!event) return;
    const id = window.setInterval(() => { const d = new Date(); setNowMin(d.getHours() * 60 + d.getMinutes()); }, 30_000);
    return () => window.clearInterval(id);
  }, [event]);

  const { getNodes } = useReactFlow();
  const openMenu = (e: React.MouseEvent) => {
    const selectedCount = getNodes().filter((n) => n.selected).length;
    if (selectedCount > 1) return;
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen({ x: e.clientX, y: e.clientY });
  };

  // The habit was deleted or archived: the card removes itself, once, saved,
  // without an undo slot (undoing to it would re-create the orphan).
  const cleaned = useRef(false);
  useEffect(() => {
    if (!board) return;
    if (habit || cleaned.current) return;
    if (!board.nodes.some((n) => n.id === node.id)) return;
    cleaned.current = true;
    useBoardStore.setState((s) => (s.board && s.board.nodes.some((n) => n.id === node.id)
      ? { board: { ...s.board, nodes: s.board.nodes.filter((n) => n.id !== node.id) } }
      : s));
    const next = useBoardStore.getState().board;
    if (next) void saveBoard(next);
  }, [board, habit, node.id]);
  if (!habit) return null;

  const color = `var(--${habitColor(habit.color)})`;
  const logSet = new Set(habit.log);
  const doneToday = logSet.has(today);
  const scheduledToday = isDayScheduled(habit.schedule, today);
  const amount = !event && habit.amount ? habit.amount : null;
  const count = amount ? countOn(habit, today) : 0;
  const { current: streak, unit } = habitStreak(habit as Parameters<typeof habitStreak>[0], today);
  const status = event ? routineStatus(habit, today, nowMin) : null;
  const tone: CardTone = event ? (status?.kind === 'now' ? 'running' : 'open') : doneToday ? 'done' : 'open';
  const canTick = scheduledToday || doneToday || !!weeklyTarget(habit);

  const editButton = (
    <button type="button" data-testid="habit-card-menu" className="nodrag task-card-action" aria-label={`${habit.name}: options`} title="Days, time, name, colour…"
      onClick={openMenu} onMouseDown={(e) => e.stopPropagation()}
      style={{ width: 24, height: 24, borderRadius: 7, display: 'grid', placeItems: 'center', flexShrink: 0, cursor: 'pointer', border: 'none', padding: 0, color: 'var(--ink-3)', background: 'var(--paper-2)' }}>
      <MenuIcon name="edit" size={13} />
    </button>
  );
  const title = (
    <span title={habit.name} style={{ fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: '18px', color: 'var(--ink)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {habit.name}
    </span>
  );
  const menu = menuOpen && (
    <HabitContextMenu
      habit={habit}
      anchor={menuOpen}
      onRename={(name) => onCommand('habit.lane.rename', { name })}
      onSetColor={(c) => onCommand('habit.lane.setColor', { color: c })}
      onSetIcon={(icon) => onCommand('habit.lane.setIcon', { icon })}
      onSetNote={(note) => onCommand('habit.lane.setNote', { note })}
      onDelete={() => undoable(`Deleted ${event ? 'event' : 'habit'} "${habit.name}"`, () => onCommand('habit.lane.removeHabit'))}
      onUnpinLane={() => {
        useBoardStore.getState().removeNode(node.id);
        const next = useBoardStore.getState().board;
        if (next) void saveBoard(next);
      }}
      onClose={() => setMenuOpen(null)}
    />
  );

  // ══ Repeating event: a calendar page with the next date ══════════════════
  if (event && status) {
    const now = status.kind === 'now';
    // The date the page shows: today while it happens or later today, else the next one.
    const date = status.kind === 'now' || status.kind === 'today' ? today
      : status.kind === 'next' || status.kind === 'skipped' ? status.date : null;
    const occ = date ? routineOccurrence(habit, date) : null;
    const d = date ? new Date(`${date}T00:00:00`) : null;
    const top = now ? 'NOW' : date === today ? 'TODAY' : d ? d.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase() : 'ENDED';
    const days = date ? Math.round((new Date(`${date}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000) : 0;
    const when = now ? (() => { const left = Math.max(1, status.until - nowMin); return left >= 60 ? `${Math.round(left / 60)} h left` : `${left} min left`; })()
      : status.kind === 'today' ? inWords(status.at - nowMin)
      : status.kind === 'next' ? (days === 1 ? 'tomorrow' : inWords(days * 24 * 60 + status.at - nowMin))
      : status.kind === 'skipped' ? 'skipped'
      : status.kind === 'ended' ? 'ended' : 'no more dates';
    // The end is the start + its length (past midnight it reads 01:16, not 00:00).
    const len = Math.max(5, (habit.schedule as HabitSchedule | undefined)?.durationMin ?? 60);
    const span = occ ? `${hm(occ.startMin)} – ${hm(occ.startMin + len)}` : (habit.schedule as HabitSchedule | undefined)?.timeOfDay ?? '';
    const ratio = now && occ ? (nowMin - occ.startMin) / Math.max(1, occ.endMin - occ.startMin) : 0;
    const pageInk = now || date === today ? 'var(--ink-on-bright, #111)' : `color-mix(in srgb, ${color} 55%, var(--ink))`;
    const pageHead = now || date === today ? 'var(--acid)' : `color-mix(in srgb, ${color} 26%, var(--paper-3))`;
    const smallBtn: React.CSSProperties = {
      height: 22, padding: '0 8px', borderRadius: 6, border: '1px solid var(--paper-3)', background: 'transparent',
      color: 'var(--ink-2)', fontFamily: 'var(--font-mono)', fontSize: 10.5, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
    };
    return (
      <div data-testid="habit-lane-root" data-card="event" onContextMenu={openMenu}
        style={{ ...cardFrameStyle(tone), cursor: 'grab', overflow: 'visible', ['--habit-color' as string]: color } as React.CSSProperties}>
        <div style={{ display: 'flex', gap: 10, minWidth: 0 }}>
          {/* The page: the next date it happens, like a little calendar. */}
          <div data-testid="event-card-date" aria-label={date ? `Next: ${date}` : 'No more dates'}
            style={{ width: 46, flexShrink: 0, borderRadius: 9, overflow: 'hidden', display: 'flex', flexDirection: 'column', textAlign: 'center', boxSizing: 'border-box',
              border: `1px solid ${now ? 'var(--acid)' : `color-mix(in srgb, ${color} 30%, var(--paper-3))`}`, background: 'var(--paper-1, var(--node-bg))' }}>
            <span style={{ background: pageHead, color: pageInk, fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', padding: '3px 0', lineHeight: 1.1 }}>{top}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 19, fontWeight: 600, color: status.kind === 'skipped' ? 'var(--ink-3)' : 'var(--ink)', padding: '4px 0 1px', lineHeight: 1, fontVariantNumeric: 'tabular-nums', textDecoration: status.kind === 'skipped' ? 'line-through' : 'none' }}>{d ? d.getDate() : '–'}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-3)', paddingBottom: 5, lineHeight: 1.2 }}>{d ? d.toLocaleDateString('en-GB', { month: 'short' }) : ''}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>{title}{editButton}</div>
            <span data-testid="event-card-time" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{span}</span>
            <span data-testid="habit-card-left" style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)', fontSize: 10.5, whiteSpace: 'nowrap', overflow: 'hidden', color: now ? 'var(--acid-ink, var(--acid))' : 'var(--ink-3)' }}>
              {!now && <span style={{ display: 'inline-flex', flexShrink: 0 }}><MenuIcon name="repeat" size={10} /></span>}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{now ? when : `${daysWords(habit)} · ${when}`}</span>
            </span>
          </div>
        </div>
        {now ? (
          <div style={{ marginTop: 'auto', height: 4, borderRadius: 2, background: 'var(--paper-3)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.max(0, Math.min(1, ratio)) * 100}%`, background: 'var(--acid)', borderRadius: 2 }} />
          </div>
        ) : (
          <div style={{ marginTop: 'auto', display: 'flex', gap: 6 }}>
            {date && (status.kind === 'skipped' ? (
              <button type="button" data-testid="event-card-unskip" className="nodrag" style={smallBtn}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onCommand('habit.lane.unskip', { date }); }}
                title={`Bring back ${habit.name} on ${date}`}>
                <MenuIcon name="undo" size={11} />Undo skip
              </button>
            ) : (
              <button type="button" data-testid="event-card-skip" className="nodrag" style={smallBtn}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onCommand('habit.lane.skip', { date }); }}
                title={`Skip ${habit.name} on ${date} only`}>
                <MenuIcon name="skip" size={11} />Skip this one
              </button>
            ))}
            <button type="button" data-testid="event-card-show" className="nodrag" style={smallBtn}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); showEventOnCalendar(habit.id, date ?? today); }}
              title="Show it on the Calendar">
              <MenuIcon name="show" size={11} />Show
            </button>
          </div>
        )}
        {menu}
      </div>
    );
  }

  // ══ Habit: its week, and today's square is the button ════════════════════
  const target = amount?.target ?? 1;
  const unitWords = amount ? `${amount.target}${amount.unit ? ` ${amount.unit}` : ''}` : '';
  const dayWords = daysWords(habit);
  const timeOfDay = timeWords(habit, false);
  const meta = amount
    ? (dayWords === 'every day' ? `${unitWords} a day` : `${dayWords} · ${unitWords}`)
    : timeOfDay === 'any time' ? dayWords : `${dayWords} · ${timeOfDay}`;
  const next = nextHabitDay(habit, today);
  const notToday = !canTick && !doneToday;
  const streakWords = unit === 'day' ? `${streak} in a row` : `${streak} ${unit}s in a row`;
  const statusText = notToday ? (next ? `next: ${next}` : 'not today') : streak > 0 ? streakWords : '';
  const tick = () => onCommand('habit.lane.toggleToday');
  const checkMark = (stroke: string, size = 12) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
  );

  const squares = week.map((ymd, i) => {
    const isToday = ymd === today;
    const future = ymd > today;
    const onDay = isDayScheduled(habit.schedule, ymd) || !!weeklyTarget(habit);
    const n = amount ? countOn(habit, ymd) : logSet.has(ymd) ? 1 : 0;
    const full = amount ? n >= target : n > 0;
    const part = amount && !full && n > 0 ? n / target : 0;
    const base: React.CSSProperties = {
      flex: 1, minWidth: 0, height: 30, borderRadius: 6, boxSizing: 'border-box', position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
      fontFamily: 'var(--font-mono)', fontSize: 9.5, lineHeight: 1, padding: 0, border: 'none',
    };
    const fill = part > 0 && <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${part * 100}%`, background: `color-mix(in srgb, ${color} 55%, transparent)` }} />;
    if (!isToday) {
      return (
        <span key={ymd} title={ymd} style={{
          ...base,
          background: full ? color : onDay ? 'var(--paper-2)' : 'transparent',
          boxShadow: onDay ? 'none' : 'inset 0 0 0 1px var(--paper-3)',
          color: full ? 'var(--ink-on-bright, #111)' : onDay ? 'var(--ink-3)' : 'var(--ink-4, var(--ink-3))',
          opacity: future ? 0.5 : onDay ? 1 : 0.7,
        }}>{fill}<span style={{ position: 'relative' }}>{LETTERS[i]}</span></span>
      );
    }
    // Today: the button. Plain habit ticks; an amount adds one ("+1", 1/2).
    const label = notToday ? `${habit.name} today: not one of its days${next ? `, next ${next}` : ''}`
      : amount ? `${habit.name}: add one (${n} of ${target} today)` : `${habit.name} today ${full ? 'done' : 'not done'}`;
    return (
      <button key={ymd} type="button" data-testid={amount ? 'habit-card-add' : 'habit-card-tick'} className="nodrag"
        disabled={notToday}
        onClick={(e) => { e.stopPropagation(); tick(); }}
        onMouseDown={(e) => e.stopPropagation()}
        aria-pressed={amount ? undefined : full}
        aria-label={label}
        title={notToday ? `Not a day for this habit${next ? ` (next: ${next})` : ''}` : amount ? (full ? 'Done for today (click to start again)' : 'Add one') : full ? 'Untick today' : 'Tick today'}
        style={{
          ...base,
          cursor: notToday ? 'default' : 'pointer',
          background: full ? color : notToday ? 'transparent' : `color-mix(in srgb, var(--acid) 8%, var(--paper-2))`,
          boxShadow: full ? `0 0 0 1.5px ${color}` : notToday ? 'inset 0 0 0 1.5px var(--paper-3)' : 'inset 0 0 0 1.5px var(--acid)',
          color: full ? 'var(--ink-on-bright, #111)' : notToday ? 'var(--ink-4, var(--ink-3))' : 'var(--acid-ink, var(--acid))',
        }}>
        {fill}
        {notToday ? <span style={{ position: 'relative' }}>{LETTERS[i]}</span>
          : full ? <span style={{ position: 'relative', display: 'inline-flex' }}>{checkMark('currentColor')}</span>
          : amount ? (<>
            <span style={{ position: 'relative', fontSize: 10, fontWeight: 700 }}>+1</span>
            <span style={{ position: 'relative', fontSize: 8.5, color: 'var(--ink-2)' }}>{n}/{target}</span>
          </>)
          : <span style={{ position: 'relative', display: 'inline-flex', opacity: 0.85 }}>{checkMark('currentColor')}</span>}
      </button>
    );
  });

  return (
    <div
      data-testid="habit-lane-root"
      data-card="habit"
      onContextMenu={openMenu}
      style={{
        ...cardFrameStyle(tone), cursor: 'grab', overflow: 'visible', ['--habit-color' as string]: color,
        // A habit is tinted in its own colour, so it reads apart from a task.
        border: `1px solid color-mix(in srgb, ${color} ${doneToday ? 60 : 38}%, var(--paper-3))`,
        background: `color-mix(in srgb, ${color} ${doneToday ? 11 : 6}%, var(--node-bg))`,
      } as React.CSSProperties}
    >
      {/* Row 1: name · streak (or when it is next) · its menu */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {title}
        {statusText && (
          <span data-testid="habit-card-left" style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, whiteSpace: 'nowrap', flexShrink: 0, color: notToday || streak === 0 ? 'var(--ink-3)' : 'var(--acid-ink, var(--acid))' }}>
            {statusText}
          </span>
        )}
        {editButton}
      </div>

      {/* Row 2: what it is · its days (and time, or amount) */}
      <CardMetaRow tag="habit" tone={color} icon="calendar" when={meta} />

      {/* Row 3: the week; today's square is the button */}
      <div data-testid="habit-card-week" style={{ display: 'flex', gap: 4, marginTop: 'auto' }}>{squares}</div>

      {menu}
    </div>
  );
}
