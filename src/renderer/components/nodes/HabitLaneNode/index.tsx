// HabitLaneNode — single-habit child card. Click ring to toggle today.
// Reads habit from mother HabitNode via board store. Stores only { habitId }.
//
// PR-wave-B (LifeOS UI refresh) — full visual upgrade to match the LifeOS
// HabitChildNode reference: header with kind+cadence, glyph tile, name,
// done tick, 7-day mini strip with the two-color trick, foot with streak
// and cadence text, drop-hint that fades in while dragging.

import { useMemo, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { NodeProps } from '../types';
import type { HabitLaneConfig, HabitLaneState } from './types';
import type { Habit, HabitColor, HabitSchedule, IsoDow } from '../HabitNode/types';
import { calcStreak } from '../HabitNode/commands';
import { HABIT_COLORS, todayLocal, toYMD } from '../HabitNode/types';
import { useBoardStore } from '../../../store/boardStore';
import { HabitContextMenu } from '../HabitNode/HabitContextMenu';

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
  if (!schedule) return 'SET ↘ DAY';
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

// JS getDay() (Sun=0) → ISO (Mon=1..Sun=7)
function jsDowToIso(d: number): IsoDow {
  return (d === 0 ? 7 : d) as IsoDow;
}

function isHabitDay(schedule: HabitSchedule | null | undefined, ymd: string): boolean {
  if (!schedule) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return false;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const iso = jsDowToIso(dt.getDay());
  if (schedule.kind === 'daily') return true;
  if (schedule.kind === 'weekdays') return iso >= 1 && iso <= 5;
  if (schedule.kind === 'weekly') return schedule.days.includes(iso);
  return false;
}

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
      const h = s?.habits?.find((x) => x.id === node.state.habitId);
      if (h) return h;
    }
    return null;
  }, [board, node.state.habitId]);

  const today = todayLocal();
  const week = useMemo(() => lastSevenDays(today), [today]);

  const { getNodes } = useReactFlow();
  const onContextMenu = (e: React.MouseEvent) => {
    const selectedCount = getNodes().filter((n) => n.selected).length;
    if (selectedCount > 1) return;
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen({ x: e.clientX, y: e.clientY });
  };

  if (!habit) {
    return (
      <div
        style={{
          width: LANE_WIDTH,
          background: 'var(--node-bg)',
          border: '1px dashed var(--paper-3)',
          borderRadius: 'var(--radius-lg)',
          padding: 12,
          color: 'var(--ink-3)',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.04em',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ color: 'var(--rust)' }}>●</span>
        <span>habit removed — delete this lane</span>
      </div>
    );
  }

  const color = habitColor(habit.color);
  const logSet = new Set(habit.log);
  const doneToday = logSet.has(today);
  const streak = calcStreak(habit.log, today);
  const cadence = (habit as { schedule?: HabitSchedule | null }).schedule ?? null;
  const cadHeader = cadenceTag(cadence);
  const cadFoot = cadenceFootText(cadence);

  // Pull the lane sequence number from the node id suffix if present —
  // labels like "#01" / "#02" in the header give the cards an identity
  // even when the names are short.
  const seqMatch = /(\d+)$/.exec(node.id);
  const seqLabel = seqMatch ? `#${seqMatch[1]!.padStart(2, '0')}` : '';

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
          fontSize: 10,
          color: 'var(--ink-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        <span style={{ color: `var(--${color})`, fontSize: 11 }}>●</span>
        <span>HABIT</span>
        {seqLabel && (
          <span style={{ color: 'var(--ink-2)' }}>{`· ${seqLabel}`}</span>
        )}
        <span style={{ marginLeft: 'auto', color: 'var(--ink-3)' }}>
          {'↻ '}
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
          {habit.icon ?? '▲'}
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
          onClick={() => onCommand('habit.lane.toggleToday')}
          title={`click to ${doneToday ? 'unmark' : 'mark'} today`}
          style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            border: `1.5px solid var(--${color})`,
            background: doneToday ? `var(--${color})` : 'transparent',
            color: doneToday ? 'var(--ink)' : `var(--${color})`,
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            lineHeight: 1,
            padding: 0,
            flexShrink: 0,
          }}
        >
          {doneToday ? '✓' : ''}
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
          fontSize: 9,
          letterSpacing: '0.04em',
        }}
      >
        <span style={{ color: streak > 0 ? 'var(--rust)' : 'var(--ink-4)' }}>
          {streak > 0 ? `▲ ${streak}d streak` : 'no streak'}
        </span>
        <span style={{ color: 'var(--ink-3)' }}>
          {'↻ '}
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
          fontSize: 9,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--acid)',
          opacity: 0,
          transition: 'opacity 0.15s ease',
          pointerEvents: 'none',
        }}
      >
        {'↘ drop on a calendar day'}
      </div>

      {menuOpen && (
        <HabitContextMenu
          habit={habit}
          anchor={menuOpen}
          onRename={(name) => onCommand('habit.lane.rename', { name })}
          onSetColor={(c) => onCommand('habit.lane.setColor', { color: c })}
          onSetIcon={(icon) => onCommand('habit.lane.setIcon', { icon })}
          onDelete={() => onCommand('habit.lane.removeHabit')}
          onClose={() => setMenuOpen(null)}
        />
      )}
    </div>
  );
}
