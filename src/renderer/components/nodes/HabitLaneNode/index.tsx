// HabitLaneNode — the board card of a habit or a repeating event (Decision 42,
// canvas draft A "Same card"). It stores only { habitId } and reads the habit
// from the Habits mother at render time (Decision 14.1).
//
// Same frame, size and ports as a task card (TaskNode/CardParts), so plans,
// habits and events read as one family on the board:
//
//   habit                                    repeating event
//   [✓] Read …………………………… [⋯]               [↻] Class ……………………………… [⋯]
//   (● habit)  every day · any time          (event)  Mon Wed · 10:00–12:00
//   ▬ ▬ ▬ ▬ ▬ ▬ [▬]                          ▧ · ▧ · · · ·
//   5 days in a row            today open    Today 10:00                in 2 h
//
// A habit is ticked (the box; an amount counts up and fills a meter). An
// event is never ticked: a repeat mark, the Calendar's hatch, and when it is
// next — while it happens, how much is left.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { NodeProps } from '../types';
import type { HabitLaneConfig, HabitLaneState } from './types';
import type { Habit, HabitColor, HabitSchedule } from '../HabitNode/types';
import { habitStreak } from '../HabitNode/commands';
import { HABIT_COLORS, countOn, isDayScheduled, isRoutine, toYMD, weeklyTarget } from '../HabitNode/types';
import { routineStatus } from '../HabitNode/RoutineShelf';
import { useBoardStore } from '../../../store/boardStore';
import { useLocalDay } from '../../../hooks/useLocalDay';
import { HabitContextMenu } from '../HabitNode/HabitContextMenu';
import { saveBoard } from '../../../store/eventLog';
import { undoable } from '../../../store/undoNotice';
import { LineGlyph } from '../../ui/LineGlyph';
import { MenuIcon } from '../../ui/menuIcons';
import { CardMetaRow, CardMeter, cardFrameStyle, type CardTone } from '../TaskNode/CardParts';

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
  if (!event) return t;
  const [hh, mm] = t.split(':').map(Number) as [number, number];
  const len = (h.schedule as HabitSchedule | undefined)?.durationMin ?? 60;
  return `${t}–${hm(hh * 60 + mm + len)}`;
}

