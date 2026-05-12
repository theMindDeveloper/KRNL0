// HabitLaneNode — single-habit child card. Read-only pointer + edge surface.
//
// Reads the referenced habit from the mother HabitNode through the board
// store at render time. Display is fully derived; the lane stores only
// { habitId }. Click the ring to toggle today. Right-click invokes the
// per-habit context menu (rename / color / icon / delete).
//
// Edge wiring:
//   target left  ←  any upstream event → command 'habit.markDone'
//   source right →  emits 'habit.markedDone' on the round-trip in commandDispatch

import { useMemo, useState } from 'react';
import type { NodeProps } from '../types';
import type { HabitLaneConfig, HabitLaneState } from './types';
import type { Habit, HabitColor } from '../HabitNode/types';
import { calcStreak } from '../HabitNode/commands';
import {
  HABIT_COLORS,
  isoToLocalYMD,
  todayLocal,
  toYMD,
} from '../HabitNode/types';
import { useBoardStore } from '../../../store/boardStore';
import { HabitContextMenu } from '../HabitNode/HabitContextMenu';

const LANE_WIDTH = 280;
const LANE_HEIGHT = 120;
const SPARK_CELL = 8;
const SPARK_GAP = 1;
const RING_SIZE = 44;
const RING_STROKE = 4;

function isValidColor(c: unknown): c is HabitColor {
  return typeof c === 'string' && (HABIT_COLORS as readonly string[]).includes(c);
}

function habitColor(c: unknown): HabitColor {
  return isValidColor(c) ? c : 'acid';
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
  const days = node.config?.days ?? 28;

  // Build a small array of YMD for the sparkline ending at today.
  const window = useMemo(() => {
    const list: string[] = [];
    const base = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(base);
      d.setDate(base.getDate() - i);
      list.push(toYMD(d));
    }
    return list;
  }, [days]);

  if (!habit) {
    return (
      <div
        style={{
          width: LANE_WIDTH,
          minHeight: LANE_HEIGHT,
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
  const monthlyDone = window.filter((d) => logSet.has(d)).length;
  const monthlyPct = Math.round((monthlyDone / days) * 100);
  const createdYMD = isoToLocalYMD(habit.createdAt);

  // Stroke arc rendered as a circle with a dashoffset — minimal SVG.
  const circumference = 2 * Math.PI * (RING_SIZE / 2 - RING_STROKE);
  const offset = circumference * (1 - monthlyPct / 100);

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen({ x: e.clientX, y: e.clientY });
  };

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
      {/* Header row */}
      <div
        style={{
          padding: '6px 10px 5px',
          borderBottom: '1px solid var(--paper-3)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          color: 'var(--ink-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        <span style={{ color: `var(--${color})` }}>●</span>
        <span style={{ flex: 1 }}>HBT.LANE</span>
        <span style={{ color: streak > 0 ? 'var(--acid)' : 'var(--rust)' }}>
          {`▲ ${streak}d`}
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: '10px 12px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Ring */}
        <button
          type="button"
          aria-label={`${habit.name} today ${doneToday ? 'done' : 'not done'}`}
          aria-pressed={doneToday}
          onClick={() => onCommand('habit.lane.toggleToday')}
          style={{
            width: RING_SIZE,
            height: RING_SIZE,
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            flexShrink: 0,
            position: 'relative',
          }}
          title={`click to ${doneToday ? 'unmark' : 'mark'} today`}
        >
          <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
            {/* Track */}
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_SIZE / 2 - RING_STROKE}
              fill={doneToday ? `var(--${color})` : 'transparent'}
              stroke="var(--paper-3)"
              strokeWidth={RING_STROKE / 2}
            />
            {/* Monthly progress arc */}
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_SIZE / 2 - RING_STROKE}
              fill="transparent"
              stroke={`var(--${color})`}
              strokeWidth={RING_STROKE}
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
            />
          </svg>
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              fontWeight: 600,
              color: doneToday ? 'var(--ink)' : `var(--${color})`,
              pointerEvents: 'none',
            }}
          >
            {habit.icon ?? '●'}
          </div>
        </button>

        {/* Right side: name + stats + sparkline */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              color: 'var(--ink-2)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={habit.name}
          >
            {habit.name}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: 'var(--ink-4)',
              letterSpacing: '0.04em',
            }}
          >
            {`${monthlyPct}% · last ${days}d`}
          </div>
          <div
            data-sparkline
            style={{
              display: 'flex',
              gap: SPARK_GAP,
              flexWrap: 'nowrap',
              marginTop: 2,
            }}
          >
            {window.map((d) => {
              const isFuture = d > today; // will never happen here, but guard
              const isPast = d < today;
              const beforeCreated = d < createdYMD;
              const done = logSet.has(d);
              const classes = ['habit-cell'];
              if (done) classes.push('habit-cell--done');
              if (d === today) classes.push('habit-cell--today');
              if (isPast) classes.push('habit-cell--past');
              if (isFuture) classes.push('habit-cell--future');
              if (!isFuture) classes.push('habit-cell--interactive');
              if (beforeCreated) classes.push('habit-cell--past');
              return (
                <div
                  key={d}
                  className={classes.join(' ')}
                  style={{ width: SPARK_CELL, height: SPARK_CELL }}
                  title={`${habit.name} ${d}${done ? ' · done' : ''}`}
                />
              );
            })}
          </div>
        </div>
      </div>

      {menuOpen && (
        <HabitContextMenu
          habit={habit}
          anchor={{ x: 8, y: 8 }}
          bodyWidth={LANE_WIDTH - 16}
          bodyHeight={Math.max(LANE_HEIGHT, 180)}
          onRename={(name) => onCommand('habit.lane.rename', { name })}
          onSetColor={(color) => onCommand('habit.lane.setColor', { color })}
          onSetIcon={(icon) => onCommand('habit.lane.setIcon', { icon })}
          onDelete={() => onCommand('habit.lane.removeHabit')}
          onClose={() => setMenuOpen(null)}
        />
      )}
    </div>
  );
}
