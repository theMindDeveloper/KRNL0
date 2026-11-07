// HabitLaneNode — single-habit child card. Click ring to toggle today.
// Reads habit from mother HabitNode via board store. Stores only { habitId }.
//
// PR-wave-B (LifeOS UI refresh) — full visual upgrade to match the LifeOS
// HabitChildNode reference: header with kind+cadence, glyph tile, name,
// done tick, 7-day mini strip with the two-color trick, foot with streak
// and cadence text, drop-hint that fades in while dragging.

import { useEffect, useMemo, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { NodeProps } from '../types';
import type { HabitLaneConfig, HabitLaneState } from './types';
import type { Habit, HabitColor, HabitSchedule, IsoDow } from '../HabitNode/types';
import { calcStreak } from '../HabitNode/commands';
import { HABIT_COLORS, isDayScheduled, toYMD } from '../HabitNode/types';
import { useBoardStore } from '../../../store/boardStore';
import { useLocalDay } from '../../../hooks/useLocalDay';
import { HabitContextMenu } from '../HabitNode/HabitContextMenu';
import { HabitIcon } from '../HabitNode/HabitIcon';
import { saveBoard } from '../../../store/eventLog';
import { undoable } from '../../../store/undoNotice';
import { LineGlyph } from '../../ui/LineGlyph';

const LANE_WIDTH = 280;

function isValidColor(c: unknown): c is HabitColor {
  return typeof c === 'string' && (HABIT_COLORS as readonly string[]).includes(c);
}

function habitColor(c: unknown): HabitColor {
  return isValidColor(c) ? c : 'acid';
}

// Last 7 days ending at `today` (oldest first). Used to render the mini
// week strip on the card — Mon-style "rolling 7" rather than calendar week.
function lastSevenDays(today: string): string[] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!m) return [];
  const d0 = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const out: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(d0);
    dt.setDate(d0.getDate() - i);
    out.push(toYMD(dt));
  }
  return out;
}

// Render the cadence as a short tag for the header. Matches LifeOS' "DAILY",
// "TUE", "SET ↘ DAY" style. SET ↘ DAY is the "unscheduled" placeholder so
// the user knows there's no schedule yet.
function cadenceTag(schedule: HabitSchedule | null | undefined): string {
  if (!schedule) return 'SET A DAY';
  if (schedule.kind === 'daily') return 'DAILY';
  if (schedule.kind === 'weekdays') return 'WEEKDAYS';
  if (schedule.kind === 'weekly') {
    const names: Record<IsoDow, string> = { 1: 'MON', 2: 'TUE', 3: 'WED', 4: 'THU', 5: 'FRI', 6: 'SAT', 7: 'SUN' } as const;
    if (schedule.days.length === 1) return names[schedule.days[0]!] ?? 'WEEKLY';
    return 'WEEKLY';
  }
  return 'WEEKLY';
}

function cadenceFootText(schedule: HabitSchedule | null | undefined): string {
  if (!schedule) return 'unscheduled';
  if (schedule.kind === 'daily') return 'every day';
  if (schedule.kind === 'weekdays') return 'weekdays only';
  if (schedule.kind === 'weekly') {
    const names: Record<IsoDow, string> = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' } as const;
    if (schedule.days.length === 1) return `every ${names[schedule.days[0]!] ?? '?'}`;
    return `${schedule.days.length}×/week`;
  }
  return 'weekly';
}


// The 7-day strip uses the same rule as the tick button and the streak: no
// schedule means every day (it used to dim every day of an unscheduled habit
// while today stayed tickable).
const isHabitDay = (schedule: HabitSchedule | null | undefined, ymd: string): boolean =>
  isDayScheduled(schedule ?? undefined, ymd);