function dayName(ymd: string, today: string): string {
  if (ymd === today) return 'Today';
  const t = new Date(`${today}T00:00:00`); t.setDate(t.getDate() + 1);
  if (toYMD(t) === ymd) return 'Tomorrow';
  return new Date(`${ymd}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short' });
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

  // ── the bottom: the week (habit, event) or a meter (amount, event now) ──
  const weekBars = (
    <div data-testid="habit-card-week" style={{ display: 'flex', gap: 3 }}>
      {week.map((ymd) => {
        const on = event ? isDayScheduled(habit.schedule, ymd) : logSet.has(ymd);
        const off = !isDayScheduled(habit.schedule, ymd) && !weeklyTarget(habit);
        const isToday = ymd === today;
        return (
          <span key={ymd} title={ymd}
            style={{
              flex: 1, height: 8, borderRadius: 2,
              background: event
                ? (on ? 'repeating-linear-gradient(135deg, color-mix(in srgb, var(--ink-3) 70%, transparent) 0 2px, transparent 2px 4px)' : 'transparent')
                : on ? color : off ? 'transparent' : 'var(--paper-3)',
              boxShadow: isToday ? '0 0 0 1px var(--acid)' : off || (event && !on) ? 'inset 0 0 0 1px var(--paper-3)' : 'none',
              opacity: ymd > today && !event ? 0.55 : 1,
            }} />
        );
      })}
    </div>
  );
  const labels = (left: string, right: string, leftColor = 'var(--ink)') => (
    <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 5, fontFamily: 'var(--font-mono)', fontSize: 11, gap: 8 }}>
      <span data-testid="habit-card-left" style={{ color: leftColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{left}</span>
      <span style={{ marginLeft: 'auto', color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{right}</span>
    </div>
  );

  let bottom: React.ReactNode;
  if (event && status) {
    const occStart = status.kind === 'today' || status.kind === 'next' ? status.at : 0;
    if (status.kind === 'now') {
      const t = (habit.schedule as HabitSchedule | undefined)?.timeOfDay ?? '00:00';
      const [hh, mm] = t.split(':').map(Number) as [number, number];
      const start = hh * 60 + mm;
      const ratio = (nowMin - start) / Math.max(1, status.until - start);
      const leftMin = Math.max(1, status.until - nowMin);
      bottom = <CardMeter ratio={ratio} color="var(--acid)" left={`Until ${hm(status.until)}`} right={leftMin >= 60 ? `${Math.round(leftMin / 60)} h left` : `${leftMin} min left`} />;
    } else {
      const left = status.kind === 'today' ? `Today ${hm(occStart)}`
        : status.kind === 'next' ? `${dayName(status.date, today)} ${hm(occStart)}`
        : status.kind === 'skipped' ? `Skipped ${dayName(status.date, today)}`
        : status.kind === 'ended' ? 'Ended' : 'No more dates';
      const days = status.kind === 'next' ? Math.round((new Date(`${status.date}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000) : 0;
      const right = status.kind === 'today' ? inWords(occStart - nowMin) : status.kind === 'next' ? inWords(days * 24 * 60 + occStart - nowMin) : '';
      bottom = <div style={{ marginTop: 'auto' }}>{weekBars}{labels(left, right, 'var(--ink)')}</div>;
    }
  } else if (amount) {
    bottom = <CardMeter ratio={count / Math.max(1, amount.target)} color={color} left={`${Math.min(count, amount.target)} of ${amount.target}${amount.unit ? ` ${amount.unit}` : ''} today`} right={count >= amount.target ? 'done' : 'click to add one'} />;
  } else {
    const left = streak > 0 ? `${streak} ${unit}${streak === 1 ? '' : 's'} in a row` : 'No streak yet';
    const right = doneToday ? 'done today' : scheduledToday || weeklyTarget(habit) ? 'today open' : 'not today';
    bottom = <div style={{ marginTop: 'auto' }}>{weekBars}{labels(left, right, streak > 0 ? 'var(--acid-ink, var(--acid))' : 'var(--ink-3)')}</div>;
  }

  return (
    <div
      data-testid="habit-lane-root"
      data-card={event ? 'event' : 'habit'}
      onContextMenu={openMenu}
      style={{ ...cardFrameStyle(tone), cursor: 'grab', overflow: 'visible', ['--habit-color' as string]: color } as React.CSSProperties}
    >
      {/* An event wears the Calendar's hatch: it happens, it isn't ticked. */}
      {event && <span aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', pointerEvents: 'none', background: 'repeating-linear-gradient(135deg, color-mix(in srgb, var(--ink-3) 7%, transparent) 0 6px, transparent 6px 12px)' }} />}

      {/* Row 1: box (habit) or repeat mark (event) · name · its menu */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
        {event ? (
          <span aria-label="Repeating event" style={{ width: 15, height: 15, display: 'grid', placeItems: 'center', flexShrink: 0, color: status?.kind === 'now' ? 'var(--acid-ink, var(--acid))' : 'var(--ink-3)' }}>
            <MenuIcon name="repeat" size={13} />
          </span>
        ) : amount ? (
          <button type="button" data-testid="habit-card-add" className="nodrag"
            disabled={!canTick}
            onClick={(e) => { e.stopPropagation(); onCommand('habit.lane.toggleToday'); }}
            onMouseDown={(e) => e.stopPropagation()}
            aria-label={`${habit.name}: add one (${count} of ${amount.target} today)`}
            title={canTick ? 'Add one' : 'Not a day for this habit'}
            style={{ minWidth: 15, height: 15, padding: '0 3px', borderRadius: 4, boxSizing: 'border-box', flexShrink: 0, cursor: canTick ? 'pointer' : 'default', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, lineHeight: 1,
              border: `1.5px solid ${count >= amount.target ? color : 'var(--ink-4)'}`, background: count >= amount.target ? color : 'transparent', color: count >= amount.target ? 'var(--ink-on-bright, #111)' : 'var(--ink-2)' }}>
            {count}
          </button>
        ) : (
          <button type="button" data-testid="habit-card-tick" className={`task-check${doneToday ? ' task-check--done' : ''} nodrag`}
            disabled={!canTick}
            onClick={(e) => { e.stopPropagation(); onCommand('habit.lane.toggleToday'); }}
            onMouseDown={(e) => e.stopPropagation()}
            aria-pressed={doneToday}
            aria-label={`${habit.name} today ${doneToday ? 'done' : 'not done'}`}
            title={canTick ? (doneToday ? 'Untick today' : 'Tick today') : 'Not a day for this habit'}
            style={{ marginTop: 0, opacity: canTick ? 1 : 0.4, ...(doneToday ? { background: color, borderColor: color } : {}) }}>
            {doneToday && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--ink-on-bright, #111)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
          </button>
        )}
        <span title={habit.name} style={{ fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: '18px', color: 'var(--ink)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {habit.name}
        </span>
        <button type="button" data-testid="habit-card-menu" className="nodrag task-card-action" aria-label={`${habit.name}: options`} title="Days, time, name, colour…"
          onClick={openMenu} onMouseDown={(e) => e.stopPropagation()}
          style={{ width: 24, height: 24, borderRadius: 7, display: 'grid', placeItems: 'center', flexShrink: 0, cursor: 'pointer', border: 'none', padding: 0, color: 'var(--ink-3)', background: 'var(--paper-2)' }}>
          <MenuIcon name="edit" size={13} />
        </button>
      </div>

      {/* Row 2: what it is · when */}
      <CardMetaRow tag={event ? (status?.kind === 'now' ? 'now' : 'event') : 'habit'} tone={event ? (status?.kind === 'now' ? 'var(--acid)' : 'var(--ink-3)') : color} icon="calendar"
        // A habit at any time just says its days ("every day"); a time shows when it has one.
        when={!event && timeWords(habit, false) === 'any time' ? daysWords(habit) : `${daysWords(habit)} · ${timeWords(habit, event)}`} />

      {bottom}

      {/* Drop hint while dragged (reactflow-theme.css). */}
      <div aria-hidden className="habit-lane-drophint"
        style={{ position: 'absolute', left: 0, right: 0, bottom: -22, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--acid-ink, var(--acid))', opacity: 0, transition: 'opacity 0.15s ease', pointerEvents: 'none' }}>
        <LineGlyph name="arrowDownRight" size={11} /> drop on a calendar day
      </div>

      {menuOpen && (
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
      )}
    </div>
  );
}