export function HabitLaneNode({
  node,
  onCommand,
}: NodeProps<HabitLaneState, HabitLaneConfig>) {
  const board = useBoardStore((s) => s.board);
  const [menuOpen, setMenuOpen] = useState<{ x: number; y: number } | null>(null);

  const habit: Habit | null = useMemo(() => {
    if (!board) return null;
    for (const n of board.nodes) {
      if (n.kind !== 'habit' || !n.isMother) continue;
      const s = n.state as { habits?: Habit[] } | null;
      // An archived habit is no longer tracked: its lane goes like a deleted one's.
      const h = s?.habits?.find((x) => x.id === node.state.habitId && !x.archived);
      if (h) return h;
    }
    return null;
  }, [board, node.state.habitId]);

  // Re-renders at local midnight, so a lane left open overnight moves on.
  const today = useLocalDay();
  const week = useMemo(() => lastSevenDays(today), [today]);

  const { getNodes } = useReactFlow();
  const onContextMenu = (e: React.MouseEvent) => {
    const selectedCount = getNodes().filter((n) => n.selected).length;
    if (selectedCount > 1) return;
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen({ x: e.clientX, y: e.clientY });
  };

  // If the underlying habit was deleted, this lane is an orphan — auto-clean
  // it instead of showing a "habit removed — delete this lane" placeholder
  // the user has to dismiss by hand. The lane node is non-mother, so
  // removeNode in the board store will accept it.
  // Cleanup is not a user action: no undo slot (undoing to it re-created the
  // orphan, which deleted itself again and cleared redo — a stuck undo), and
  // it is saved so the orphan doesn't come back from board.json.
  useEffect(() => {
    if (!board) return; // wait until store hydrates
    if (habit) return;
    useBoardStore.setState((s) => (s.board ? { board: { ...s.board, nodes: s.board.nodes.filter((n) => n.id !== node.id) } } : s));
    const next = useBoardStore.getState().board;
    if (next) void saveBoard(next);
  }, [board, habit, node.id]);
  if (!habit) {
    // Render nothing while the auto-cleanup useEffect fires on the next tick.
    return null;
  }

  const color = habitColor(habit.color);
  const logSet = new Set(habit.log);
  const doneToday = logSet.has(today);
  const scheduledToday = isDayScheduled((habit as { schedule?: HabitSchedule }).schedule, today);
  const cadence = (habit as { schedule?: HabitSchedule | null }).schedule ?? null;
  // Pass the schedule like HabitNode does, or a weekdays habit reads 0 on weekends.
  const streak = calcStreak(habit.log, today, cadence ?? undefined);
  const cadHeader = cadenceTag(cadence);
  const cadFoot = cadenceFootText(cadence);

  // Pull the lane sequence number from the node id suffix if present —
  // labels like "#01" / "#02" in the header give the cards an identity
  // even when the names are short.
  // Its place among the lanes (ids are uuids, whose trailing digits gave
  // random numbers like "#4821").
  const laneIndex = (board?.nodes ?? []).filter((n) => n.kind === 'habit.lane').findIndex((n) => n.id === node.id);
  const seqLabel = laneIndex >= 0 ? `#${String(laneIndex + 1).padStart(2, '0')}` : '';

  return (
    <div
      data-testid="habit-lane-root"
      onContextMenu={onContextMenu}
      style={{
        width: LANE_WIDTH,
        background: 'var(--node-bg)',
        border: '1px solid var(--paper-3)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-1)',
        overflow: 'hidden',
        position: 'relative',
        // Scope repaints to this card subtree so the 7-day strip and inner
        // elements don't bleed into surrounding layers during canvas pan.
        // 'style' excluded to preserve var(--habit-color) inheritance below.
        contain: 'layout paint',
        ['--habit-color' as string]: `var(--${color})`,
      } as React.CSSProperties}
    >
      {/* Header — HABIT · #NN · ↻ cadence */}
      <div
        style={{
          padding: '6px 10px',
          borderBottom: '1px solid var(--paper-3)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--ink-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: `var(--${color})`, display: 'inline-block' }} />
        <span>HABIT</span>
        {seqLabel && (
          <span style={{ color: 'var(--ink-2)' }}>{`· ${seqLabel}`}</span>
        )}
        <span style={{ marginLeft: 'auto', color: 'var(--ink-3)' }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ verticalAlign: '-0.1em', marginRight: 4 }}><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" /></svg>
          {cadHeader}
        </span>
      </div>

      {/* Body — glyph tile + name + done tick */}
      <div style={{ padding: '10px 12px 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Glyph tile — 28x28 dashed (LifeOS "graph paper" cue) */}
        <div
          aria-hidden
          style={{
            width: 28,
            height: 28,
            display: 'grid',
            placeItems: 'center',
            border: '1px dashed var(--paper-3)',
            borderRadius: 4,
            fontFamily: 'var(--font-mono)',
            fontSize: 14,
            color: `var(--${color})`,
            flexShrink: 0,
          }}
        >
          <HabitIcon icon={habit.icon} size={15} fallback="" />
        </div>

        {/* Name */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            color: 'var(--ink-1)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={habit.name}
        >
          {habit.name}
        </div>

        {/* Done-today tick — 22px circle. Inverts to filled-color on done. */}
        <button
          type="button"
          aria-label={`${habit.name} today ${doneToday ? 'done' : 'not done'}`}
          aria-pressed={doneToday}
          // Same rule as the Habit window: an unscheduled day can't be
          // ticked (the streak ignores it); an existing tick can be removed.
          disabled={!scheduledToday && !doneToday}
          onClick={() => onCommand('habit.lane.toggleToday')}
          title={!scheduledToday && !doneToday ? 'not scheduled today' : `click to ${doneToday ? 'unmark' : 'mark'} today`}
          style={{
            opacity: !scheduledToday && !doneToday ? 0.35 : 1,
            width: 22,
            height: 22,
            borderRadius: '50%',
            border: `1.5px solid var(--${color})`,
            background: doneToday ? `var(--${color})` : 'transparent',
            color: doneToday ? 'var(--ink)' : `var(--${color})`,
            cursor: !scheduledToday && !doneToday ? 'default' : 'pointer',
            display: 'grid',
            placeItems: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            lineHeight: 1,
            padding: 0,
            flexShrink: 0,
          }}
        >
          {doneToday ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg> : null}
        </button>
      </div>

      {/* Mini 7-day strip — last 7 days, last cell is today. */}
      <div
        style={{
          padding: '4px 12px 6px',
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 3,
        }}
      >
        {week.map((ymd) => {
          const done = logSet.has(ymd);
          const isToday = ymd === today;
          const isScheduled = isHabitDay(cadence, ymd);
          return (
            <div
              key={ymd}
              className={
                'habit-cell '
                + (done ? 'habit-cell--done ' : '')
                + (isToday ? 'habit-cell--today ' : '')
              }
              style={{
                height: 14,
                opacity: !isScheduled && !done ? 0.4 : 1,
              }}
              title={`${ymd}${done ? ' ✓' : ''}`}
            />
          );
        })}
      </div>

      {/* Foot — streak + cadence text */}
      <div
        style={{
          padding: '4px 12px 8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: '0.04em',
        }}
      >
        <span style={{ color: streak > 0 ? 'var(--acid-ink, var(--acid))' : 'var(--ink-3)', fontWeight: streak > 0 ? 600 : 400 }}>
          {streak > 0 ? <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden style={{ verticalAlign: '-0.1em', marginRight: 4 }}><path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.6 3-5.3 3.6-8.8 2.6 1.4 4 3.6 4.1 5.6 1-.6 1.6-1.7 1.8-3 1.9 1.6 3.5 3.8 3.5 6.3 0 3.5-2.6 6.1-6.5 6.1z" /></svg>{streak}d streak</> : 'no streak'}
        </span>
        <span style={{ color: 'var(--ink-3)' }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ verticalAlign: '-0.1em', marginRight: 4 }}><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" /></svg>
          {cadFoot}
        </span>
      </div>

      {/* Drop hint — fades in while the lane is being dragged. Wired by
          .react-flow__node.dragging.krnl-kind-habit--lane in
          reactflow-theme.css (PR6a). */}
      <div
        aria-hidden
        className="habit-lane-drophint"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: -22,
          textAlign: 'center',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--acid-ink, var(--acid))',
          opacity: 0,
          transition: 'opacity 0.15s ease',
          pointerEvents: 'none',
        }}
      >
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
          onDelete={() => undoable(`Deleted habit "${habit.name}"`, () => onCommand('habit.lane.removeHabit'))}
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
